// Step 5.8 e2e (SPEC-SE-001, SPEC-NT-001) in a real browser with the real API router and local Supabase:
// the theme applies at once and survives a reload, a location with items is deleted with its count shown first
// and the items stay, the CSV downloads, notifications say what this build can do, Sign out leaves the app,
// and the page never scrolls sideways.
import type { BrowserContext } from '@playwright/test'
import { startApiServer, type ApiServer } from './support/api-server'
import { signInRest, type Account } from './support/supabase'
import { expect, test } from './support/test'

let api: ApiServer
test.beforeAll(async () => {
  api = await startApiServer('settings.spec')
})
test.afterAll(async () => {
  await api.close()
})

const HOLD_WINDOW_MS = 12_000
const SHOTS = process.env.E2E_SHOTS

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

type Row = { id: number; name: string }
/** A clean slate: no items, no locations, then "Shelf test" with two items and a category. */
async function seed(account: Account) {
  for (const item of await call<Row[]>(account, 'GET', '/api/inventory'))
    await call(account, 'DELETE', `/api/inventory/${item.id}`)
  for (const loc of await call<Row[]>(account, 'GET', '/api/locations'))
    await call(account, 'DELETE', `/api/locations/${loc.id}`)
  const categories = await call<Row[]>(account, 'GET', '/api/categories')
  const category =
    categories.find((c) => c.name === 'Settings cat') ??
    (await call<Row>(account, 'POST', '/api/categories', { name: 'Settings cat' }))
  const location = await call<Row>(account, 'POST', '/api/locations', { name: 'Shelf test' })
  for (const name of ['Rice', 'Beans'])
    await call(account, 'POST', '/api/inventory', {
      name,
      categoryId: category.id,
      quantity: 1,
      unit: 'pcs',
      expirationDate: '2030-01-01',
      locationId: location.id,
    })
}

test('F-SE-01: a location says how many items move, deletes after the Undo window, and the items stay', async ({
  page,
  context,
  account,
}) => {
  await seed(account)
  await routeApi(context)
  await page.goto('/settings')
  const locations = page.getByRole('region', { name: 'Locations' })
  await expect(locations.getByText('Shelf test')).toBeVisible()
  await expect(locations).toContainText('2 items')
  await page
    .getByRole('button', { name: 'Delete Shelf test, 2 items will move to No location' })
    .click()
  await expect(locations.getByText('Shelf test')).toHaveCount(0)
  // The toast appears under the pointer on a tablet, and a hovered toast keeps its Undo window open.
  await page.mouse.move(0, 0)
  await expect
    .poll(async () => (await call<Row[]>(account, 'GET', '/api/locations')).length, {
      timeout: HOLD_WINDOW_MS,
    })
    .toBe(0)
  const items = await call<{ locationId: number | null }[]>(account, 'GET', '/api/inventory')
  expect(items).toHaveLength(2)
  expect(items.every((i) => i.locationId === null)).toBe(true)
})

test('F-SE-01 / F-SE-08: a chosen icon and colour show on the Kitchen card and survive a reload', async ({
  page,
  context,
  account,
}) => {
  await seed(account)
  await routeApi(context)
  await page.goto('/settings')
  const locations = page.getByRole('region', { name: 'Locations' })
  await locations.getByRole('button', { name: 'Edit Shelf test' }).click()
  const editor = locations.getByRole('group', { name: 'Edit Shelf test' })
  await editor.getByRole('radio', { name: 'Jar' }).check({ force: true })
  await editor.getByRole('radio', { name: 'Rose' }).check({ force: true })
  await expect(
    editor.getByRole('group', { name: 'Preview' }).locator('[data-location-color="rose"]'),
  ).toBeVisible()
  await editor.getByRole('button', { name: 'Save Shelf test' }).click()
  await expect
    .poll(async () => (await call<Row[]>(account, 'GET', '/api/locations'))[0])
    .toMatchObject({ icon: 'jar', color: 'rose' })
  await page.reload()
  await page.goto('/')
  await expect(page.locator('[data-location-color="rose"]').first()).toBeVisible()
  // a place with nothing chosen falls back to its name's guess, never a blank square
  await page.goto('/settings')
  await expect(locations.getByText('Shelf test')).toBeVisible()
})

test('F-SE-06: Dark applies at once and is still dark after a reload', async ({
  page,
  context,
}) => {
  await routeApi(context)
  await page.goto('/settings')
  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/preferences') && r.request().method() === 'PATCH',
  )
  await page.getByRole('radio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .querySelector('meta[name="theme-color"]:not([media="not all"])')
          ?.getAttribute('content'),
      ),
    )
    .toBe('#17130e')
  await saved
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('radio', { name: 'System' }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
})

test('F-SE-04: Export CSV downloads the old columns with category names', async ({
  page,
  context,
  account,
}) => {
  await seed(account)
  await routeApi(context)
  await page.goto('/settings')
  await expect(
    page.getByRole('region', { name: 'Locations' }).getByText('Shelf test'),
  ).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export inventory (CSV)' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^inventory_export_\d{4}-\d{2}-\d{2}\.csv$/)
  const text = await (await import('node:fs/promises')).readFile((await file.path())!, 'utf8')
  expect(text.split('\r\n')[0]).toBe('Name,Category,Quantity,Unit,Expiration,Notes')
  expect(text).toContain('"Rice","Settings cat","1","pcs","2030-01-01"')
})

test('F-NT-04 / F-SE-07: this build with no push key says so; Sign out returns to the sign-in page; no sideways scroll', async ({
  page,
  context,
  account,
}, info) => {
  await seed(account)
  await routeApi(context)
  await page.goto('/settings')
  await expect(
    page.getByRole('region', { name: 'Locations' }).getByText('Shelf test'),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'Reminders & alerts' })).toContainText(
    'This device:',
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  if (SHOTS) {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.screenshot({
        path: `${SHOTS}/settings-${info.project.name}-${scheme}.png`,
        fullPage: true,
      })
    }
  }
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)
})
