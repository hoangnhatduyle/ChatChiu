// Step 5.7 e2e (SPEC-ST-001) in a real browser with the real API router and local Supabase: the totals and
// charts follow the waste the server holds (6 × 0.40 and 1 × 3.00 = 2 items, $5.40), the range filter
// narrows the log, a held delete is sent after the Undo window, and the page never scrolls sideways.
import type { BrowserContext } from '@playwright/test'
import { startApiServer, type ApiServer } from './support/api-server'
import { signInRest, type Account } from './support/supabase'
import { expect, test } from './support/test'

let api: ApiServer
test.beforeAll(async () => {
  api = await startApiServer('stats.spec')
})
test.afterAll(async () => {
  await api.close()
})

const HOLD_WINDOW_MS = 8_000
const DAY_MS = 86_400_000
type Entry = { id: number; itemName: string }

async function call<T>(account: Account, method: string, path: string, body?: unknown): Promise<T> {
  const { access_token } = await signInRest(account)
  const res = await fetch(`${api.baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`)
  const text = await res.text()
  return (text ? (JSON.parse(text) as { data: T }).data : undefined) as T
}
const serverWaste = (account: Account) => call<Entry[]>(account, 'GET', '/api/waste')

/** Two entries from this week and one from 90 days ago, so the Month range leaves two. */
async function seed(account: Account) {
  for (const old of await serverWaste(account))
    await call(account, 'DELETE', `/api/waste/${old.id}`)
  const categories = await call<{ id: number; name: string }[]>(account, 'GET', '/api/categories')
  let dairy = categories.find((c) => c.name === 'Dairy stats')
  if (!dairy) dairy = await call(account, 'POST', '/api/categories', { name: 'Dairy stats' })
  const ago = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString()
  const entries = [
    {
      itemName: 'Eggs',
      categoryId: dairy!.id,
      quantity: 6,
      unit: 'pcs',
      price: 0.4,
      wastedDate: ago(2),
    },
    {
      itemName: 'Cheese',
      categoryId: dairy!.id,
      quantity: 1,
      unit: 'kg',
      price: 3,
      wastedDate: ago(3),
    },
    {
      itemName: 'Old bread',
      categoryId: dairy!.id,
      quantity: 1,
      unit: 'pcs',
      price: 2,
      wastedDate: ago(90),
    },
  ]
  for (const entry of entries) await call(account, 'POST', '/api/waste', entry)
}

async function routeApi(context: BrowserContext) {
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    try {
      const response = await route.fetch({ url: `${api.baseUrl}${url.pathname}${url.search}` })
      await route.fulfill({ response })
    } catch {
      // The test ended while this request was still in flight: nothing is left to answer.
    }
  })
}

const SHOTS = process.env.E2E_SHOTS
const stat = (page: import('@playwright/test').Page, label: string) =>
  page.getByText(label, { exact: true }).locator('xpath=..')

test('F-ST-01 / F-ST-02 / F-ST-03: the log, the Month range and the totals follow the server; delete sends after the Undo window', async ({
  page,
  context,
  account,
}) => {
  await seed(account)
  await routeApi(context)
  await page.goto('/stats')
  // The log is a dialog opened from the Waste heading's button.
  const log = page.getByRole('dialog', { name: 'Waste log' })
  await page.getByRole('button', { name: 'Waste log' }).click()
  await expect(log.getByText('Old bread')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(stat(page, 'Items wasted')).toContainText('3')
  await expect(stat(page, 'Value lost')).toContainText('$7.40')

  await page.getByRole('radio', { name: 'Month' }).click()
  await expect(stat(page, 'Items wasted')).toContainText('2')
  await expect(stat(page, 'Value lost')).toContainText('$5.40')
  await expect(page).toHaveURL(/range=month/)
  await page.getByRole('button', { name: 'Waste log' }).click()
  await expect(log.getByText('Old bread')).toHaveCount(0)

  await page.getByRole('button', { name: /^Delete Eggs, / }).click()
  await expect(log.getByText('Eggs')).toHaveCount(0)
  expect((await serverWaste(account)).map((e) => e.itemName).sort()).toEqual([
    'Cheese',
    'Eggs',
    'Old bread',
  ])
  await expect
    .poll(async () => (await serverWaste(account)).map((e) => e.itemName).sort(), {
      timeout: HOLD_WINDOW_MS,
    })
    .toEqual(['Cheese', 'Old bread'])
  // The totals are the server's: they are read again once the delete has been saved.
  await page.keyboard.press('Escape')
  await expect(stat(page, 'Items wasted')).toContainText('1')
  await expect(stat(page, 'Value lost')).toContainText('$3.00')
})

test('F-ST-04 / F-ST-07: the charts and most wasted lists show; no sideways scroll; screenshots', async ({
  page,
  context,
  account,
}, info) => {
  await seed(account)
  await routeApi(context)
  await page.goto('/stats')
  await expect(page.getByRole('figure', { name: 'Waste by month' })).toBeVisible()
  await expect(page.getByRole('figure', { name: 'Waste by category' })).toBeVisible()
  await expect(
    page.getByRole('group', { name: 'Most wasted by value' }).getByText('Cheese'),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page
    .getByRole('figure', { name: 'Waste by month' })
    .getByRole('button', { name: /table/i })
    .click()
  await expect(
    page.getByRole('figure', { name: 'Waste by month' }).getByRole('table'),
  ).toBeVisible()
  if (SHOTS) {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.screenshot({
        path: `${SHOTS}/stats-${info.project.name}-${scheme}.png`,
        fullPage: true,
      })
    }
  }
})
