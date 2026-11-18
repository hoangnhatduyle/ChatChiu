// Step 5.10 e2e (SPEC-RS-001) in a real browser with the real API router and local Supabase: a photo is shrunk,
// uploaded to her receipts folder through a signed URL, the (stubbed) AI reads two lines, review fills the
// defaults, ONE bulk request adds both items with the price per unit, and they are on the board. Only the OpenAI
// call is replaced: it needs a paid key.
import type { BrowserContext, Page } from '@playwright/test'
import { startApiServer, type ApiServer } from './support/api-server'
import { signInRest, type Account } from './support/supabase'
import { expect, test } from './support/test'

let api: ApiServer
test.beforeAll(async () => {
  api = await startApiServer('receipt-scan.spec')
})
test.afterAll(async () => {
  await api.close()
})

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

type Row = { id: number; name: string }
type Item = {
  name: string
  price: number | null
  locationId: number | null
  purchaseDate: string
  expirationDate: string
  unit: string
}

async function seed(account: Account) {
  for (const item of await call<Row[]>(account, 'GET', '/api/inventory'))
    await call(account, 'DELETE', `/api/inventory/${item.id}`)
  for (const loc of await call<Row[]>(account, 'GET', '/api/locations'))
    await call(account, 'DELETE', `/api/locations/${loc.id}`)
  const categories = await call<Row[]>(account, 'GET', '/api/categories')
  for (const name of ['Dairy', 'Pantry'])
    if (!categories.some((c) => c.name === name))
      await call(account, 'POST', '/api/categories', { name })
  await call(account, 'POST', '/api/locations', { name: 'Scan Fridge' })
  await call(account, 'POST', '/api/locations', { name: 'Scan Shelf' })
}

async function routes(context: BrowserContext, counters: { bulk: number; scanPaths: string[] }) {
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    try {
      const response = await route.fetch({ url: `${api.baseUrl}${url.pathname}${url.search}` })
      await route.fulfill({ response })
    } catch {
      // The test ended while this request was still in flight.
    }
  })
  await context.route('**/api/ai/receipt-scan', async (route) => {
    counters.scanPaths.push(JSON.parse(route.request().postData() ?? '{}').imagePath)
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          items: [
            {
              name: 'Rice',
              quantity: 1,
              unit: 'kg',
              price: 4.5,
              categoryHint: 'Pantry',
              shelfLifeDaysHint: 10,
            },
            { name: 'Yogurt', quantity: 2, unit: 'bunch', price: 3, categoryHint: 'Dairy' },
          ],
        },
      }),
    })
  })
  await context.route('**/api/inventory/bulk', async (route) => {
    if (route.request().method() === 'POST') counters.bulk += 1
    const url = new URL(route.request().url())
    const response = await route.fetch({ url: `${api.baseUrl}${url.pathname}${url.search}` })
    await route.fulfill({ response })
  })
}

/** Puts a real (generated) JPEG into the gallery input, as a user picking a photo would. */
async function pickPhoto(page: Page) {
  await page.getByLabel('Choose from gallery').waitFor({ state: 'attached' })
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 600
    canvas.height = 900
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 600, 900)
    ctx.fillStyle = '#000'
    ctx.fillText('RECEIPT', 50, 50)
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/jpeg'),
    )
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], 'receipt.jpg', { type: 'image/jpeg' }))
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Choose from gallery"]',
    )!
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

test('F-RS-01..10: photo, upload, read, review defaults, one bulk add, on the board; no sideways scroll', async ({
  page,
  context,
  account,
}, info) => {
  await seed(account)
  const counters = { bulk: 0, scanPaths: [] as string[] }
  await routes(context, counters)
  await page.goto('/scan')
  await page.getByLabel('Receipt date').fill('2026-11-10')
  if (SHOTS)
    await page.screenshot({
      path: `${SHOTS}/scan-capture-${info.project.name}.png`,
      fullPage: true,
    })
  await pickPhoto(page)
  await expect(page.getByRole('heading', { name: 'Check your items' })).toBeVisible({
    timeout: 20_000,
  })
  // The AI read the file that was uploaded to her own receipts folder.
  expect(counters.scanPaths).toHaveLength(1)
  expect(counters.scanPaths[0]).toMatch(/^[0-9a-f-]{36}\/receipts\/[0-9a-f-]{36}\.jpg$/)

  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/scan-review-${info.project.name}.png`, fullPage: true })
  await page.getByRole('radio', { name: 'Table' }).click()
  await expect(page.getByLabel('Purchase date of Rice')).toHaveValue('2026-11-10')
  await expect(page.getByLabel('Expiry of Rice', { exact: true })).toHaveValue('2026-11-20')
  await expect(page.getByLabel('Unit of Yogurt')).toHaveValue('piece')
  await expect(page.getByLabel('Expiry of Yogurt', { exact: true })).toHaveValue('2026-11-24')
  await expect(page.getByRole('button', { name: /^Add \d+ items?$/ })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )

  await page.getByLabel('Location of Rice').selectOption({ label: 'Scan Fridge' })
  await page.getByLabel('Location of Yogurt').selectOption({ label: 'Scan Shelf' })
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/scan-table-${info.project.name}.png`, fullPage: true })
  await page.getByRole('button', { name: 'Add 2 items' }).click()
  await expect(page.getByText('2 items added')).toBeVisible({ timeout: 15_000 })
  expect(counters.bulk).toBe(1)

  const items = await call<Item[]>(account, 'GET', '/api/inventory')
  expect(items.map((i) => [i.name, i.price, i.unit, i.purchaseDate]).sort()).toEqual([
    ['Rice', 4.5, 'kg', '2026-11-10'],
    ['Yogurt', 1.5, 'piece', '2026-11-10'],
  ])
  await page.getByRole('link', { name: 'View on board' }).click()
  await expect(page.getByText('Rice').first()).toBeVisible()
  await expect(page.getByText('Yogurt').first()).toBeVisible()
})

test('F-RS-06: the next scan starts with the location she used last', async ({
  page,
  context,
  account,
}) => {
  await seed(account)
  await routes(context, { bulk: 0, scanPaths: [] })
  await page.goto('/scan')
  await pickPhoto(page)
  await page.getByRole('radio', { name: 'Table' }).click()
  await page.getByLabel('Location of Rice').selectOption({ label: 'Scan Shelf' })
  await page.getByLabel('Location of Yogurt').selectOption({ label: 'Scan Shelf' })
  await page.getByRole('button', { name: 'Add 2 items' }).click()
  await expect(page.getByText('2 items added')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Scan another receipt' }).click()
  await pickPhoto(page)
  await page.getByRole('radio', { name: 'Table' }).click()
  await expect(page.getByLabel('Location of Rice').locator('option:checked')).toHaveText(
    'Scan Shelf',
  )
})
