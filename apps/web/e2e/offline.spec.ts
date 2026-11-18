// Step 6.3 e2e (SPEC-AP-001 F-AP-01, NC-AP-NO-LOST-WRITES): with the real service worker, the real API router and local
// Supabase behind it, a usage drag made with the pointer while offline shows at once with a "waiting to sync" badge,
// survives a reload and closing the page, reaches the server once the device is back online, and is saved exactly once.
// (board.spec.ts keeps the keyboard variant from roadmap 7.0.18.)
import type { BrowserContext, Page } from '@playwright/test'
import { startApiServer, type ApiServer } from './support/api-server'
import { call, routeApi, seedKitchen } from './support/kitchen'
import type { Account } from './support/supabase'
import { expect, test } from './support/test'

let api: ApiServer
test.beforeAll(async () => {
  api = await startApiServer('offline.spec')
})
test.afterAll(async () => {
  await api.close()
})

const SYNC_WITHIN_MS = 15_000
const OFFLINE_RELOAD_TRIES_MS = 10_000

const milk = (page: Page) => page.getByRole('button', { name: /^Open Milk\b/ })
// The board row itself (the Undo toast is also a list item that mentions Milk).
const milkRow = (page: Page) => page.getByRole('listitem').filter({ has: milk(page) })
const milkLevel = (page: Page) => page.getByRole('slider', { name: /How much Milk is left/ })
const badge = (page: Page) => page.locator('[data-sync-badge]')

type Item = { id: number; currentQuantity: number }
const serverMilk = async (account: Account, id: number) =>
  (await call<Item[]>(api, account, 'GET', '/api/inventory')).find((i) => i.id === id)
    ?.currentQuantity

/** Opens the board once with the service worker in control and the data cached, so a later load works offline. */
async function warmUp(page: Page) {
  await page.goto('/')
  await expect(milk(page)).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await expect(milk(page)).toBeVisible()
}

/** Grabs Milk's thumb (where it is now) and drags it to `percent` of the track, as a finger would. */
async function dragMilkTo(page: Page, percent: number) {
  const level = milkLevel(page)
  const thumb = (await level.locator('xpath=ancestor::*[@data-usage-thumb]').boundingBox())!
  const track = (await level.locator('xpath=ancestor::*[@data-usage-track]').boundingBox())!
  const y = track.y + track.height / 2
  await page.mouse.move(thumb.x + thumb.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(track.x + (track.width * percent) / 100, y, { steps: 8 })
  await page.mouse.up()
}

async function goOffline(context: BrowserContext, page: Page) {
  await context.setOffline(true)
  // The board comes from the saved cache: if the first save to IndexedDB is still in flight, the reload is tried again.
  await expect(async () => {
    await page.reload()
    await expect(milk(page)).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: OFFLINE_RELOAD_TRIES_MS })
  await expect(badge(page)).toHaveText(/^Offline$/)
}

test('F-AP-01: a drag made offline shows a waiting badge, survives a reload, and is saved once when back online', async ({
  page,
  context,
  account,
}) => {
  const { milkId } = await seedKitchen(api, account)
  await routeApi(context, api)
  await warmUp(page)
  await goOffline(context, page)

  await dragMilkTo(page, 40)
  await expect(milkRow(page).getByText('40%', { exact: true })).toBeVisible()
  await expect(milkLevel(page)).toHaveValue('40')
  await expect(badge(page)).toHaveText('Offline · 1 change waiting to sync')
  expect(await serverMilk(account, milkId)).toBe(10) // nothing reached the server yet

  await page.reload()
  await expect(milkRow(page).getByText('40%', { exact: true })).toBeVisible()
  await expect(milkLevel(page)).toHaveValue('40')
  await expect(badge(page)).toHaveText('Offline · 1 change waiting to sync')

  await context.setOffline(false)
  await expect.poll(() => serverMilk(account, milkId), { timeout: SYNC_WITHIN_MS }).toBe(4)
  await expect(badge(page)).toHaveCount(0) // the bar only clears once the device is reachable: the server poll above proves the save
  const usage = await call<unknown[]>(api, account, 'GET', `/api/inventory/${milkId}/usage`)
  expect(usage).toHaveLength(1)
})

test('F-AP-01: two drags made offline wait as 2 changes and both are saved once back online', async ({
  page,
  context,
  account,
}) => {
  const { milkId } = await seedKitchen(api, account)
  await routeApi(context, api)
  await warmUp(page)
  await goOffline(context, page)

  await dragMilkTo(page, 60)
  await expect(milkRow(page).getByText('60%', { exact: true })).toBeVisible()
  await expect(milkLevel(page)).toHaveValue('60')
  await expect(badge(page)).toHaveText('Offline · 1 change waiting to sync')
  await dragMilkTo(page, 30)
  await expect(milkRow(page).getByText('30%', { exact: true })).toBeVisible()
  await expect(milkLevel(page)).toHaveValue('30')
  await expect(badge(page)).toHaveText('Offline · 2 changes waiting to sync')

  await context.setOffline(false)
  await expect.poll(() => serverMilk(account, milkId), { timeout: SYNC_WITHIN_MS }).toBe(3)
  const usage = await call<unknown[]>(api, account, 'GET', `/api/inventory/${milkId}/usage`)
  expect(usage).toHaveLength(2)
})

test('NC-AP-NO-LOST-WRITES: a change queued offline is still queued after its page is closed and a new page is opened', async ({
  page,
  context,
  account,
}) => {
  const { milkId } = await seedKitchen(api, account)
  await routeApi(context, api)
  await warmUp(page)
  await goOffline(context, page)
  await dragMilkTo(page, 40)
  await expect(badge(page)).toHaveText('Offline · 1 change waiting to sync')

  await page.close() // the page is closed with the change still waiting (the context keeps its IndexedDB)
  const reopened = await context.newPage()
  await reopened.goto('/')
  await expect(milkRow(reopened).getByText('40%', { exact: true })).toBeVisible()
  await expect(badge(reopened)).toHaveText('Offline · 1 change waiting to sync')
  expect(await serverMilk(account, milkId)).toBe(10)

  await context.setOffline(false)
  await expect.poll(() => serverMilk(account, milkId), { timeout: SYNC_WITHIN_MS }).toBe(4)
})
