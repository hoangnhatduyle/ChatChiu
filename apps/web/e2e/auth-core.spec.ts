// Step 4.1: the real Supabase sign-in, in Node (no page): the same auth client the app builds
// (core/supabase.client.ts) against the local GoTrue. The browser has no sign-in form until 5.11.
import { expect, test } from '@playwright/test'
import { createAuthClient } from '../src/core/supabase.client'
import { createAccount, supabaseEnv } from './support/supabase'

const config = () => {
  const { url, anonKey } = supabaseEnv()
  return { url, anonKey }
}
const memoryClient = () =>
  createAuthClient(config(), {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  })

test('F-AU-01: signs in with email and password against local Supabase and rejects a wrong password', async () => {
  const account = await createAccount()
  const auth = memoryClient()
  const ok = await auth.signInWithPassword({ email: account.email, password: account.password })
  expect(ok.error).toBeNull()
  expect(ok.data.session?.user.id).toBe(account.userId)
  const bad = await memoryClient().signInWithPassword({
    email: account.email,
    password: 'wrong-password-123',
  })
  expect(bad.error?.message).toMatch(/invalid login credentials/i)
})

test("F-AU-06: signOut({ scope: 'local' }) ends this session only; 'global' would end every device's", async () => {
  const account = await createAccount()
  const phone = memoryClient()
  const tablet = memoryClient()
  await phone.signInWithPassword({ email: account.email, password: account.password })
  const tabletSession = (
    await tablet.signInWithPassword({ email: account.email, password: account.password })
  ).data.session
  expect(tabletSession).not.toBeNull()

  expect((await phone.signOut({ scope: 'local' })).error).toBeNull()
  // The tablet's token is still accepted by the server.
  const still = await memoryClient().getUser(tabletSession?.access_token)
  expect(still.error).toBeNull()
  expect(still.data.user?.id).toBe(account.userId)
})

test("F-AU-06: the contrast is real: signOut({ scope: 'global' }) does end the other device's session", async () => {
  const account = await createAccount()
  const phone = memoryClient()
  const tablet = memoryClient()
  await phone.signInWithPassword({ email: account.email, password: account.password })
  const tabletSession = (
    await tablet.signInWithPassword({ email: account.email, password: account.password })
  ).data.session
  await phone.signOut({ scope: 'global' })
  const gone = await memoryClient().getUser(tabletSession?.access_token)
  expect(gone.error).not.toBeNull()
})

test('NC-AU-NO-WEAK-PASSWORD: the project itself also refuses a password under 12 characters', async () => {
  const result = await memoryClient().signUp({
    email: `e2e-${crypto.randomUUID()}@chatchiu.test`,
    password: 'Short1aA',
  })
  expect(result.error).not.toBeNull()
})
