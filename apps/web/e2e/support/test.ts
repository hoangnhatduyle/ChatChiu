// `test` for specs that need the app signed in (SPEC-AU-001). Each worker creates its own account in
// the local Supabase; the browser starts with that account's session already stored, exactly as
// after a real sign-in. Set `test.use({ signedIn: false })` for a visitor with no session.
import { test as base } from '@playwright/test'
import { authStorageKey, createAccount, signInRest, supabaseEnv, type Account } from './supabase'

type Options = { signedIn: boolean }
type WorkerFixtures = { account: Account }

export const test = base.extend<Options, WorkerFixtures>({
  signedIn: [true, { option: true }],
  account: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured first argument
    async ({}, use) => {
      await use(await createAccount())
    },
    { scope: 'worker' },
  ],
  context: async ({ context, account, signedIn }, provide) => {
    if (signedIn) {
      const tokens = await signInRest(account)
      const key = authStorageKey(supabaseEnv().url)
      // Seed only when storage is empty, so a reload never overwrites the rotated refresh token the app
      // has stored since. (After a sign-out the next load seeds again: use `signedIn: false` for that.)
      await context.addInitScript<[string, string]>(
        ([k, v]) => {
          if (!window.localStorage.getItem(k)) window.localStorage.setItem(k, v)
        },
        [key, JSON.stringify(tokens)],
      )
    }
    await provide(context)
  },
})

export { expect } from '@playwright/test'
