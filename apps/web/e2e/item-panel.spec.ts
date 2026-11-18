// Step 5.2 e2e (SPEC-QP-001) in a real browser with the real API router and local Supabase behind it,
// plus the browser checks of roadmap 7.0.21 that jsdom cannot do: Undo pressed with the mouse while the
// panel is open must not dismiss it; Alt+Shift+T and Ctrl+Z with the panel open; a held delete or waste
// reaches the server when the tab is closed within the 5 s window; toast announcements; no sideways scroll.
import type { BrowserContext, Page } from '@playwright/test'
import { startApiServer, type ApiServer } from './support/api-server'
import { startAppServer, type AppServer } from './support/app-server'
import { signInRest, type Account } from './support/supabase'
import { expect, test } from './support/test'

let api: ApiServer
let app: AppServer
test.beforeAll(async () => {
  api = await startApiServer('item-panel.spec')
  app = await startAppServer(api.baseUrl)
})
test.afterAll(async () => {
  await app.close()
  await api.close()
})

type Item = { id: number; name: string; currentQuantity: number }
type Seeded = { milkId: number; riceId: number }

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

const isoDay = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

async function clearKitchen(account: Account) {
  const items = await call<{ id: number }[]>(account, 'GET', '/api/inventory')
  for (const item of items) await call(account, 'DELETE', `/api/inventory/${item.id}`)
  const locations = await call<{ id: number }[]>(account, 'GET', '/api/locations')
  for (const location of locations) await call(account, 'DELETE', `/api/locations/${location.id}`)
}

async function seed(account: Account): Promise<Seeded> {
  await clearKitchen(account)
  const category = await call<{ id: number }>(account, 'POST', '/api/categories', {
    name: `Dairy ${crypto.randomUUID().slice(0, 6)}`,
  })
  const fridge = await call<{ id: number }>(account, 'POST', '/api/locations', { name: 'Fridge' })
  const base = { categoryId: category.id, unit: 'L', quantity: 10, initialQuantity: 10 }
  const milk = await call<{ id: number }>(account, 'POST', '/api/inventory', {
    ...base,
    name: 'Milk',
    currentQuantity: 6,
    locationId: fridge.id,
    expirationDate: isoDay(2),
    price: 0.5,
  })
  const rice = await call<{ id: number }>(account, 'POST', '/api/inventory', {
    ...base,
    name: 'Rice',
    currentQuantity: 10,
    locationId: fridge.id,
    expirationDate: isoDay(300),
  })
  return { milkId: milk.id, riceId: rice.id }
}

async function routeApi(context: BrowserContext) {
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const response = await route.fetch({ url: `${api.baseUrl}${url.pathname}${url.search}` })
    await route.fulfill({ response })
  })
}

const serverItems = (account: Account) => call<Item[]>(account, 'GET', '/api/inventory')
const serverLevel = async (account: Account, id: number) =>
  (await serverItems(account)).find((i) => i.id === id)?.currentQuantity

/** `origin` is the real app server for the checks that must survive leaving the page (keepalive). */
async function openPanel(page: Page, id: number, name: string, origin = '') {
  await page.goto(`${origin}/?item=${id}`)
  const panel = page.getByRole('dialog', { name })
  await expect(panel).toBeVisible()
  return panel
}

const SHOTS = process.env.E2E_SHOTS
/** How long the server may take to show a request sent as the page went away (the machine may be busy). */
const SERVER_SEES_IT_MS = 10_000

test('F-QP-02 / 7.0.21a: Used 25% saves, and pressing Undo with the mouse keeps the panel open and restores the level', async ({
  page,
  context,
  account,
}) => {
  const { milkId } = await seed(account)
  await routeApi(context)
  const panel = await openPanel(page, milkId, 'Milk')
  await panel.getByRole('button', { name: 'Used 25%' }).click()
  await expect.poll(() => serverLevel(account, milkId)).toBe(3.5)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => serverLevel(account, milkId)).toBe(6)
  await expect(panel).toBeVisible()
})

test('7.0.21b: Alt+Shift+T reaches the toast and Ctrl+Z undoes, with the panel open', async ({
  page,
  context,
  account,
}) => {
  const { milkId } = await seed(account)
  await routeApi(context)
  const panel = await openPanel(page, milkId, 'Milk')
  await panel.getByRole('button', { name: 'Used half' }).click()
  await expect.poll(() => serverLevel(account, milkId)).toBe(1)
  await page.keyboard.press('Alt+Shift+T')
  await expect(page.getByRole('button', { name: 'Undo' })).toBeFocused()
  await panel.getByRole('button', { name: 'Used 10%' }).focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => serverLevel(account, milkId)).toBe(6)
  await expect(panel).toBeVisible()
})

test('7.0.21c / NC-QP-NO-LOST-ACTION: a held delete is sent when the tab is closed inside the 5 s window', async ({
  page,
  account,
}) => {
  const { milkId, riceId } = await seed(account)
  const panel = await openPanel(page, milkId, 'Milk', app.url)
  await panel.getByRole('button', { name: 'Delete' }).click()
  expect((await serverItems(account)).some((i) => i.id === milkId)).toBe(true) // nothing sent yet
  await page.goto('about:blank') // leaving the page fires pagehide, as closing the tab does
  await expect
    .poll(async () => (await serverItems(account)).map((i) => i.id), { timeout: SERVER_SEES_IT_MS })
    .toEqual([riceId])
})

test('F-QP-05 / 7.0.21c: Move to waste is sent when the tab is hidden, and the waste log has the value', async ({
  page,
  account,
}) => {
  const { milkId } = await seed(account)
  const panel = await openPanel(page, milkId, 'Milk', app.url)
  await panel.getByRole('button', { name: 'Move to waste' }).click()
  await expect(page.getByText(/moved to waste \(3\.00\)/)).toBeVisible()
  await page.goto('about:blank') // leaving the page fires pagehide, as closing the tab does
  await expect
    .poll(
      async () =>
        (await call<{ itemName: string }[]>(account, 'GET', '/api/waste')).map((w) => w.itemName),
      { timeout: SERVER_SEES_IT_MS },
    )
    .toContain('Milk')
})

test('7.0.21d: a toast made with the panel open is announced in the live region', async ({
  page,
  context,
  account,
}) => {
  const { milkId } = await seed(account)
  await routeApi(context)
  const panel = await openPanel(page, milkId, 'Milk')
  await panel.getByRole('button', { name: 'Used 10%' }).click()
  await expect(page.locator('[data-live-announcer] [role="status"]')).toContainText(
    'Milk: 50% left',
  )
  // The announcer is not hidden from assistive tech by the open modal.
  const hidden = await page
    .locator('[data-live-announcer]')
    .evaluate((el) => el.closest('[aria-hidden="true"], [inert]') !== null)
  expect(hidden).toBe(false)
})

test('F-QP-07 / F-QP-06: the panel moves the item and restocks the same item, no second row', async ({
  page,
  context,
  account,
}) => {
  const { milkId } = await seed(account)
  await routeApi(context)
  const panel = await openPanel(page, milkId, 'Milk')
  await panel.getByRole('button', { name: 'Restock' }).click()
  await panel.getByRole('textbox', { name: /Total price/ }).fill('12')
  await panel.getByRole('button', { name: 'Confirm restock' }).click()
  await expect.poll(() => serverLevel(account, milkId)).toBe(10)
  expect((await serverItems(account)).length).toBe(2)
})

test('the panel never makes the page scroll sideways, at this form factor', async ({
  page,
  context,
  account,
}, info) => {
  const { milkId } = await seed(account)
  await routeApi(context)
  const panel = await openPanel(page, milkId, 'Milk')
  await expect(panel.getByRole('button', { name: 'Used 25%' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  if (SHOTS) {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.screenshot({ path: `${SHOTS}/panel-${info.project.name}-${scheme}.png` })
    }
  }
})
