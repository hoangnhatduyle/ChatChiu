// Local-Supabase helpers for e2e (AR-NO-SEED-ASSUMPTIONS: every test creates its own user).
// Needs SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY: CI exports them
// (scripts/local-supabase-env.mjs); locally run `export $(node scripts/local-supabase-env.mjs | xargs)`.

export type Account = { email: string; password: string; userId: string }
export type TokenSet = {
  access_token: string
  refresh_token: string
  expires_in: number
  expires_at: number
  token_type: string
  user: { id: string; email?: string }
}

const LOCAL_URL = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/

function env(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set. Run: export $(node scripts/local-supabase-env.mjs | xargs)`,
    )
  }
  return value
}

export function supabaseEnv() {
  const url = env('SUPABASE_URL')
  // The admin API below creates users and reads secrets: never let it point at production.
  if (!LOCAL_URL.test(url)) throw new Error(`e2e refuses a non-local Supabase: ${url}`)
  return { url, anonKey: env('SUPABASE_ANON_KEY'), serviceKey: env('SUPABASE_SERVICE_ROLE_KEY') }
}

/** supabase-js's storage key convention, which core/supabase.client.ts reproduces. */
export function authStorageKey(url: string): string {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
}

async function json(res: Response, what: string): Promise<Record<string, unknown>> {
  if (!res.ok) throw new Error(`${what} failed: ${res.status} ${await res.text()}`)
  const body: unknown = await res.json()
  if (typeof body !== 'object' || body === null) throw new Error(`${what}: unexpected response`)
  return body as Record<string, unknown>
}

function text(body: Record<string, unknown>, field: string, what: string): string {
  const value = body[field]
  if (typeof value !== 'string') throw new Error(`${what}: no "${field}" in the response`)
  return value
}

/** A fresh, confirmed account with a strong password. */
export async function createAccount(): Promise<Account> {
  const { url, serviceKey } = supabaseEnv()
  const email = `e2e-${crypto.randomUUID()}@chatchiu.test`
  const password = `Pw-${crypto.randomUUID()}`
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  const user = await json(res, 'create user')
  return { email, password, userId: text(user, 'id', 'create user') }
}

/** Signs in over GoTrue's REST API and returns the token set the browser client would store. */
export async function signInRest({ email, password }: Account): Promise<TokenSet> {
  const { url, anonKey } = supabaseEnv()
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await json(res, 'sign in')
  text(body, 'access_token', 'sign in')
  text(body, 'refresh_token', 'sign in')
  return body as TokenSet
}

/** A recovery link's token fragment, as GoTrue redirects to it (`access_token=…&type=recovery`). */
export async function recoveryFragment({ email }: Account): Promise<string> {
  const { url, serviceKey } = supabaseEnv()
  const res = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'recovery', email }),
  })
  const actionLink = text(await json(res, 'recovery link'), 'action_link', 'recovery link')
  const verify = await fetch(actionLink, { redirect: 'manual' })
  const location = verify.headers.get('location')
  const fragment = location && URL.canParse(location) ? new URL(location).hash.slice(1) : ''
  if (!fragment.includes('access_token')) {
    throw new Error(`No tokens in the recovery redirect (status ${verify.status})`)
  }
  return fragment
}
