// SPEC-AU-001 session state machine, as pure functions. `transition` is the spec's table (and
// only that table), `applyAuthEvent` maps Supabase auth events onto it, so the two forbidden
// transitions (SIGNED_OUT -> SIGNED_IN, PASSWORD_RECOVERY -> SIGNED_OUT) cannot happen by accident.
import type { AuthChangeEvent, Session } from '@supabase/auth-js'

export const SESSION_STATES = [
  'SIGNED_OUT',
  'SIGNING_IN',
  'SIGNED_IN',
  'PASSWORD_RECOVERY',
  'EXPIRED',
] as const
export type SessionState = (typeof SESSION_STATES)[number]

export const SESSION_EVENTS = [
  'submit_credentials',
  'auth_ok',
  'auth_error',
  'token_refreshed',
  'api_401_after_refresh',
  'show_session_expired',
  'sign_out',
  'open_recovery_link',
  'new_password_saved',
] as const
export type SessionEvent = (typeof SESSION_EVENTS)[number]

const TRANSITIONS: Readonly<Record<SessionState, Partial<Record<SessionEvent, SessionState>>>> = {
  SIGNED_OUT: { submit_credentials: 'SIGNING_IN', open_recovery_link: 'PASSWORD_RECOVERY' },
  SIGNING_IN: { auth_ok: 'SIGNED_IN', auth_error: 'SIGNED_OUT' },
  SIGNED_IN: {
    token_refreshed: 'SIGNED_IN',
    api_401_after_refresh: 'EXPIRED',
    sign_out: 'SIGNED_OUT',
  },
  PASSWORD_RECOVERY: { new_password_saved: 'SIGNED_IN' },
  EXPIRED: { show_session_expired: 'SIGNED_OUT' },
}

/** The next state, or the same state when the spec does not allow `event` here. */
export function transition(state: SessionState, event: SessionEvent): SessionState {
  return TRANSITIONS[state][event] ?? state
}

/**
 * What the provider holds. `ready` is false until Supabase has reported what it found in storage;
 * it is the pre-state that lets a persisted session restore as SIGNED_IN without breaking the
 * SIGNED_OUT -> SIGNED_IN rule (the sign-in happened in an earlier visit).
 */
export type SessionSnapshot = {
  ready: boolean
  state: SessionState
  session: Session | null
  /** True after a 401 ended the session: the login page shows "Your session expired". */
  expired: boolean
}

export const INITIAL_SNAPSHOT: SessionSnapshot = {
  ready: false,
  state: 'SIGNED_OUT',
  session: null,
  expired: false,
}

/** Walks the allowed transitions to SIGNED_IN, never jumping straight from SIGNED_OUT. */
function reachSignedIn(from: SessionState): SessionState {
  let state = from
  if (state === 'EXPIRED') state = transition(state, 'show_session_expired')
  if (state === 'SIGNED_OUT') state = transition(state, 'submit_credentials')
  if (state === 'SIGNING_IN') state = transition(state, 'auth_ok')
  return state
}

/** Walks the allowed transitions to SIGNED_OUT from any state except PASSWORD_RECOVERY (which may not leave that way). */
function reachSignedOut(from: SessionState): SessionState {
  switch (from) {
    case 'SIGNED_IN':
      return transition(from, 'sign_out')
    case 'SIGNING_IN':
      return transition(from, 'auth_error')
    case 'EXPIRED':
      return transition(from, 'show_session_expired')
    default:
      return from
  }
}

/** True when two snapshots would render the same, so the provider can skip a re-render. */
export function sameSnapshot(a: SessionSnapshot, b: SessionSnapshot): boolean {
  return (
    a.ready === b.ready &&
    a.state === b.state &&
    a.expired === b.expired &&
    a.session?.access_token === b.session?.access_token &&
    a.session?.user.id === b.session?.user.id
  )
}

/**
 * Applies one Supabase auth event. `expiring` is true when the app itself is ending the session after
 * a 401. Events not listed (MFA, etc.) change nothing but `ready`.
 */
export function applyAuthEvent(
  prev: SessionSnapshot,
  event: AuthChangeEvent,
  session: Session | null,
  expiring: boolean,
): SessionSnapshot {
  const recovering = prev.state === 'PASSWORD_RECOVERY'
  switch (event) {
    case 'INITIAL_SESSION':
      if (recovering) {
        // A recovery link in the address bar starts us in PASSWORD_RECOVERY (provider). If Supabase then
        // finds no session (an expired or used link), there is nothing to recover: start signed out.
        // This is the bootstrap, not a transition out of recovery, so the forbidden rule is untouched.
        if (!prev.ready && !session) return { ...INITIAL_SNAPSHOT, ready: true }
        return { ...prev, ready: true }
      }
      if (!session) return { ...prev, ready: true, state: 'SIGNED_OUT', session: null }
      return { ready: true, state: 'SIGNED_IN', session, expired: false }

    case 'SIGNED_IN':
      if (!session) return { ...prev, ready: true } // a sign-in always carries a session
      if (recovering) return { ...prev, ready: true, session }
      return { ready: true, state: reachSignedIn(prev.state), session, expired: false }

    case 'TOKEN_REFRESHED':
      // A refreshed token only means something when there is a session to refresh.
      if (prev.state !== 'SIGNED_IN' && !recovering) return { ...prev, ready: true }
      return { ...prev, ready: true, session: session ?? prev.session }

    case 'PASSWORD_RECOVERY': {
      const state = transition(
        recovering ? 'SIGNED_OUT' : reachSignedOut(prev.state),
        'open_recovery_link',
      )
      return { ready: true, state, session, expired: false }
    }

    case 'USER_UPDATED':
      if (recovering) {
        const current = session ?? prev.session
        if (!current) return { ...prev, ready: true }
        return {
          ready: true,
          state: transition(prev.state, 'new_password_saved'),
          session: current,
          expired: false,
        }
      }
      if (prev.state !== 'SIGNED_IN') return { ...prev, ready: true }
      return { ...prev, ready: true, session: session ?? prev.session }

    case 'SIGNED_OUT': {
      // A recovery link must end in a new password, never in a silent return to the login page.
      if (recovering) return { ...prev, ready: true }
      const state = reachSignedOut(prev.state)
      // The notice shows only when a live session was ended by the app; a second SIGNED_OUT event
      // after that keeps it, and a stale flag with no session behind it sets nothing.
      const expired = prev.state === 'SIGNED_OUT' ? prev.expired : expiring
      return { ready: true, state, session: null, expired }
    }

    default:
      return { ...prev, ready: true }
  }
}
