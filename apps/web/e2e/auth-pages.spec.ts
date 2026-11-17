// Step 5.11 e2e against the local Supabase (SPEC-AU-001): the login, register and reset-password
// pages in a real browser with real accounts, on the tablet and the phone. A real registration is not
// covered here: it sends a confirmation email and CI starts Supabase without a mail server (roadmap 7.0.23).
import { createAccount, recoveryFragment } from './support/supabase'
import { expect, test } from './support/test'

test.use({ signedIn: false })

test('F-AU-01: signing in lands on the board and the session survives a reload', async ({
  page,
  account,
}) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel(/^Password/).fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Kitchen' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Kitchen' })).toBeVisible()
})

test('F-AU-05: after signing in she returns to the page she asked for', async ({
  page,
  account,
}) => {
  await page.goto('/stock')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel(/^Password/).fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/stock$/)
})

test('F-AU-01: a wrong password shows the reason and keeps the form', async ({ page, account }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel(/^Password/).fill('not-the-password-123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(
    page.getByRole('alert').filter({ hasText: /invalid login credentials/i }),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled()
})

test('F-AU-02 / NC-AU-NO-WEAK-PASSWORD: a short password and a mismatch are refused inline', async ({
  page,
}) => {
  await page.goto('/register')
  await page.getByLabel('Username').fill('Chiu')
  await page.getByLabel('Email').fill('x@chatchiu.test')
  await page.getByLabel(/^Password/).fill('short')
  await page.getByLabel('Confirm password').fill('other')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Use at least 12 characters for the password.')).toBeVisible()
  await expect(page.getByText('The passwords do not match.')).toBeVisible()
  await expect(page.getByLabel(/^Password/)).toBeFocused()
})

test('F-AU-03 / NC-AU-NO-ENUMERATION: asking for a reset link gives the same answer for any address', async ({
  page,
}) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await page.getByLabel('Email').fill(`nobody-${crypto.randomUUID()}@chatchiu.test`)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByText(/if an account exists/i)).toBeVisible()
})

test.describe('recovery link', () => {
  test('F-AU-07 / F-AU-03: a link opened on /login asks for a new password, saves it and signs her in', async ({
    page,
  }) => {
    const account = await createAccount()
    const fragment = await recoveryFragment(account)
    await page.goto(`/login#${fragment}`)
    await expect(page).toHaveURL(/\/reset-password/)
    await page.getByLabel('New password').fill('A-brand-new-password-1')
    await page.getByLabel('Confirm password').fill('A-brand-new-password-1')
    await page.getByRole('button', { name: 'Save password' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Kitchen' })).toBeVisible()
  })

  test('F-AU-08: Cancel ends the recovery session and lands on /login', async ({ page }) => {
    const account = await createAccount()
    const fragment = await recoveryFragment(account)
    await page.goto(`/register#${fragment}`)
    await expect(page).toHaveURL(/\/reset-password/)
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page).toHaveURL(/\/login$/)
    // The recovery session is gone: a protected page now asks her to sign in.
    await page.goto('/stock')
    await expect(page).toHaveURL(/\/login$/)
  })
})
