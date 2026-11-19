// Step 6.4 e2e (SPEC-AP-001 F-AP-02, F-AP-05, CS-ACCESSIBLE-UI): visual regression. Eight screens, each at 320, 390,
// 768, 1024, 1280 and 1440 px in light and dark, with seeded data (the real API router and local Supabase behind it) and
// a frozen browser clock, so the pictures never change by themselves. Each shot also checks that the page does not
// scroll sideways (WCAG 1.4.10 reflow). Baselines live in visual.spec.ts-snapshots/ (local, gitignored) and are approved by reading them:
// `npx playwright test e2e/visual.spec.ts --update-snapshots` rewrites them, so look at the diff before committing.
// The stats numbers are computed by the server from its own clock, so that screen is served a fixed response that
// agrees with the frozen date (the server's own calculation is covered by the API integration tests).
import type { InventoryItem, StatsOverview, WasteEntry } from '@chatchiu/contracts'
import type { Page } from '@playwright/test'
import { startApiServer, type ApiServer } from './support/api-server'
import { call, isoDay, routeApi, seedKitchen, type Kitchen } from './support/kitchen'
import {
  authStorageKey,
  createAccount,
  signInRest,
  supabaseEnv,
  type TokenSet,
} from './support/supabase'
import { expect, test } from './support/test'

// The baselines (visual.spec.ts-snapshots/) are kept on the developer's machine and are not committed (.gitignore), so a
// fresh checkout and CI have none: this suite runs locally only. Locally, the first run on a new checkout writes them
// (and fails once); run it again to compare.
test.skip(!!process.env.CI, 'visual baselines are local only (not committed)')

let api: ApiServer
let kitchen: Kitchen
let session: TokenSet

// Its own account, not the worker's shared one: other specs leave categories, preferences and locations behind, and
// those would show up in these pictures.
test.use({ signedIn: false })

// A day in the past, so the seeded session never looks expired to the browser, frozen at midday UTC.
const FROZEN_NOW = new Date('2026-01-15T12:00:00Z')

test.beforeAll(async () => {
  api = await startApiServer('visual.spec')
  const account = await createAccount()
  session = await signInRest(account)
  kitchen = await seedKitchen(api, account, { today: FROZEN_NOW, categoryName: 'Dairy' })
  await call(api, account, 'POST', '/api/meal-plans', {
    planDate: isoDay(1, FROZEN_NOW),
    mealType: 'dinner',
    mealName: 'Tomato pasta',
  })
})
test.afterAll(async () => {
  await api.close()
})

/** Tighter than the config's 1 %: a one-line text change on a tall page must show. */
const MAX_DIFF_RATIO = 0.002

const SIZES = [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const
const THEMES = ['light', 'dark'] as const

type Screen = {
  /** Served the fixed stats response (see statsFixture) instead of the server's own calculation. */
  mock?: boolean
  name: string
  path: (k: Kitchen) => string
  ready: (page: Page) => ReturnType<Page['locator']>
}
const SCREENS: Screen[] = [
  {
    name: 'board',
    path: () => '/',
    ready: (p) => p.getByRole('button', { name: /^Open Milk\b/ }),
  },
  {
    name: 'board-panel',
    path: (k) => `/?item=${k.milkId}`,
    ready: (p) => p.getByRole('dialog'),
  },
  {
    name: 'stock',
    path: () => '/stock',
    ready: (p) => p.getByRole('button', { name: /^Open Rice\b/ }),
  },
  { name: 'shopping', path: () => '/shopping', ready: (p) => p.getByText('Eggs', { exact: true }) },
  { name: 'meals', path: () => '/meals', ready: (p) => p.getByText('Tomato pasta').first() },
  {
    name: 'stats',
    path: () => '/stats',
    ready: (p) => p.getByRole('group', { name: 'Most wasted by count' }).getByText('Bread'),
    mock: true,
  },
  {
    name: 'settings',
    path: () => '/settings',
    ready: (p) => p.getByRole('region', { name: 'Locations' }).getByText('Fridge'),
  },
  {
    name: 'add-item',
    path: () => '/stock/new',
    ready: (p) => p.getByRole('button', { name: 'Save item' }),
  },
]

const stockItem = (
  id: number,
  name: string,
  locationId: number,
  quantity: number,
): InventoryItem => ({
  id,
  userId: 'visual',
  name,
  categoryId: 1,
  quantity: 10,
  unit: 'L',
  purchaseDate: null,
  expirationDate: '2026-01-17',
  locationId,
  price: null,
  notes: null,
  notificationEnabled: true,
  notificationDaysBefore: 3,
  barcode: null,
  initialQuantity: 10,
  currentQuantity: quantity,
  usageNotes: null,
  lowStockThreshold: null,
  lastNotifiedAt: null,
  createdAt: '2026-01-14T09:00:00Z',
  updatedAt: '2026-01-14T09:00:00Z',
})

/** What the server would answer on the frozen day for the seeded kitchen plus a little waste history. */
function statsFixture(range: StatsOverview['range']): StatsOverview {
  const wasted = [
    { itemName: 'Bread', timesWasted: 2, totalValue: 4.5 },
    { itemName: 'Cheese', timesWasted: 1, totalValue: 2.9 },
  ]
  return {
    range,
    stock: { totalItems: 2, totalValue: 0, expiringCount: 1, expiredCount: 0 },
    byCategory: [{ categoryId: 1, category: 'Dairy', count: 2, value: 0 }],
    byLocation: [
      { locationId: 1, location: 'Fridge', count: 1 },
      { locationId: 2, location: 'Pantry', count: 1 },
    ],
    recentlyAdded: [stockItem(2, 'Rice', 2, 1), stockItem(1, 'Milk', 1, 10)],
    waste: {
      totalItems: 3,
      totalValue: 7.4,
      last30dCount: 3,
      last30dValue: 7.4,
      byMonth: [
        { month: '2025-12', itemsWasted: 1, valueLost: 2.4 },
        { month: '2026-01', itemsWasted: 2, valueLost: 5 },
      ],
      byCategory: [{ categoryId: 1, categoryName: 'Dairy', itemsWasted: 3, valueLost: 7.4 }],
      mostWastedByCount: wasted,
      mostWastedByValue: wasted,
    },
    lowStock: [
      {
        id: 2,
        name: 'Rice',
        unit: 'L',
        categoryId: 1,
        currentQuantity: 1,
        initialQuantity: 10,
        percentLeft: 10,
        lowStockThreshold: 20,
        avgDailyUse: 0.25,
        runOutDate: '2026-01-19',
      },
    ],
  }
}

const WASTE_LOG: WasteEntry[] = [
  ['Bread', 2, 2.25, '2026-01-12'],
  ['Cheese', 1, 2.9, '2026-01-10'],
  ['Bread', 1, 2.25, '2025-12-20'],
].map(([name, quantity, price, date], i) => ({
  id: i + 1,
  userId: 'visual',
  itemName: String(name),
  categoryId: 1,
  categoryName: 'Dairy',
  quantity: Number(quantity),
  unit: 'pc',
  price: Number(price),
  wastedDate: String(date),
}))

async function mockStats(page: Page) {
  await page.route('**/api/stats/overview**', (route) => {
    const range = (new URL(route.request().url()).searchParams.get('range') ??
      'all') as StatsOverview['range']
    return route.fulfill({ json: { data: statsFixture(range) } })
  })
  await page.route('**/api/waste', (route) => route.fulfill({ json: { data: WASTE_LOG } }))
}

/** The api calls that failed: a screenshot of an error screen must never become a baseline. */
function watchApiFailures(page: Page): string[] {
  const failures: string[] = []
  page.on(
    'requestfailed',
    (r) => r.url().includes('/api/') && failures.push(`${r.method()} ${r.url()}`),
  )
  page.on('response', (r) => {
    if (r.url().includes('/api/') && !r.ok()) failures.push(`${r.status()} ${r.url()}`)
  })
  return failures
}

/** The page's height has stopped changing (late content, fonts and lists have all arrived). */
async function stableHeight(page: Page): Promise<number> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  const EQUAL_READS = 3
  let last = -1
  let equal = 0
  await expect
    .poll(
      async () => {
        const now = await page.evaluate(() => document.documentElement.scrollHeight)
        equal = now === last ? equal + 1 : 0
        last = now
        return equal >= EQUAL_READS
      },
      { intervals: [150] },
    )
    .toBe(true)
  return last
}

/** Entry animations and the panel's slide must be over before a picture is taken. */
const settle = (page: Page) =>
  page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )

for (const theme of THEMES) {
  for (const size of SIZES) {
    test.describe(`${theme} · ${size.width}px`, () => {
      test.use({
        viewport: { width: size.width, height: size.height },
        colorScheme: theme,
        locale: 'en-US',
        timezoneId: 'UTC',
        serviceWorkers: 'block',
      })

      for (const screen of SCREENS) {
        test(`${screen.name}`, async ({ page, context }) => {
          await context.addInitScript<[string, string]>(
            ([k, v]) => window.localStorage.setItem(k, v),
            [authStorageKey(supabaseEnv().url), JSON.stringify(session)],
          )
          await routeApi(context, api)
          if (screen.mock) await mockStats(page)
          const failures = watchApiFailures(page)
          await page.clock.setFixedTime(FROZEN_NOW)
          await page.goto(screen.path(kitchen))
          await expect(screen.ready(page).first()).toBeVisible()
          // A full-page capture puts fixed bars (the phone's bottom nav, the tablet rail) at the viewport's edge, in the
          // middle of the picture: size the viewport to the whole page instead, so they sit where they really do.
          const fullHeight = await stableHeight(page)
          await page.setViewportSize({
            width: size.width,
            height: Math.max(size.height, fullHeight),
          })
          await stableHeight(page) // the taller viewport can change the layout once more
          await settle(page)
          expect(failures, 'an api call failed while the page loaded').toEqual([])
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            'the page scrolls sideways',
          ).toBe(true)
          await expect(page).toHaveScreenshot(`${screen.name}-${theme}-${size.width}.png`, {
            maxDiffPixelRatio: MAX_DIFF_RATIO,
          })
        })
      }
    })
  }
}
