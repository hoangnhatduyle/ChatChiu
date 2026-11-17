// A stand-in for core/supabase.client in tests that render the whole app: the fake auth client
// reports a stored session (or none) as soon as the provider subscribes, and honours unsubscribe.
import type { AuthChangeEvent, Session } from '@supabase/auth-js'
import { vi } from 'vitest'

export const testSession = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  user: { id: 'test-user', email: 'test@chatchiu.test' },
} as unknown as Session

type Listener = (event: AuthChangeEvent, session: Session | null) => void

export function fakeAuthModule(session: Session | null = testSession) {
  const client = {
    onAuthStateChange(callback: Listener) {
      let cancelled = false
      queueMicrotask(() => {
        if (!cancelled) callback('INITIAL_SESSION', session)
      })
      return {
        data: {
          subscription: {
            unsubscribe() {
              cancelled = true
            },
          },
        },
      }
    },
    getSession: vi.fn(() => Promise.resolve({ data: { session }, error: null })),
    signInWithPassword: vi.fn(() => Promise.resolve({ data: { session }, error: null })),
    signOut: vi.fn(() => Promise.resolve({ error: null })),
    refreshSession: vi.fn(() => Promise.resolve({ data: { session }, error: null })),
  }
  return { getAuthClient: () => client, getConfigError: () => null }
}
