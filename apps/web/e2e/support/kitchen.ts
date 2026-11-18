// Seeds a small kitchen through the real API router for the specs that need rows to look at
// (a11y.spec.ts, step 6.2): two locations, a category, three items (one low, one expiring, one fine).
import type { BrowserContext } from '@playwright/test'
import type { ApiServer } from './api-server'
import { signInRest, type Account } from './supabase'

export type Kitchen = { milkId: number; riceId: number }

export const isoDay = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

/** Calls the real API as the account (the same routes the app uses). */
export async function call<T>(
  api: ApiServer,
  account: Account,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
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

/** Tests in one worker share an account: start each from an empty kitchen. */
export async function clearKitchen(api: ApiServer, account: Account) {
  for (const path of ['/api/inventory', '/api/locations', '/api/shopping-list']) {
    const rows = await call<{ id: number }[]>(api, account, 'GET', path)
    for (const row of rows) await call(api, account, 'DELETE', `${path}/${row.id}`)
  }
}

export async function seedKitchen(api: ApiServer, account: Account): Promise<Kitchen> {
  await clearKitchen(api, account)
  const tag = crypto.randomUUID().slice(0, 6)
  const category = await call<{ id: number }>(api, account, 'POST', '/api/categories', {
    name: `Dairy ${tag}`,
  })
  const fridge = await call<{ id: number }>(api, account, 'POST', '/api/locations', {
    name: 'Fridge',
    subLocation: 'Top shelf',
  })
  const pantry = await call<{ id: number }>(api, account, 'POST', '/api/locations', {
    name: 'Pantry',
  })
  const base = { categoryId: category.id, unit: 'L', quantity: 10, initialQuantity: 10 }
  const milk = await call<{ id: number }>(api, account, 'POST', '/api/inventory', {
    ...base,
    currentQuantity: 10,
    name: 'Milk',
    locationId: fridge.id,
    expirationDate: isoDay(2),
  })
  const rice = await call<{ id: number }>(api, account, 'POST', '/api/inventory', {
    ...base,
    currentQuantity: 1,
    name: 'Rice',
    locationId: pantry.id,
    expirationDate: isoDay(300),
  })
  await call(api, account, 'POST', '/api/shopping-list', { name: 'Eggs', quantity: '12' })
  return { milkId: milk.id, riceId: rice.id }
}

/** Sends the app's /api requests to the real router (the preview server has no API of its own). */
export async function routeApi(context: BrowserContext, api: ApiServer) {
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    try {
      const response = await route.fetch({ url: `${api.baseUrl}${url.pathname}${url.search}` })
      await route.fulfill({ response })
    } catch (error) {
      // A request still in flight when the test ends is not a failure; any other failure reaches the app
      // as a network error (a hung request would fail much later with an unrelated timeout).
      if (!/Test ended|closed|disposed|already handled/i.test(String(error))) {
        await route.abort('failed').catch(() => undefined)
      }
    }
  })
}
