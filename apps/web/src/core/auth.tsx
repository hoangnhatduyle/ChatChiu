// AuthProvider + useSession (SPEC-AU-001): one subscription to Supabase auth events, folded into the
// session state machine (session-machine.ts). Ported from OLD supabase-auth.service.ts.
import { useEffect, useState, type ReactNode } from 'react'
import {
  consumeSessionExpiring,
  consumeUserSignOut,
  markUserSignOut,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
  updatePassword,
  type AuthResult,
} from './auth-actions'
import { recoveryInUrl } from './auth-paths'
import {
  applyAuthEvent,
  cancelRecovery,
  INITIAL_SNAPSHOT,
  sameSnapshot,
  transition,
  type SessionSnapshot,
} from './session-machine'
import { SessionContext, type SessionValue } from './session-context'
import { getAuthClient, getConfigError } from './supabase.client'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [configError] = useState(() => getConfigError())
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() => {
    if (configError) return { ...INITIAL_SNAPSHOT, ready: true }
    // auth-js reports a recovery link's session (INITIAL_SESSION) a tick before PASSWORD_RECOVERY. Start
    // in recovery when the address bar says so, so no protected page renders in between.
    if (recoveryInUrl(window.location.hash))
      return { ...INITIAL_SNAPSHOT, state: 'PASSWORD_RECOVERY' }
    return INITIAL_SNAPSHOT
  })

  // Subscribing to an external system (Supabase auth events) is what an effect is for.
  useEffect(() => {
    if (configError) return
    const { data } = getAuthClient().onAuthStateChange((event, session) => {
      // Read the flag here, not inside the updater: StrictMode runs updaters twice.
      const expiring = event === 'SIGNED_OUT' && consumeSessionExpiring()
      const byUser = event === 'SIGNED_OUT' && consumeUserSignOut()
      // Same state and token (a tab refocus re-sends SIGNED_IN): keep the old object, no re-render.
      setSnapshot((prev) => {
        const applied = applyAuthEvent(prev, event, session, expiring)
        const next =
          byUser && applied.state === 'SIGNED_OUT' ? { ...applied, userSignedOut: true } : applied
        return sameSnapshot(prev, next) ? prev : next
      })
    })
    return () => data.subscription.unsubscribe()
  }, [configError])

  async function signInAndTrack(email: string, password: string): Promise<AuthResult> {
    setSnapshot((prev) => ({ ...prev, state: transition(prev.state, 'submit_credentials') }))
    const result = await signIn(email, password)
    // Success arrives as a SIGNED_IN event (SIGNING_IN -> SIGNED_IN); only a failure is handled here.
    if (!result.success) {
      setSnapshot((prev) => ({ ...prev, state: transition(prev.state, 'auth_error') }))
    }
    return result
  }

  async function signOutOnPurpose(): Promise<AuthResult> {
    // The flag has to be on before the call: auth-js emits SIGNED_OUT from inside signOut(), and the
    // guard redirects on that event. The finally clears it whatever happens.
    markUserSignOut()
    try {
      return await signOut()
    } finally {
      consumeUserSignOut()
    }
  }

  async function cancelRecoverySession(): Promise<AuthResult> {
    // NC-AU-RECOVERY-NO-SILENT-EXIT: she leaves recovery only once the client has really dropped the
    // session. If the sign-out failed the session may still be stored (and a reload would sign her
    // in without a new password), so the caller shows the reason and she stays in recovery.
    const result = await signOut()
    if (result.success) setSnapshot((prev) => cancelRecovery(prev))
    return result
  }

  const value: SessionValue = {
    ready: snapshot.ready,
    status: snapshot.state,
    session: snapshot.session,
    user: snapshot.session?.user ?? null,
    expired: snapshot.expired,
    signedOutOnPurpose: snapshot.userSignedOut ?? false,
    configError,
    signIn: signInAndTrack,
    signUp,
    signOut: signOutOnPurpose,
    requestPasswordReset,
    updatePassword,
    cancelRecovery: cancelRecoverySession,
  }
  return <SessionContext value={value}>{children}</SessionContext>
}
