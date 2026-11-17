// A controllable fake of the Supabase auth client for page tests: tests choose what each call
// returns, and `emit` sends auth events the way Supabase does (to every subscribed provider).
import type { AuthChangeEvent, Session } from '@supabase/auth-js'
import { act } from '@testing-library/react'
import { vi } from 'vitest'

type Listener = (event: AuthChangeEvent, session: Session | null) => void

const listeners = new Set<Listener>()

export const fakeAuthClient = {
  onAuthStateChange: vi.fn((callback: Listener) => {
    listeners.add(callback)
    return { data: { subscription: { unsubscribe: () => void listeners.delete(callback) } } }
  }),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
}

/**
 * Sends an auth event from inside a fake client method (a handler that user-event is already
 * driving). No act here: a nested act would restore React's act-environment flag to a stale false.
 */
export function emitAuthFromClient(event: AuthChangeEvent, session: Session | null): void {
  for (const callback of [...listeners]) callback(event, session)
}

/** Sends an auth event from the test body, inside act. */
export function emitAuth(event: AuthChangeEvent, session: Session | null): Promise<void> {
  return act(async () => {
    for (const callback of [...listeners]) callback(event, session)
  })
}

/** Clears every call, answer and subscriber between tests. */
export function resetFakeAuth(): void {
  listeners.clear()
  for (const fn of Object.values(fakeAuthClient)) fn.mockReset()
  fakeAuthClient.onAuthStateChange.mockImplementation((callback: Listener) => {
    listeners.add(callback)
    return { data: { subscription: { unsubscribe: () => void listeners.delete(callback) } } }
  })
}
