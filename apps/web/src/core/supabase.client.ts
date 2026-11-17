// The only module that creates a Supabase client (AR-NO-DIRECT-API). Decision 815e65dc (roadmap
// 7.0.15): the web app uses @supabase/auth-js alone, about 24 KB gz instead of supabase-js's 58.
// Data goes through our own API (core/api-client, step 4.2), so postgrest, storage and functions
// would be dead weight; Realtime (step 4.6) will add @supabase/realtime-js, loaded after boot.
import { GoTrueClient } from '@supabase/auth-js'

export type { AuthChangeEvent, Session, User } from '@supabase/auth-js'

export type SupabaseConfig = { url: string; anonKey: string }

/** The key the client stores its session under: supabase-js's own convention, `sb-<host label>-auth-token`. */
export function authStorageKey(url: string): string {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
}

/** Builds an auth client for `config`. Tests and tooling use this; the app uses getAuthClient(). */
export function createAuthClient(
  { url, anonKey }: SupabaseConfig,
  options: {
    persistSession?: boolean
    autoRefreshToken?: boolean
    detectSessionInUrl?: boolean
  } = {},
): GoTrueClient {
  return new GoTrueClient({
    url: new URL('auth/v1', url.endsWith('/') ? url : `${url}/`).href,
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    storageKey: authStorageKey(url),
    autoRefreshToken: options.autoRefreshToken ?? true,
    persistSession: options.persistSession ?? true,
    detectSessionInUrl: options.detectSessionInUrl ?? true,
  })
}

type SupabaseEnv = { VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string }

/** The role claim of a JWT, or null when the token is not a decodable JWT. */
function jwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1] ?? ''
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const role: unknown = (JSON.parse(json) as { role?: unknown }).role
    return typeof role === 'string' ? role : null
  } catch {
    return null
  }
}

/**
 * Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Both are published in the bundle by design (the
 * anon key is guarded by RLS), so a service-role key in either is refused outright.
 */
export function readSupabaseConfig(env: SupabaseEnv = import.meta.env): SupabaseConfig {
  const url = env.VITE_SUPABASE_URL?.trim()
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY at build time.',
    )
  }
  if (!URL.canParse(url)) {
    throw new Error('Supabase settings are invalid: VITE_SUPABASE_URL is not a URL.')
  }
  if (jwtRole(anonKey) === 'service_role') {
    throw new Error(
      'Supabase settings are invalid: VITE_SUPABASE_ANON_KEY holds a service-role key, which must never ship to a browser.',
    )
  }
  return { url, anonKey }
}

/** The configuration problem as a message, or null when the settings are usable. Builds no client. */
export function getConfigError(env: SupabaseEnv = import.meta.env): string | null {
  try {
    readSupabaseConfig(env)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Supabase is not configured.'
  }
}

let client: GoTrueClient | undefined

/** The app's single auth client, created on first use. Throws when the build has no Supabase settings. */
export function getAuthClient(): GoTrueClient {
  client ??= createAuthClient(readSupabaseConfig())
  return client
}
