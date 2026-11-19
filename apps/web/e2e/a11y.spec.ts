// Step 6.2 e2e (SPEC-AP-001, constitution CS-ACCESSIBLE-UI): axe on every screen at tablet and phone
// size in both themes (no serious or critical violation, WCAG 2.2 AA), and a keyboard-only run of the
// board: reach a row, open its panel, change the usage with the arrow keys, Undo from the toast.
// Scope: axe's serious and critical findings fail the run (the roadmap criterion); moderate and minor ones are
// deliberately not asserted here. Things axe cannot judge (reading order, a screen reader's speech) are the
// manual checks in the roadmap.
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { startApiServer, type ApiServer } from './support/api-server'
import { seedKitchen, routeApi, type Kitchen } from './support/kitchen'
import { expect, test } from './support/test'

let api: ApiServer
test.beforeAll(async () => {
  api = await startApiServer('a11y.spec')
})
test.afterAll(async () => {
  await api.close()
})

const THEMES = ['light', 'dark'] as const
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const BLOCKING = new Set(['serious', 'critical'])

type Screen = {
  name: string
  path: (k: Kitchen) => string
  ready?: (page: Page) => Locator
  /** Puts the screen in the state to check (a form with errors, a section expanded), after it is ready. */
  prepare?: (page: Page) => Promise<void>
  /** Shown once `prepare` has run. */
  prepared?: (page: Page) => Locator
}
const SCREENS: Screen[] = [
  { name: 'board', path: () => '/', ready: (p) => p.getByRole('button', { name: 'Open Milk' }) },
  {
    name: 'board with the item panel',
    path: (k) => `/?item=${k.milkId}`,
    ready: (p) => p.getByRole('dialog'),
  },
  {
    name: 'stock',
    path: () => '/stock',
    ready: (p) => p.getByRole('button', { name: /^Open Rice\b/ }),
  },
  { name: 'shopping', path: () => '/shopping', ready: (p) => p.getByText('Eggs', { exact: true }) },
  { name: 'meals', path: () => '/meals' },
  { name: 'stats', path: () => '/stats' },
  {
    name: 'settings',
    path: () => '/settings',
    ready: (p) => p.getByRole('region', { name: 'Locations' }).getByText('Fridge'),
  },
  { name: 'more', path: () => '/more' },
  // States rather than pages (7.0.38a): what a screen shows after she acts.
  {
    name: 'panel with Restock and an exact amount open',
    path: (k) => `/?item=${k.milkId}`,
    ready: (p) => p.getByRole('dialog'),
    prepare: async (p) => {
      await p.getByRole('button', { name: 'Restock' }).click()
      await p.getByRole('button', { name: 'Enter an exact amount' }).click()
    },
    prepared: (p) => p.getByRole('button', { name: 'Enter an exact amount' }),
  },
  {
    name: 'settings with a form error',
    path: () => '/settings',
    ready: (p) => p.getByRole('region', { name: 'Locations' }).getByText('Fridge'),
    prepare: (p) => p.getByRole('button', { name: 'Add location' }).click(),
    prepared: (p) => p.getByText('Enter a name for the location.').first(),
  },
  {
    name: 'item form with errors',
    path: () => '/stock/new',
    ready: (p) => p.getByRole('button', { name: 'Save item' }),
    prepare: (p) => p.getByRole('button', { name: 'Save item' }).click(),
    prepared: (p) => p.getByRole('alert').first(),
  },
  { name: 'add an item', path: () => '/stock/new' },
  { name: 'scan a receipt', path: () => '/scan' },
]

async function violationsOf(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
  return violations
    .filter((v) => BLOCKING.has(v.impact ?? ''))
    .map((v) => ({
      rule: v.id,
      impact: v.impact,
      nodes: v.nodes
        .slice(0, 4)
        .map((n) => `${n.target.join(' ')} :: ${n.failureSummary?.split('\n')[1] ?? ''}`),
    }))
}

for (const theme of THEMES) {
  test.describe(`axe · ${theme}`, () => {
    test.use({ colorScheme: theme })
    for (const screen of SCREENS) {
      test(`${screen.name} has no serious or critical violation`, async ({
        page,
        context,
        account,
      }) => {
        const kitchen = await seedKitchen(api, account)
        await routeApi(context, api)
        await page.goto(screen.path(kitchen))
        await expect(
          (screen.ready?.(page) ?? page.getByRole('heading').first()).first(),
        ).toBeVisible()
        if (screen.prepare) {
          await screen.prepare(page)
          await expect(screen.prepared!(page)).toBeVisible()
        }
        // Entry animations and the panel's slide must have finished before contrast is measured.
        await page.evaluate(() =>
          Promise.all(
            document
              .getAnimations()
              // A looping animation (a spinner) never finishes; a cancelled one rejects: neither blocks the scan.
              .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
              .map((a) => a.finished.catch(() => undefined)),
          ),
        )
        expect(await violationsOf(page)).toEqual([])
      })
    }
  })
}

test('F-AP-02 / CS-ACCESSIBLE-UI: the board works with the keyboard alone', async ({
  page,
  context,
  account,
}) => {
  const kitchen = await seedKitchen(api, account)
  await routeApi(context, api)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Open Milk' })).toBeVisible()

  // Tab reaches the first row's Open button, and Enter opens the panel with focus inside it.
  const open = page.getByRole('button', { name: 'Open Milk' })
  for (let i = 0; i < 40 && !(await open.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab')
  }
  await expect(open).toBeFocused()
  await page.keyboard.press('Enter')
  const panel = page.getByRole('dialog')
  await expect(panel).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`item=${kitchen.milkId}`))
  expect(await panel.evaluate((el) => el.contains(document.activeElement))).toBe(true)

  // Escape closes it and focus returns to the row that opened it.
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(open).toBeFocused()

  // Tab on to Milk's usage slider: arrows lower it by one step each, then it saves once with Undo.
  await page.keyboard.press('Tab')
  const slider = page.getByRole('slider', { name: /How much Milk is left/ })
  await expect(slider).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
  // While a toast shows on a phone, a row focused with the keyboard scrolls clear of the toast stack (7.0.25).
  // From 768 px the toasts float at the bottom of the page and the bottom bar is gone, so no padding is needed
  // (7.0.38d: the clearance applies below 768 px only).
  const { padding, narrow } = await page.evaluate(() => ({
    padding: parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom),
    narrow: window.matchMedia('(width < 768px)').matches,
  }))
  if (narrow) expect(padding).toBeGreaterThanOrEqual(200)
  else expect(Number.isNaN(padding) || padding < 200).toBe(true)

  // Alt+Shift+T reaches the toast, Enter on Undo restores the level, and no mouse was used.
  await page.keyboard.press('Alt+Shift+T')
  await expect(page.getByRole('button', { name: 'Undo' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(slider).toHaveValue('100')
})
