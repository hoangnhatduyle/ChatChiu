// Step 5.5 e2e (SPEC-SL-001) in a real browser with the real API router and local Supabase: quick add and
// tick reach the server, Clear purchased sends ONE request with exactly the purchased ids after the Undo
// window, a held delete is sent when the page is left inside the window (keepalive), Share copies the text
// when there is no share sheet, and the page never scrolls sideways.
import type { BrowserContext, Page } from '@playwright/test'
import { startApiServer, type ApiServer } from './support/api-server'
import { startAppServer, type AppServer } from './support/app-server'
import { signInRest, type Account } from './support/supabase'
import { expect, test } from './support/test'

let api: ApiServer
let app: AppServer
test.beforeAll(async () => {
  api = await startApiServer('shopping.spec')
  app = await startAppServer(api.baseUrl)
})
test.afterAll(async () => {
  await app.close()
  await api.close()
})

const SERVER_SEES_IT_MS = 10_000
const HOLD_WINDOW_MS = 8_000

type Row = { id: number; name: string; isPurchased: boolean; quantity: string | null }

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

const serverList = (account: Account) => call<Row[]>(account, 'GET', '/api/shopping-list')

async function seed(
  account: Account,
  rows: Array<{ name: string; quantity?: string; purchased?: boolean }>,
) {
  for (const old of await serverList(account)) {
    await call(account, 'DELETE', `/api/shopping-list/${old.id}`)
  }
  const categories = await call<{ id: number; name: string }[]>(account, 'GET', '/api/categories')
  let category = categories.find((c) => c.name === 'Shopping goods')
  if (!category) {
    category = await call<{ id: number; name: string }>(account, 'POST', '/api/categories', {
      name: 'Shopping goods',
    })
  }
  for (const [i, row] of rows.entries()) {
    const created = await call<{ id: number }>(account, 'POST', '/api/shopping-list', {
      name: row.name,
      ...(row.quantity ? { quantity: row.quantity } : {}),
      ...(i % 2 === 0 ? { categoryId: category.id } : {}),
    })
    if (row.purchased) {
      await call(account, 'PATCH', `/api/shopping-list/${created.id}`, { isPurchased: true })
    }
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

const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: 'Notifications' }).getByText(text)
const SHOTS = process.env.E2E_SHOTS

test('F-SL-01 / F-SL-02 / F-SL-08: quick add and tick reach the server, counts follow, and a reload keeps them', async ({
  page,
  context,
  account,
}) => {
  await seed(account, [])
  await routeApi(context)
  await page.goto('/shopping')
  await page.getByRole('textbox', { name: /^Name/ }).fill('Eggs')
  await page.getByRole('textbox', { name: /^Quantity/ }).fill('10')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Eggs', { exact: true })).toBeVisible()
  await expect(page.getByText('0 pending', { exact: false })).toHaveCount(0)
  await expect(page.getByText(/1 pending · 0 purchased/)).toBeVisible()
  await expect.poll(async () => (await serverList(account)).map((r) => r.name)).toEqual(['Eggs'])

  // The new row keeps a temporary id (and a guarded checkbox) until the server's answer replaces it.
  await expect(page.getByText('Saving…')).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Eggs' }).click()
  await expect(page.getByRole('checkbox', { name: 'Eggs' })).toBeChecked()
  await expect(page.getByText(/0 pending · 1 purchased/)).toBeVisible()
  await expect.poll(async () => (await serverList(account))[0]?.isPurchased).toBe(true)
  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Eggs' })).toBeChecked()
})

test('F-SL-04 / NC-SL-ONE-CLEAR: Clear purchased sends one request with exactly the purchased rows after the Undo window', async ({
  page,
  context,
  account,
}) => {
  await seed(account, [
    { name: 'Eggs', purchased: true },
    { name: 'Milk', purchased: true },
    { name: 'Bread', purchased: true },
    { name: 'Rice' },
  ])
  await routeApi(context)
  const requests: string[] = []
  page.on('request', (request) => {
    if (
      request.method() !== 'GET' &&
      new URL(request.url()).pathname.startsWith('/api/shopping-list')
    ) {
      requests.push(`${request.method()} ${new URL(request.url()).pathname}`)
    }
  })
  await page.goto('/shopping')
  await expect(page.getByText(/1 pending · 3 purchased/)).toBeVisible()
  await page.getByRole('button', { name: 'Clear purchased (3)' }).click()
  await expect(page.getByRole('checkbox', { name: 'Eggs' })).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: 'Rice' })).toBeVisible()
  expect(requests).toEqual([]) // nothing sent inside the Undo window
  await expect
    .poll(async () => (await serverList(account)).map((r) => r.name), { timeout: HOLD_WINDOW_MS })
    .toEqual(['Rice'])
  expect(requests).toEqual(['POST /api/shopping-list/clear-purchased'])
})

test('F-SL-03 / NC-SL-NO-LOST-ACTION: a held delete is sent when the page is left inside the Undo window', async ({
  page,
  context,
  account,
}) => {
  await seed(account, [{ name: 'Eggs' }, { name: 'Milk' }])
  const goto = async (path: string) => {
    await page.goto(`${app.url}${path}`)
  }
  void context
  await goto('/shopping')
  await page.getByRole('button', { name: 'Delete Eggs' }).click()
  await expect(page.getByRole('checkbox', { name: 'Eggs' })).toHaveCount(0)
  expect((await serverList(account)).map((r) => r.name).sort()).toEqual(['Eggs', 'Milk']) // not sent yet
  await page.goto('about:blank') // leaving the page fires pagehide, as closing the tab does
  await expect
    .poll(async () => (await serverList(account)).map((r) => r.name), {
      timeout: SERVER_SEES_IT_MS,
    })
    .toEqual(['Milk'])
})

test('F-SL-06: Share copies the pending items as "Shopping List:\\n- name (quantity)" when there is no share sheet', async ({
  page,
  context,
  account,
}) => {
  await seed(account, [
    { name: 'Eggs', quantity: '10' },
    { name: 'Milk' },
    { name: 'Bread', purchased: true },
  ])
  await routeApi(context)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
  })
  await page.goto('/shopping')
  await expect(page.getByRole('checkbox', { name: 'Eggs' })).toBeVisible()
  await page.getByRole('button', { name: 'Share' }).click()
  await expect(toast(page, 'Copied to the clipboard')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    // The text follows the list as shown: the API returns the newest row first.
    'Shopping List:\n- Milk\n- Eggs (10)',
  )
})

test('F-SL-05: group by category with purchased last in each group; no sideways scroll; screenshots', async ({
  page,
  context,
  account,
}, info) => {
  await seed(account, [
    { name: 'Eggs', purchased: true },
    { name: 'Milk' },
    { name: 'Flour' },
    { name: 'Soap', purchased: true },
  ])
  await routeApi(context)
  await page.goto('/shopping')
  await page.getByText('Group by category', { exact: true }).click()
  await expect(page.getByRole('heading', { level: 2, name: /Shopping goods/ })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: /No category/ })).toBeVisible()
  const names = await page
    .getByRole('checkbox')
    .evaluateAll((boxes) => boxes.map((b) => b.getAttribute('aria-label')))
  // "Shopping goods" holds Eggs (bought), Flour; "No category" holds Milk, Soap (bought).
  expect(names).toEqual(['Flour', 'Eggs', 'Milk', 'Soap'])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  if (SHOTS) {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.screenshot({ path: `${SHOTS}/shopping-${info.project.name}-${scheme}.png` })
    }
  }
})
