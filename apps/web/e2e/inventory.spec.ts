// Step 5.4 e2e (SPEC-IN-001) in a real browser with the real API router and local Supabase: the page is a
// table on the tablet and cards on the phone, 250 items render only a window of rows and scrolling
// reaches the last one, filters in the URL survive opening an item and Back, one bulk DELETE removes the
// selected items after the Undo window, and the page never scrolls sideways.
import type { BrowserContext, Page } from '@playwright/test'
import { startApiServer, type ApiServer } from './support/api-server'
import { signInRest, type Account } from './support/supabase'
import { expect, test } from './support/test'

let api: ApiServer
test.beforeAll(async () => {
  api = await startApiServer('inventory.spec')
})
test.afterAll(async () => {
  await api.close()
})

const BULK_CREATE_MAX = 200
const HOLD_WINDOW_MS = 8_000

type Item = { id: number; name: string }

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

/** The local calendar date `offset` days from today, as the app counts it. */
const isoDay = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toLocaleDateString('en-CA')

async function seed(account: Account, count: number) {
  const items = await call<{ id: number }[]>(account, 'GET', '/api/inventory')
  if (items.length > 0) {
    for (let i = 0; i < items.length; i += BULK_CREATE_MAX) {
      await call(account, 'DELETE', '/api/inventory/bulk', {
        ids: items.slice(i, i + BULK_CREATE_MAX).map((item) => item.id),
      })
    }
  }
  const locations = await call<{ id: number }[]>(account, 'GET', '/api/locations')
  for (const location of locations) await call(account, 'DELETE', `/api/locations/${location.id}`)
  const category = await call<{ id: number }>(account, 'POST', '/api/categories', {
    name: `Goods ${crypto.randomUUID().slice(0, 6)}`,
  })
  const location = await call<{ id: number }>(account, 'POST', '/api/locations', { name: 'Pantry' })
  const rows = Array.from({ length: count }, (_, i) => ({
    name: `Item ${String(i + 1).padStart(3, '0')}`,
    categoryId: category.id,
    locationId: location.id,
    quantity: 1,
    unit: 'piece',
    initialQuantity: 1,
    currentQuantity: 1,
    // Every tenth item expires tomorrow: 25 of 250 are "expiring".
    expirationDate: isoDay(i % 10 === 0 ? 1 : 60),
  }))
  for (let i = 0; i < rows.length; i += BULK_CREATE_MAX) {
    await call(account, 'POST', '/api/inventory/bulk', {
      items: rows.slice(i, i + BULK_CREATE_MAX),
    })
  }
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

const rows = (page: Page) => page.getByRole('button', { name: /^Open Item/ })
const SHOTS = process.env.E2E_SHOTS

test('F-IN-05 / F-IN-06: Shelves (no table) at both sizes; 250 items render a window and scrolling reaches the last', async ({
  page,
  context,
  account,
}, info) => {
  await seed(account, 250)
  await routeApi(context)
  await page.goto('/stock?sort=name')
  await expect(rows(page).first()).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)
  expect(await rows(page).count()).toBeLessThan(80)
  await expect(page.getByText(/^250 items ·/)).toBeVisible()

  // Scroll the page to its end in steps (the virtual window follows).
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 4000)
    if (await page.getByRole('button', { name: 'Open Item 250' }).isVisible()) break
    await page.waitForTimeout(50)
  }
  await expect(page.getByRole('button', { name: 'Open Item 250' })).toBeVisible()
  expect(await rows(page).count()).toBeLessThan(80)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  if (SHOTS) {
    await page.evaluate(() => window.scrollTo(0, 0))
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.screenshot({ path: `${SHOTS}/stock-${info.project.name}-${scheme}.png` })
    }
  }
})

test('F-IN-02 / NC-IN-NO-LOST-FILTERS / F-IN-14: filters in the URL survive opening an item, Back and a reload, and come back on the next visit', async ({
  page,
  context,
  account,
}) => {
  await seed(account, 30)
  await routeApi(context)
  await page.goto('/stock?status=expiring&sort=name')
  await expect(page.getByRole('button', { name: /Expiring soon/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(rows(page)).toHaveCount(3) // items 1, 11 and 21 expire tomorrow
  await rows(page).first().click()
  await expect(page).toHaveURL(/item=\d+/)
  await expect(page).toHaveURL(/status=expiring/)
  await page.goBack()
  await expect(page).not.toHaveURL(/item=/)
  await expect(page).toHaveURL(/status=expiring/)
  await page.reload()
  await expect(rows(page)).toHaveCount(3)

  // The next visit from the nav, with no params, restores the last filters.
  await page.goto('/')
  await page.goto('/stock')
  await expect(page).toHaveURL(/status=expiring/)
  await expect(rows(page)).toHaveCount(3)
})

test('F-IN-10 / NC-IN-ONE-REQUEST: Delete selected sends one bulk DELETE after the Undo window', async ({
  page,
  context,
  account,
}) => {
  await seed(account, 12)
  await routeApi(context)
  const bulkDeletes: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'DELETE') bulkDeletes.push(new URL(request.url()).pathname)
  })
  await page.goto('/stock?sort=name')
  await expect(rows(page).first()).toBeVisible()
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  for (const n of ['001', '002', '003', '004']) {
    await page.getByRole('checkbox', { name: `Select Item ${n}` }).check()
  }
  await page.getByRole('button', { name: 'Delete selected (4)' }).click()
  await expect(page.getByRole('button', { name: 'Open Item 001' })).toHaveCount(0)
  expect(bulkDeletes).toEqual([]) // nothing sent inside the Undo window
  await expect
    .poll(async () => (await call<Item[]>(account, 'GET', '/api/inventory')).length, {
      timeout: HOLD_WINDOW_MS,
    })
    .toBe(8)
  expect(bulkDeletes).toEqual(['/api/inventory/bulk'])
})

test('F-IN-07 / F-IN-09: the Expired and Expiring counters filter, and tapping a row opens the panel', async ({
  page,
  context,
  account,
}) => {
  await seed(account, 30)
  await routeApi(context)
  await page.goto('/stock')
  await expect(page.getByRole('button', { name: /Expiring soon/ })).toContainText('3')
  await page.getByRole('button', { name: /Expiring soon/ }).click()
  await expect(rows(page)).toHaveCount(3)
  await rows(page).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Edit all details' })).toBeVisible()
})
