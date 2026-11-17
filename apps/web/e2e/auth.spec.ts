// Step 4.1 e2e against the local Supabase (SPEC-AU-001): the route guard, a persisted session and a
// recovery link, in a real browser with a real account. The login, register and reset pages are
// placeholders until step 5.11, so sign-in itself is covered at the client level in auth-core.spec.ts.
import { expect, test } from './support/test'
import { recoveryFragment } from './support/supabase'

test.describe('signed out', () => {
  test.use({ signedIn: false })

  test('F-AU-05: a protected page redirects to /login and nothing protected shows', async ({
    page,
  }) => {
    await page.goto('/stock?tab=a')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
    const from = await page.evaluate(
      () => (window.history.state?.usr as { from?: string } | null)?.from,
    )
    expect(from).toBe('/stock?tab=a')
  })

  test('F-AU-05: login, register and reset-password open without a session', async ({ page }) => {
    for (const [path, title] of [
      ['/login', 'Sign in'],
      ['/register', 'Create account'],
      ['/reset-password', 'Reset password'],
    ] as const) {
      await page.goto(path)
      await expect(page).toHaveURL(new RegExp(`${path}$`))
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    }
  })

  test('F-AU-03: a real recovery link lands on /reset-password, not on a protected page', async ({
    page,
    account,
  }) => {
    const fragment = await recoveryFragment(account)
    await page.goto(`/stock#${fragment}`)
    await expect(page).toHaveURL(/\/reset-password/)
    await expect(page.getByRole('heading', { level: 1, name: 'Reset password' })).toBeVisible()
    // The tokens were taken out of the address bar (NC-AU-NO-TOKEN-STORAGE-LEAK).
    expect(page.url()).not.toContain('access_token')
  })
})

test.describe('signed in', () => {
  test('F-AU-01: the stored session opens the board and survives a reload', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Kitchen' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Kitchen' })).toBeVisible()
    await expect(page).not.toHaveURL(/login/)
  })

  test('F-AU-05: an invalid stored session sends her to /login', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      for (const k of Object.keys(window.localStorage)) {
        if (k.startsWith('sb-')) window.localStorage.setItem(k, '{"broken":')
      }
    })
    await page.reload()
    await expect(page).toHaveURL(/\/login$/)
  })
})
