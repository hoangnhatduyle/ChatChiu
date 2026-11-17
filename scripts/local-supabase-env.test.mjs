import { describe, expect, it } from 'vitest'
import { parseStatusEnv, toEnvLines } from './local-supabase-env.mjs'

const STATUS = `API_URL="http://127.0.0.1:54321"
ANON_KEY="anon.jwt"
SERVICE_ROLE_KEY="service.jwt"
JWT_SECRET="x"`

describe('local-supabase-env', () => {
  it('turns `supabase status -o env` into the web build and e2e variables', () => {
    expect(toEnvLines(parseStatusEnv(STATUS))).toEqual([
      'VITE_SUPABASE_URL=http://127.0.0.1:54321',
      'VITE_SUPABASE_ANON_KEY=anon.jwt',
      'SUPABASE_URL=http://127.0.0.1:54321',
      'SUPABASE_ANON_KEY=anon.jwt',
      'SUPABASE_SERVICE_ROLE_KEY=service.jwt',
    ])
  })

  it('--vite output carries only the browser-safe variables, never the service-role key', () => {
    const lines = toEnvLines(parseStatusEnv(STATUS), { webOnly: true })
    expect(lines).toEqual([
      'VITE_SUPABASE_URL=http://127.0.0.1:54321',
      'VITE_SUPABASE_ANON_KEY=anon.jwt',
    ])
  })

  it('refuses a status that is missing a key instead of printing "undefined"', () => {
    const noKey = { API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'a' }
    expect(() => toEnvLines(noKey)).toThrow(/SERVICE_ROLE_KEY/)
  })

  it('refuses a stack that is not local, so production keys are never handed out', () => {
    const remote = { API_URL: 'https://abc.supabase.co', ANON_KEY: 'a', SERVICE_ROLE_KEY: 's' }
    expect(() => toEnvLines(remote)).toThrow(/non-local/)
  })
})
