// Step 5.1 e2e (SPEC-KB-001) in a real browser, with the real API router and local Supabase behind it:
// the board shows her items by location, a drag saves with Undo, the server really has the value, and
// a change made on one device appears on another within 3 s (F-KB-16). The offline checks are roadmap
// 7.0.18: reload with no network still shows the board, and a drag made offline is saved once.
import type { BrowserContext, Page } from '@playwright/test'
import { startApiServer, type ApiServer } from './support/api-server'
import { signInRest, type Account } from './support/supabase'
import { expect, test } from './support/test'

let api: ApiServer
test.beforeAll(async () => {
  api = await startApiServer('board.spec')
})
test.afterAll(async () => {
  await api.close()
})

const SYNC_WITHIN_MS = 3_000
const KEYBOARD_SAVE_MS = 2_000

type Seeded = { milkId: number }

/** Calls the real API as the account (the same routes the app uses). */
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

/** Tests in one worker share an account: start each from an empty kitchen. */
async function clearKitchen(account: Account) {
  const items = await call<{ id: number }[]>(account, 'GET', '/api/inventory')
  for (const item of items) await call(account, 'DELETE', `/api/inventory/${item.id}`)
  const locations = await call<{ id: number }[]>(account, 'GET', '/api/locations')
  for (const location of locations) await call(account, 'DELETE', `/api/locations/${location.id}`)
}

async function seed(account: Account): Promise<Seeded> {
  await clearKitchen(account)
  const tag = crypto.randomUUID().slice(0, 6)
  const category = await call<{ id: number }>(account, 'POST', '/api/categories', {
    name: `Dairy ${tag}`,
  })
  const fridge = await call<{ id: number }>(account, 'POST', '/api/locations', {
    name: 'Fridge',
    subLocation: 'Top shelf',
  })
  const pantry = await call<{ id: number }>(account, 'POST', '/api/locations', {
    name: 'Pantry',
  })
  const base = {
    categoryId: category.id,
    unit: 'L',
    quantity: 10,
    initialQuantity: 10,
    currentQuantity: 10,
  }
  const milk = await call<{ id: number }>(account, 'POST', '/api/inventory', {
    ...base,
    name: 'Milk',
    locationId: fridge.id,
    expirationDate: isoDay(2),
  })
  await call(account, 'POST', '/api/inventory', {
    ...base,
    name: 'Rice',
    locationId: pantry.id,
    expirationDate: isoDay(300),
  })
  return { milkId: milk.id }
}

/** Sends the app's /api requests to the real router (the preview server has no API of its own). */
async function routeApi(context: BrowserContext) {
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const response = await route.fetch({ url: `${api.baseUrl}${url.pathname}${url.search}` })
    await route.fulfill({ response })
  })
}

const serverMilk = async (account: Account, id: number) =>
  (await call<{ id: number; currentQuantity: number }[]>(account, 'GET', '/api/inventory')).find(
    (i) => i.id === id,
  )?.currentQuantity

/** Resolves once the page's live-update channel is subscribed (so a change made next is not missed). */
function whenSubscribed(page: Page): Promise<void> {
  return new Promise((resolve) => {
    page.on('websocket', (socket) =>
      socket.on('framereceived', (frame) => {
        if (String(frame.payload).includes('Subscribed to PostgreSQL')) resolve()
      }),
    )
  })
}

async function dragMilkTo(page: Page, percent: number) {
  const track = page
    .getByRole('slider', { name: /How much Milk is left/ })
    .locator('xpath=ancestor::*[@data-usage-track]')
  const box = (await track.boundingBox())!
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width - 4, y)
  await page.mouse.down()
  await page.mouse.move(box.x + (box.width * percent) / 100, y, { steps: 8 })
  await page.mouse.up()
}

test('F-KB-01 / F-KB-12: the board shows her items by location, with the header controls', async ({
  page,
  context,
  account,
}) => {
  await seed(account)
  await routeApi(context)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 2, name: /Fridge - Top shelf/ })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: /Pantry/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Milk' })).toBeVisible()
  await expect(page.getByRole('searchbox', { name: /search the board/i })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Scan receipt' })).toBeVisible()
  // WCAG 1.4.10: the page itself never scrolls sideways (only the columns do); a wider page would also
  // push the fixed bottom bar and the toasts off a phone screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.getByRole('searchbox').fill('rice')
  await expect(page.getByRole('button', { name: 'Open Milk' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open Rice' })).toBeVisible()
})

test('F-KB-04: a real drag saves on release without a dialog, the server has it, and Undo restores it', async ({
  page,
  context,
  account,
}) => {
  const { milkId } = await seed(account)
  await routeApi(context)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Open Milk' })).toBeVisible()
  await dragMilkTo(page, 40)
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(() => serverMilk(account, milkId)).toBeCloseTo(4, 0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => serverMilk(account, milkId)).toBe(10)
  await expect(page.getByText('100%').first()).toBeVisible()
})

test('F-KB-16: usage changed on one device shows on another within 3 s', async ({
  page,
  context,
  account,
}) => {
  const { milkId } = await seed(account)
  await routeApi(context)
  const live = whenSubscribed(page)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Open Milk' })).toBeVisible()
  await live // the tablet is listening; now the "phone" changes the usage

  await call(account, 'POST', `/api/inventory/${milkId}/usage`, {
    amountUsed: 5,
    currentQuantity: 5,
  })
  await expect(page.locator('li', { hasText: 'Milk' }).getByText('50%')).toBeVisible({
    timeout: SYNC_WITHIN_MS,
  })
})

test('7.0.18: with no network, reloading still shows the board; a drag made offline is saved once after reconnecting', async ({
  page,
  context,
  account,
}) => {
  const { milkId } = await seed(account)
  await routeApi(context)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Open Milk' })).toBeVisible()
  // The service worker takes over on the next load: wait for it, reload, and let the cache be saved.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await expect(page.getByRole('button', { name: 'Open Milk' })).toBeVisible()
  await page.waitForTimeout(1000)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Open Milk' })).toBeVisible()

  await page.getByRole('slider', { name: /How much Milk is left/ }).focus()
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowLeft') // 8 steps of 5 % = 60 %
  await expect(page.locator('li', { hasText: 'Milk' }).getByText('60%')).toBeVisible({
    timeout: KEYBOARD_SAVE_MS,
  })
  await page.waitForTimeout(500)
  await page.reload()
  await expect(page.locator('li', { hasText: 'Milk' }).getByText('60%')).toBeVisible()

  await context.setOffline(false)
  await expect.poll(() => serverMilk(account, milkId), { timeout: 15_000 }).toBeCloseTo(6, 0)
  const usage = await call<unknown[]>(account, 'GET', `/api/inventory/${milkId}/usage`)
  expect(usage).toHaveLength(1)
})
