// Step 6.5 e2e (security, roadmap 7.0.17 "a script CSP header"): the built app runs under the exact headers vercel.json
// sends in production, and no screen breaks the Content-Security-Policy. The policy itself is read from vercel.json (the
// one source of truth); only the local Supabase origins are added to connect-src and img-src, because production's
// `*.supabase.co` does not match 127.0.0.1. The last test proves the policy is really enforced in this setup.
import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { startApiServer, type ApiServer } from './support/api-server'
import { startAppServer, type AppServer } from './support/app-server'
import { seedKitchen, type Kitchen } from './support/kitchen'
import {
  authStorageKey,
  createAccount,
  signInRest,
  supabaseEnv,
  type TokenSet,
} from './support/supabase'
import { expect, test } from './support/test'

type Header = { key: string; value: string }
const VERCEL = JSON.parse(
  readFileSync(new URL('../../../vercel.json', import.meta.url), 'utf8'),
) as { headers: Array<{ source: string; headers: Header[] }> }

/** The headers vercel.json sends for every page, with the local Supabase origins allowed where production names *.supabase.co. */
function productionHeaders(): Record<string, string> {
  const all = VERCEL.headers.find((h) => h.source === '/(.*)')!.headers
  const { url } = supabaseEnv()
  const origin = new URL(url)
  const local = `${origin.origin} ws://${origin.host}`
  return Object.fromEntries(
    all.map(({ key, value }) =>
      key === 'Content-Security-Policy'
        ? [
            key,
            value
              .replace('connect-src', `connect-src ${local}`)
              .replace('img-src', `img-src ${origin.origin}`)
              // The local server is plain http, so the https upgrade would break every request.
              .replace('; upgrade-insecure-requests', ''),
          ]
        : [key, value],
    ),
  )
}

let api: ApiServer
let app: AppServer
let kitchen: Kitchen
let session: TokenSet

test.use({ signedIn: false })

test.beforeAll(async () => {
  api = await startApiServer('csp.spec')
  app = await startAppServer(api.baseUrl, { headers: productionHeaders() })
  const account = await createAccount()
  session = await signInRest(account)
  kitchen = await seedKitchen(api, account)
})
test.afterAll(async () => {
  await app.close()
  await api.close()
})

/** Every CSP violation the page reports, from the DOM event and from the console. */
async function watchViolations(page: Page): Promise<string[]> {
  const violations: string[] = []
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      ;(window as unknown as { __csp: string[] }).__csp ??= []
      ;(window as unknown as { __csp: string[] }).__csp.push(
        `${e.violatedDirective} ${e.blockedURI}`,
      )
    })
  })
  page.on('console', (m) => {
    if (/Content Security Policy|violates the following/i.test(m.text())) violations.push(m.text())
  })
  return violations
}
const domViolations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])

test.beforeEach(async ({ context }) => {
  await context.addInitScript<[string, string]>(
    ([k, v]) => window.localStorage.setItem(k, v),
    [authStorageKey(supabaseEnv().url), JSON.stringify(session)],
  )
})

test('the policy has no unsafe-eval, no inline scripts, no framing and no plugins', () => {
  const csp = productionHeaders()['Content-Security-Policy']!
  const directive = (name: string) =>
    csp
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${name} `))
  expect(csp).not.toContain("'unsafe-eval'")
  expect(directive('script-src')).toBe("script-src 'self'")
  expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'")
  expect(directive('object-src')).toBe("object-src 'none'")
  expect(directive('base-uri')).toBe("base-uri 'self'")
  expect(directive('form-action')).toBe("form-action 'self'")
  expect(directive('default-src')).toBe("default-src 'self'")
})

test('the production headers are all present', () => {
  const headers = productionHeaders()
  for (const name of [
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'Cross-Origin-Opener-Policy',
    'Cross-Origin-Resource-Policy',
    'Content-Security-Policy',
  ]) {
    expect(headers[name], name).toBeTruthy()
  }
  expect(headers['X-Content-Type-Options']).toBe('nosniff')
  expect(headers['X-Frame-Options']).toBe('DENY')
  expect(headers['Permissions-Policy']).toContain('microphone=()')
})

test('every screen runs under the production CSP with no violation', async ({ page }) => {
  const consoleViolations = await watchViolations(page)
  const screens: Array<[string, string | RegExp]> = [
    ['/', /Open Milk/],
    [`/?item=${kitchen.milkId}`, 'dialog'],
    ['/stock', /Open Rice/],
    ['/shopping', 'Eggs'],
    ['/meals', 'heading'],
    ['/stats', 'heading'],
    ['/settings', 'heading'],
    ['/stock/new', 'heading'],
    ['/scan', 'heading'],
  ]
  const domFound: string[] = []
  for (const [path, ready] of screens) {
    await page.goto(`${app.url}${path}`)
    if (ready === 'dialog') await expect(page.getByRole('dialog')).toBeVisible()
    else if (ready === 'heading') await expect(page.getByRole('heading').first()).toBeVisible()
    else if (typeof ready === 'string')
      await expect(page.getByText(ready, { exact: true })).toBeVisible()
    else await expect(page.getByRole('button', { name: ready })).toBeVisible()
    // The page's own record is reset by the next navigation: read it for each screen.
    domFound.push(...(await domViolations(page)).map((v) => `${path}: ${v}`))
  }
  // The service worker registers under worker-src, and the live-update channel connects under connect-src.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  expect(consoleViolations).toEqual([])
  expect(domFound).toEqual([])
})

test('the policy is enforced here: an injected inline script and an off-origin fetch are blocked', async ({
  page,
}) => {
  await watchViolations(page)
  await page.goto(`${app.url}/`)
  await expect(page.getByRole('button', { name: /Open Milk/ })).toBeVisible()
  const ran = await page.evaluate(() => {
    const s = document.createElement('script')
    s.textContent = 'window.__injected = true'
    document.head.appendChild(s)
    return (window as unknown as { __injected?: boolean }).__injected === true
  })
  expect(ran).toBe(false)
  const reached = await page.evaluate(() =>
    fetch('https://example.com/', { mode: 'no-cors' }).then(
      () => true,
      () => false,
    ),
  )
  expect(reached).toBe(false)
  const violations = await domViolations(page)
  expect(violations.some((v) => v.startsWith('script-src'))).toBe(true)
  expect(violations.some((v) => v.startsWith('connect-src'))).toBe(true)
})
