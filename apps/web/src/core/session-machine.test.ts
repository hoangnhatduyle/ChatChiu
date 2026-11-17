// SPEC-AU-001 session state machine: allowed transitions, the two forbidden ones, and how
// Supabase auth events map onto the machine.
import type { Session } from '@supabase/auth-js'
import {
  applyAuthEvent,
  cancelRecovery,
  INITIAL_SNAPSHOT,
  sameSnapshot,
  SESSION_EVENTS,
  SESSION_STATES,
  transition,
  type SessionEvent,
  type SessionSnapshot,
  type SessionState,
} from './session-machine'

const session = { access_token: 'a', refresh_token: 'r', user: { id: 'u1' } } as unknown as Session
const readySignedOut: SessionSnapshot = { ...INITIAL_SNAPSHOT, ready: true }
const signedIn: SessionSnapshot = { ready: true, state: 'SIGNED_IN', session, expired: false }

describe('SPEC-AU-001 session machine', () => {
  const allowed: ReadonlyArray<[SessionState, SessionEvent, SessionState]> = [
    ['SIGNED_OUT', 'submit_credentials', 'SIGNING_IN'],
    ['SIGNING_IN', 'auth_ok', 'SIGNED_IN'],
    ['SIGNING_IN', 'auth_error', 'SIGNED_OUT'],
    ['SIGNED_IN', 'token_refreshed', 'SIGNED_IN'],
    ['SIGNED_IN', 'api_401_after_refresh', 'EXPIRED'],
    ['EXPIRED', 'show_session_expired', 'SIGNED_OUT'],
    ['SIGNED_IN', 'sign_out', 'SIGNED_OUT'],
    ['SIGNED_OUT', 'open_recovery_link', 'PASSWORD_RECOVERY'],
    ['PASSWORD_RECOVERY', 'new_password_saved', 'SIGNED_IN'],
    ['PASSWORD_RECOVERY', 'cancel_recovery', 'SIGNED_OUT'],
  ]

  it.each(allowed)('F-AU-01: %s --%s--> %s', (from, event, to) => {
    expect(transition(from, event)).toBe(to)
  })

  it('FORBID session SIGNED_OUT->SIGNED_IN: no single event leads there (T-SPEC-AU-001-FORBID-session_SIGNED_OUT_SIGNED_IN)', () => {
    for (const event of SESSION_EVENTS) {
      expect(transition('SIGNED_OUT', event)).not.toBe('SIGNED_IN')
    }
  })

  it('NC-AU-RECOVERY-NO-SILENT-EXIT: only saving the password or the explicit Cancel leaves recovery (T-SPEC-AU-001-NC-NC_AU_RECOVERY_NO_SILENT_EXIT)', () => {
    const leaving = SESSION_EVENTS.filter(
      (event) => transition('PASSWORD_RECOVERY', event) !== 'PASSWORD_RECOVERY',
    )
    expect(leaving.sort()).toEqual(['cancel_recovery', 'new_password_saved'])
  })

  it('an event that is not allowed from a state leaves the state unchanged', () => {
    for (const state of SESSION_STATES) {
      expect(transition(state, 'show_session_expired')).toBe(
        state === 'EXPIRED' ? 'SIGNED_OUT' : state,
      )
    }
  })
})

describe('SPEC-AU-001 Supabase events drive the machine', () => {
  it('F-AU-01: a persisted session found at start restores as SIGNED_IN', () => {
    const next = applyAuthEvent(INITIAL_SNAPSHOT, 'INITIAL_SESSION', session, false)
    expect(next).toMatchObject({ ready: true, state: 'SIGNED_IN', session })
  })

  it('F-AU-05: no session at start is SIGNED_OUT and ready', () => {
    const next = applyAuthEvent(INITIAL_SNAPSHOT, 'INITIAL_SESSION', null, false)
    expect(next).toMatchObject({ ready: true, state: 'SIGNED_OUT', session: null })
  })

  it('F-AU-01: SIGNED_IN from another tab goes through SIGNING_IN, never straight from SIGNED_OUT', () => {
    const next = applyAuthEvent(readySignedOut, 'SIGNED_IN', session, false)
    expect(next).toMatchObject({ state: 'SIGNED_IN', session })
  })

  it('F-AU-01: TOKEN_REFRESHED keeps SIGNED_IN and swaps in the new session', () => {
    const fresh = { ...session, access_token: 'b' } as Session
    const next = applyAuthEvent(signedIn, 'TOKEN_REFRESHED', fresh, false)
    expect(next).toMatchObject({ state: 'SIGNED_IN', session: fresh })
  })

  it('F-AU-03: PASSWORD_RECOVERY opens the recovery state with its session', () => {
    const next = applyAuthEvent(readySignedOut, 'PASSWORD_RECOVERY', session, false)
    expect(next).toMatchObject({ state: 'PASSWORD_RECOVERY', session })
  })

  it('F-AU-03: a recovery link on a cold start (not ready yet) still lands in PASSWORD_RECOVERY', () => {
    const next = applyAuthEvent(INITIAL_SNAPSHOT, 'PASSWORD_RECOVERY', session, false)
    expect(next).toMatchObject({ ready: true, state: 'PASSWORD_RECOVERY' })
  })

  it('F-AU-03: a SIGNED_OUT or INITIAL_SESSION event during recovery does not drop back to sign-in', () => {
    const recovering = applyAuthEvent(readySignedOut, 'PASSWORD_RECOVERY', session, false)
    expect(applyAuthEvent(recovering, 'SIGNED_OUT', null, false).state).toBe('PASSWORD_RECOVERY')
    expect(applyAuthEvent(recovering, 'INITIAL_SESSION', session, false).state).toBe(
      'PASSWORD_RECOVERY',
    )
    expect(applyAuthEvent(recovering, 'SIGNED_IN', session, false).state).toBe('PASSWORD_RECOVERY')
  })

  it('F-AU-03: USER_UPDATED during recovery (password saved) signs her in', () => {
    const recovering = applyAuthEvent(readySignedOut, 'PASSWORD_RECOVERY', session, false)
    const next = applyAuthEvent(recovering, 'USER_UPDATED', session, false)
    expect(next).toMatchObject({ state: 'SIGNED_IN', session })
  })

  it('F-AU-04: SIGNED_OUT while the app is expiring the session ends SIGNED_OUT with the expired notice', () => {
    const next = applyAuthEvent(signedIn, 'SIGNED_OUT', null, true)
    expect(next).toMatchObject({ state: 'SIGNED_OUT', session: null, expired: true })
  })

  it('F-AU-04: expiring while a sign-in is in flight still ends SIGNED_OUT, never stuck in SIGNING_IN', () => {
    const signingIn: SessionSnapshot = { ...readySignedOut, state: 'SIGNING_IN' }
    const next = applyAuthEvent(signingIn, 'SIGNED_OUT', null, true)
    expect(next).toMatchObject({ state: 'SIGNED_OUT', expired: true })
  })

  it('F-AU-06: an ordinary sign-out is SIGNED_OUT without the expired notice', () => {
    const next = applyAuthEvent(signedIn, 'SIGNED_OUT', null, false)
    expect(next).toMatchObject({ state: 'SIGNED_OUT', expired: false })
  })

  it('F-AU-01: signing in again clears the expired notice', () => {
    const expired: SessionSnapshot = { ...readySignedOut, expired: true }
    const next = applyAuthEvent(expired, 'SIGNED_IN', session, false)
    expect(next).toMatchObject({ state: 'SIGNED_IN', expired: false })
  })
})

describe('F-AU-03 recovery bootstrap keeps its session', () => {
  it('F-AU-03: the session found at start is stored, so saving the password can sign her in', () => {
    const starting: SessionSnapshot = { ...INITIAL_SNAPSHOT, state: 'PASSWORD_RECOVERY' }
    const found = applyAuthEvent(starting, 'INITIAL_SESSION', session, false)
    expect(found.session).toBe(session)
    const saved = applyAuthEvent(found, 'USER_UPDATED', null, false)
    expect(saved.state).toBe('SIGNED_IN')
  })
})

describe('F-AU-08 cancelRecovery', () => {
  const recovering: SessionSnapshot = {
    ready: true,
    state: 'PASSWORD_RECOVERY',
    session,
    expired: false,
  }

  it('F-AU-08: Cancel ends the recovery session: SIGNED_OUT, no session, no expired notice', () => {
    expect(cancelRecovery(recovering)).toEqual({
      ready: true,
      state: 'SIGNED_OUT',
      session: null,
      expired: false,
    })
  })

  it('F-AU-08: Cancel does nothing outside a recovery session', () => {
    expect(cancelRecovery(signedIn)).toBe(signedIn)
    expect(cancelRecovery(readySignedOut)).toBe(readySignedOut)
  })
})

describe('sameSnapshot', () => {
  it('F-AU-01: a repeated SIGNED_IN with the same token is the same snapshot (no re-render)', () => {
    const again = applyAuthEvent(signedIn, 'SIGNED_IN', { ...session } as Session, false)
    expect(sameSnapshot(signedIn, again)).toBe(true)
  })

  it('F-AU-01: a refreshed token, a new state or the expired flag make a different snapshot', () => {
    const fresh = applyAuthEvent(
      signedIn,
      'TOKEN_REFRESHED',
      { ...session, access_token: 'b' } as Session,
      false,
    )
    expect(sameSnapshot(signedIn, fresh)).toBe(false)
    expect(sameSnapshot(signedIn, { ...signedIn, state: 'SIGNED_OUT', session: null })).toBe(false)
    expect(sameSnapshot(signedIn, { ...signedIn, expired: true })).toBe(false)
  })
})

describe('applyAuthEvent invariants', () => {
  const EVENTS = [
    'INITIAL_SESSION',
    'SIGNED_IN',
    'SIGNED_OUT',
    'TOKEN_REFRESHED',
    'USER_UPDATED',
    'PASSWORD_RECOVERY',
  ] as const
  // Only snapshots the machine itself can produce: SIGNED_IN has a session, SIGNED_OUT has none.
  const coherent = (s: SessionSnapshot) =>
    s.state === 'SIGNED_IN' ? s.session !== null : s.state !== 'SIGNED_OUT' || s.session === null
  const allStarts: SessionSnapshot[] = [
    INITIAL_SNAPSHOT,
    ...SESSION_STATES.map((state): SessionSnapshot => ({
      ready: true,
      state,
      session: null,
      expired: false,
    })),
    ...SESSION_STATES.map((state): SessionSnapshot => ({
      ready: true,
      state,
      session,
      expired: false,
    })),
  ]

  const starts = allStarts.filter(coherent)

  it('FORBID session: from a ready SIGNED_OUT snapshot no event reaches SIGNED_IN except through a real sign-in event', () => {
    const out = starts.filter((s) => s.ready && s.state === 'SIGNED_OUT')
    for (const start of out) {
      for (const event of [
        'SIGNED_OUT',
        'TOKEN_REFRESHED',
        'USER_UPDATED',
        'PASSWORD_RECOVERY',
      ] as const) {
        expect(applyAuthEvent(start, event, session, false).state).not.toBe('SIGNED_IN')
      }
    }
  })

  it('NC-AU-RECOVERY-NO-SILENT-EXIT: once ready, no auth event leaves recovery except saving the password', () => {
    const recovering = starts.filter((s) => s.ready && s.state === 'PASSWORD_RECOVERY')
    for (const start of recovering) {
      for (const event of EVENTS) {
        for (const expiring of [false, true]) {
          const next = applyAuthEvent(
            start,
            event,
            event === 'SIGNED_OUT' ? null : session,
            expiring,
          )
          expect(next.state).not.toBe('SIGNED_OUT')
          if (next.state !== 'PASSWORD_RECOVERY') expect(event).toBe('USER_UPDATED')
        }
      }
    }
  })

  it('F-AU-01: every result is coherent: SIGNED_IN has a session and SIGNED_OUT has none', () => {
    for (const start of starts) {
      for (const event of EVENTS) {
        for (const s of [session, null]) {
          const next = applyAuthEvent(start, event, s, false)
          if (next.state === 'SIGNED_OUT') expect(next.session).toBeNull()
          if (next.state === 'SIGNED_IN') expect(next.session).not.toBeNull()
        }
      }
    }
  })

  it('F-AU-03: a recovery link opens PASSWORD_RECOVERY from every starting state', () => {
    for (const start of starts.filter((s) => s.state !== 'PASSWORD_RECOVERY')) {
      expect(applyAuthEvent(start, 'PASSWORD_RECOVERY', session, false)).toMatchObject({
        state: 'PASSWORD_RECOVERY',
        session,
        expired: false,
      })
    }
  })

  it('F-AU-01: TOKEN_REFRESHED with nobody signed in changes nothing', () => {
    const next = applyAuthEvent(readySignedOut, 'TOKEN_REFRESHED', session, false)
    expect(next).toMatchObject({ state: 'SIGNED_OUT', session: null })
  })

  it('F-AU-03: a recovery link that Supabase finds no session for (used or expired) starts signed out', () => {
    const booting: SessionSnapshot = { ...INITIAL_SNAPSHOT, state: 'PASSWORD_RECOVERY' }
    expect(applyAuthEvent(booting, 'INITIAL_SESSION', null, false)).toMatchObject({
      ready: true,
      state: 'SIGNED_OUT',
    })
    expect(applyAuthEvent(booting, 'INITIAL_SESSION', session, false).state).toBe(
      'PASSWORD_RECOVERY',
    )
  })

  it('F-AU-04: a stale expiring flag with nobody signed in sets no notice', () => {
    expect(applyAuthEvent(readySignedOut, 'SIGNED_OUT', null, true).expired).toBe(false)
  })
})
