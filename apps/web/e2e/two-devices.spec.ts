// F-AU-06 / F-SE-07 / NC-AU-SIGNOUT-SCOPE (roadmap 7.0.24): two browser contexts on one account, each with its own
// session. Signing out on one ends only that session: the other stays signed in, its refresh token still works
// and the board still shows her items.
import type { Browser, BrowserContext } from '@playwright/test'
import { startApiServer, type ApiServer } from './support/api-server'
import { routeApi, seedKitchen } from './support/kitchen'
import { authStorageKey, signInRest, supabaseEnv, type Account } from './support/supabase'
import { expect, test } from './support/test'

let api: ApiServer
test.beforeAll(async () => {
  api = await startApiServer('two-devices.spec')
})
test.afterAll(async () => {
  await api.close()
})

test.use({ signedIn: false })

/** A browser context that starts signed in with its own session of the account (a second device). */
async function device(browser: Browser, account: Account) {
  const tokens = await signInRest(account)
  const { use } = test.info().project
  const context = await browser.newContext({ baseURL: use.baseURL, colorScheme: use.colorScheme })
  await context.addInitScript<[string, string]>(
    ([k, v]) => {
      if (!window.localStorage.getItem(k)) window.localStorage.setItem(k, v)
    },
    [authStorageKey(supabaseEnv().url), JSON.stringify(tokens)],
  )
  await routeApi(context, api)
  return { context, tokens }
}

/** True while GoTrue still honours the session behind this access token (a signed-out session answers 4xx). */
async function sessionAlive(accessToken: string): Promise<boolean> {
  const { url, anonKey } = supabaseEnv()
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  })
  return res.ok
}

test('F-AU-06: signing out on one device leaves the other device signed in', async ({
  browser,
  account,
}) => {
  await seedKitchen(api, account)
  const tablet = await device(browser, account)
  const phone = await device(browser, account)
  const contexts: BrowserContext[] = [tablet.context, phone.context]
  try {
    const tabletPage = await tablet.context.newPage()
    const phonePage = await phone.context.newPage()
    await tabletPage.goto('/')
    await phonePage.goto('/')
    await expect(tabletPage.getByRole('button', { name: 'Open Milk' })).toBeVisible()
    await expect(phonePage.getByRole('button', { name: 'Open Milk' })).toBeVisible()

    await tabletPage.goto('/settings')
    await tabletPage.getByRole('button', { name: 'Sign out' }).click()
    await expect(tabletPage).toHaveURL(/\/login/)

    // The phone is untouched: still on the board, still the same page after a reload.
    await phonePage.reload()
    await expect(phonePage.getByRole('button', { name: 'Open Milk' })).toBeVisible()
    await expect(phonePage).not.toHaveURL(/\/login/)

    // On the server only the tablet's session ended (checked with the access tokens, which uses up no refresh token).
    expect(await sessionAlive(tablet.tokens.access_token)).toBe(false)
    expect(await sessionAlive(phone.tokens.access_token)).toBe(true)
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
  }
})
