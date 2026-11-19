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
  // WCAG 1.4.10: the page itself never scrolls sideways (only the swipe row does); a wider page would also
  // push the fixed bottom bar and the toasts off a phone screen.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true)
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
  // The number follows the keys at once (F-KB-18); the save is the Undo toast, so wait for that before reloading.
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
  await page.waitForTimeout(500)
  await page.reload()
  await expect(page.locator('li', { hasText: 'Milk' }).getByText('60%')).toBeVisible()

  await context.setOffline(false)
  await expect.poll(() => serverMilk(account, milkId), { timeout: 15_000 }).toBeCloseTo(6, 0)
  const usage = await call<unknown[]>(account, 'GET', `/api/inventory/${milkId}/usage`)
  expect(usage).toHaveLength(1)
})

test('F-KB-12 / F-KB-17: a tile filters the cards, Show all opens a card and it is remembered after a reload', async ({
  page,
  context,
  account,
}) => {
  test.setTimeout(60_000) // seeds 6 extra items one request at a time
  await seed(account)
  const fridge = (
    await call<{ id: number; name: string }[]>(account, 'GET', '/api/locations')
  ).find((l) => l.name === 'Fridge')!
  const cat = (await call<{ categoryId: number }[]>(account, 'GET', '/api/inventory'))[0]!
    .categoryId
  for (let n = 1; n <= 6; n++) {
    await call(account, 'POST', '/api/inventory', {
      categoryId: cat,
      unit: 'L',
      quantity: 1,
      initialQuantity: 1,
      currentQuantity: 1,
      name: `Extra ${n}`,
      locationId: fridge.id,
      expirationDate: isoDay(40 + n),
    })
  }
  await routeApi(context)
  await page.goto('/')
  const card = () =>
    page
      .getByRole('heading', { level: 2, name: /Fridge - Top shelf/ })
      .locator('xpath=ancestor::section[1]')
  await expect(page.getByRole('button', { name: 'Open Milk' })).toBeVisible()
  // 7 items in the Fridge: the 5 most urgent show, the rest wait behind Show all.
  await expect(card().getByRole('listitem')).toHaveCount(5)
  await page.getByRole('button', { name: 'Show all 7' }).click()
  await expect(card().getByRole('listitem')).toHaveCount(7)
  await page.reload()
  await expect(card().getByRole('listitem')).toHaveCount(7)

  // A tile keeps the items in their cards and leaves out places with nothing to show.
  await page.getByRole('button', { name: /Use today/ }).click()
  await expect(page).toHaveURL(/show=today/)
  await expect(page.getByRole('button', { name: 'Open Milk' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: /Pantry/ })).toHaveCount(0)
  await expect(page.getByTestId('board-result-count')).toHaveText(
    'Showing 1 item to use today in 1 place',
  )
  await page.getByRole('button', { name: /Use today/ }).click()
  await expect(page).not.toHaveURL(/show=/)
  await expect(page.getByRole('heading', { level: 2, name: /Pantry/ })).toBeVisible()
})

test('F-KB-18: the percent follows the finger while dragging, and is saved once on release', async ({
  page,
  context,
  account,
}) => {
  await seed(account)
  await routeApi(context)
  await page.goto('/')
  const row = page.getByRole('button', { name: 'Open Milk' }).locator('xpath=ancestor::li[1]')
  await expect(row).toBeVisible()
  const track = row.getByRole('slider').locator('xpath=ancestor::*[@data-usage-track]')
  const t = (await track.boundingBox())!
  const y = t.y + t.height / 2
  await page.mouse.move(t.x + t.width - 4, y)
  await page.mouse.down()
  await page.mouse.move(t.x + t.width * 0.5, y, { steps: 8 })
  // Still dragging: nothing is saved, yet the number already reads the new level.
  await expect(row.getByText(/^(5|4)\d%$/)).toBeVisible()
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
})

test('one page scroll on a wide screen: no inner scroll area takes over, and nothing scrolls sideways', async ({
  page,
  context,
  account,
}) => {
  await seed(account)
  await routeApi(context)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Open Milk' })).toBeVisible()
  const nested = await page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>('main *')].filter((el) => {
        const s = getComputedStyle(el)
        return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1
      }).length,
  )
  expect(nested).toBe(0)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true)
})
