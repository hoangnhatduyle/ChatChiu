// The session context and the useSession() hook, apart from the provider (auth.tsx) so that file
// exports only a component (fast refresh).
import { createContext, useContext } from 'react'
import type { AuthResult } from './auth-actions'
import type { SessionState } from './session-machine'
import type { Session, User } from './supabase.client'

export type SessionValue = {
  /** False until the stored session has been read (the guard shows nothing until then). */
  ready: boolean
  status: SessionState
  session: Session | null
  user: User | null
  /** True when the last session ended on a 401: the login page says "Your session expired". */
  expired: boolean
  /** True when she signed out herself (not an expiry): the guard remembers no page to return to. */
  signedOutOnPurpose: boolean
  /** Set when the build has no Supabase settings; nothing can sign in. */
  configError: string | null
  signIn: (email: string, password: string) => Promise<AuthResult>
  signUp: (email: string, password: string, username: string) => Promise<AuthResult>
  signOut: () => Promise<AuthResult>
  requestPasswordReset: (email: string) => Promise<AuthResult>
  updatePassword: (password: string) => Promise<AuthResult>
  /** F-AU-08: ends this device's recovery session; a failure leaves her in recovery. */
  cancelRecovery: () => Promise<AuthResult>
}

export const SessionContext = createContext<SessionValue | null>(null)

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside <AuthProvider>.')
  return value
}
