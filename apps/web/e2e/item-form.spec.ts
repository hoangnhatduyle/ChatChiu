// Step 5.3 e2e (SPEC-IF-001) in a real browser with the real API router and local Supabase: add an item
// from a board column (location pre-filled), the server stores the price per unit, edit from the panel
// keeps the full amount and the amount left apart, invalid input stays inline with focus on the first
// problem, and the form never scrolls the page sideways.
import type { BrowserContext, Page } from '@playwright/test'
import { startApiServer, type ApiServer } from './support/api-server'
import { signInRest, type Account } from './support/supabase'
import { expect, test } from './support/test'

let api: ApiServer
test.beforeAll(async () => {
  api = await startApiServer('item-form.spec')
})
test.afterAll(async () => {
  await api.close()
})

type Item = {
  id: number
  name: string
  price: number | null
  locationId: number | null
  expirationDate: string
  notes: string | null
  initialQuantity: number | null
  currentQuantity: number | null
}

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

/** A toast in the visible region (its text is also in the screen-reader live region). */
const toast = (page: Page, text: string) =>
  page.getByRole('region', { name: 'Notifications' }).getByText(text)

async function seed(account: Account) {
  const items = await call<{ id: number }[]>(account, 'GET', '/api/inventory')
  for (const item of items) await call(account, 'DELETE', `/api/inventory/${item.id}`)
  const locations = await call<{ id: number }[]>(account, 'GET', '/api/locations')
  for (const location of locations) await call(account, 'DELETE', `/api/locations/${location.id}`)
  const category = await call<{ id: number }>(account, 'POST', '/api/categories', {
    name: `Pantry goods ${crypto.randomUUID().slice(0, 6)}`,
  })
  const fridge = await call<{ id: number }>(account, 'POST', '/api/locations', { name: 'Fridge' })
  const pantry = await call<{ id: number }>(account, 'POST', '/api/locations', { name: 'Pantry' })
  const milk = await call<{ id: number }>(account, 'POST', '/api/inventory', {
    name: 'Milk',
    categoryId: category.id,
    locationId: fridge.id,
    quantity: 1,
    unit: 'L',
    initialQuantity: 1,
    currentQuantity: 0.4,
    expirationDate: isoDay(5),
    price: 2,
  })
  return { categoryName: 'Pantry goods', pantryId: pantry.id, milkId: milk.id }
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

const serverItem = async (account: Account, name: string) =>
  (await call<Item[]>(account, 'GET', '/api/inventory')).find((i) => i.name === name)

const SHOTS = process.env.E2E_SHOTS

test('F-IF-03 / F-IF-09 / F-IF-16: add from the Pantry column, price stored per unit, back on the board with the item', async ({
  page,
  context,
  account,
}) => {
  const { pantryId } = await seed(account)
  await routeApi(context)
  await page.goto('/')
  await page.getByRole('link', { name: 'Add to Pantry' }).click()
  await expect(page).toHaveURL(new RegExp(`/stock/new\\?location=${pantryId}`))
  await expect(page.getByRole('button', { name: /Location/ })).toContainText('Pantry')

  await page.getByRole('textbox', { name: /^Name/ }).fill('Honey')
  await page.getByRole('button', { name: /Category/ }).click()
  await page.getByRole('option', { name: /Pantry goods/ }).click()
  await page.getByRole('textbox', { name: /^Quantity/ }).fill('10')
  await page.getByRole('textbox', { name: /^Total price/ }).fill('4')
  await page.getByRole('button', { name: 'In 1 month' }).click()
  await page.getByRole('button', { name: 'Save item' }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(toast(page, 'Added Honey')).toBeVisible()
  await expect.poll(async () => (await serverItem(account, 'Honey'))?.price).toBeCloseTo(0.4, 6)
  const honey = (await serverItem(account, 'Honey'))!
  expect(honey.locationId).toBe(pantryId)
  expect(honey.expirationDate).toBe(isoDay(30))
  await expect(page.getByRole('button', { name: 'Open Honey' })).toBeVisible()
})

test('F-IF-12: edit from the panel keeps the full amount and the amount left apart', async ({
  page,
  context,
  account,
}) => {
  const { milkId } = await seed(account)
  await routeApi(context)
  await page.goto(`/?item=${milkId}`)
  await page.getByRole('link', { name: 'Edit all details' }).click()
  await expect(page).toHaveURL(new RegExp(`/stock/${milkId}/edit`))
  await expect(page.getByRole('textbox', { name: /^Full amount/ })).toHaveValue('1')
  await expect(page.getByRole('textbox', { name: /^Left now/ })).toHaveValue('0.4')
  await expect(page.getByRole('textbox', { name: /^Total price/ })).toHaveValue('2.00')
  await page.getByRole('textbox', { name: /^Notes/ }).fill('Organic')
  await page.getByRole('button', { name: 'Save item' }).click()
  await expect(toast(page, 'Saved Milk')).toBeVisible()
  await expect.poll(async () => (await serverItem(account, 'Milk'))?.notes).toBe('Organic')
  const milk = (await serverItem(account, 'Milk'))!
  expect(milk.initialQuantity).toBe(1)
  expect(milk.currentQuantity).toBe(0.4)
  expect(milk.price).toBe(2)
})

test('INVALID->SAVING: an empty form shows inline errors, focuses the first problem, and sends nothing', async ({
  page,
  context,
  account,
}) => {
  await seed(account)
  await routeApi(context)
  const before = (await call<Item[]>(account, 'GET', '/api/inventory')).length
  await page.goto('/stock/new')
  await page.getByRole('button', { name: 'Save item' }).click()
  await expect(page.getByText('Enter a name.')).toBeVisible()
  await expect(page.getByText('Choose a category.')).toBeVisible()
  await expect(page.getByText('Choose an expiry date.')).toBeVisible()
  await expect(page.getByRole('textbox', { name: /^Name/ })).toBeFocused()
  expect((await call<Item[]>(account, 'GET', '/api/inventory')).length).toBe(before)
})

test('the form never makes the page scroll sideways, with the errors showing', async ({
  page,
  context,
  account,
}, info) => {
  await seed(account)
  await routeApi(context)
  await page.goto('/stock/new?location=1')
  await page.getByRole('button', { name: 'Save item' }).click()
  await expect(page.getByText('Enter a name.')).toBeVisible()
  await page.getByRole('button', { name: 'More options' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  if (SHOTS) {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.screenshot({
        path: `${SHOTS}/form-${info.project.name}-${scheme}.png`,
        fullPage: true,
      })
    }
  }
})
