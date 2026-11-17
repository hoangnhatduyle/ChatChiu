import { authStorageKey, getConfigError, readSupabaseConfig } from './supabase.client'

const jwt = (role: string) => `h.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.s`
const ok = { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: jwt('anon') }

describe('supabase.client configuration', () => {
  it('F-AU-01: reads the URL and anon key', () => {
    expect(readSupabaseConfig(ok)).toEqual({
      url: ok.VITE_SUPABASE_URL,
      anonKey: ok.VITE_SUPABASE_ANON_KEY,
    })
  })

  it('F-AU-01: names the missing variable', () => {
    expect(() => readSupabaseConfig({ VITE_SUPABASE_ANON_KEY: 'k' })).toThrow(/VITE_SUPABASE_URL/)
    expect(() => readSupabaseConfig({ VITE_SUPABASE_URL: 'http://x' })).toThrow(
      /VITE_SUPABASE_ANON_KEY/,
    )
  })

  it('F-AU-01: names the variable when the URL is not a URL', () => {
    expect(() => readSupabaseConfig({ ...ok, VITE_SUPABASE_URL: 'not a url' })).toThrow(
      /VITE_SUPABASE_URL/,
    )
  })

  it('NC-AU-NO-TOKEN-STORAGE-LEAK: refuses a service-role key, which VITE_ variables would publish', () => {
    expect(() =>
      readSupabaseConfig({ ...ok, VITE_SUPABASE_ANON_KEY: jwt('service_role') }),
    ).toThrow(/service/i)
  })

  it('F-AU-01: getConfigError is null for good settings and the message for bad ones, without building a client', () => {
    expect(getConfigError(ok)).toBeNull()
    expect(getConfigError({})).toMatch(/not configured/i)
  })

  it('F-AU-01: the storage key follows supabase-js (sb-<host label>-auth-token)', () => {
    expect(authStorageKey('https://abcd.supabase.co')).toBe('sb-abcd-auth-token')
  })
})
