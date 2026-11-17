// Account actions (SPEC-AU-001), ported from OLD supabase-auth.service.ts. Plain async functions, so
// both the React provider (auth.tsx) and the API client (4.2) can use them. None of them throws: a
// failure of any kind comes back as a result, so a caller is never left half-way through a state change.
import { isAuthRetryableFetchError } from '@supabase/auth-js'
import { getAuthClient } from './supabase.client'

/** NC-AU-NO-WEAK-PASSWORD, and the same minimum the Supabase project enforces. */
export const MIN_PASSWORD_LENGTH = 12

const HTTP_TOO_MANY_REQUESTS = 429
const HTTP_SERVER_ERROR = 500
/** GoTrue answers this only for an address that has an account, so it must not be shown (NC-AU-NO-ENUMERATION). */
const EMAIL_SEND_LIMIT_CODE = 'over_email_send_rate_limit'

const OFFLINE_MESSAGE = "Can't connect right now. Check your internet connection and try again."
const UNAVAILABLE_MESSAGE = 'The service is unavailable right now. Try again in a moment.'
const RATE_LIMIT_MESSAGE = 'Too many attempts. Wait a minute and try again.'
const GENERIC_MESSAGE = 'Something went wrong. Try again.'
const WEAK_PASSWORD_MESSAGE = `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`

export type AuthResult =
  { success: true; needsConfirmation?: boolean } | { success: false; message: string }

type AuthFailure = { message: string; status?: number; code?: string }

function failure(error: AuthFailure): AuthResult {
  if (isAuthRetryableFetchError(error)) {
    return { success: false, message: error.status === 0 ? OFFLINE_MESSAGE : UNAVAILABLE_MESSAGE }
  }
  if (error.status === HTTP_TOO_MANY_REQUESTS)
    return { success: false, message: RATE_LIMIT_MESSAGE }
  return { success: false, message: error.message }
}

/** Runs an action and turns anything it throws (a failed fetch, a bad response, no config) into a failure. */
async function guarded(run: () => Promise<AuthResult>): Promise<AuthResult> {
  try {
    return await run()
  } catch (error) {
    // fetch reports "no connection" as a TypeError.
    return {
      success: false,
      message: error instanceof TypeError ? OFFLINE_MESSAGE : GENERIC_MESSAGE,
    }
  }
}

export function signIn(email: string, password: string): Promise<AuthResult> {
  return guarded(async () => {
    const { error } = await getAuthClient().signInWithPassword({ email, password })
    return error ? failure(error) : { success: true }
  })
}

export function signUp(email: string, password: string): Promise<AuthResult> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return Promise.resolve({ success: false, message: WEAK_PASSWORD_MESSAGE })
  }
  return guarded(async () => {
    const { data, error } = await getAuthClient().signUp({ email, password })
    if (error) return failure(error)
    // With email confirmation on, Supabase returns no session until the link is opened.
    return data.session ? { success: true } : { success: true, needsConfirmation: true }
  })
}

/**
 * NC-AU-NO-ENUMERATION: only IP-level rate limiting, server faults and connection problems are
 * reported; "unknown user" and the per-email send limit look like success.
 */
export function requestPasswordReset(email: string): Promise<AuthResult> {
  return guarded(async () => {
    const { error } = await getAuthClient().resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (!error || error.code === EMAIL_SEND_LIMIT_CODE) return { success: true }
    const reportable =
      isAuthRetryableFetchError(error) ||
      error.status === HTTP_TOO_MANY_REQUESTS ||
      (error.status !== undefined && error.status >= HTTP_SERVER_ERROR)
    return reportable ? failure(error) : { success: true }
  })
}

/** Sets the new password after a recovery link (F-AU-03). Supabase then signs her in. */
export function updatePassword(password: string): Promise<AuthResult> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return Promise.resolve({ success: false, message: WEAK_PASSWORD_MESSAGE })
  }
  return guarded(async () => {
    const { error } = await getAuthClient().updateUser({ password })
    return error ? failure(error) : { success: true }
  })
}

/**
 * F-AU-06 / NC-AU-SIGNOUT-SCOPE: end only this device's session. supabase-js's default scope is
 * 'global', which would sign out every device on the shared login (D11). This device is signed out
 * locally before any network call, so a failure here only means the server could not revoke the token.
 */
export function signOut(): Promise<AuthResult> {
  return guarded(async () => {
    const { error } = await getAuthClient().signOut({ scope: 'local' })
    return error ? failure(error) : { success: true }
  })
}

/**
 * The current access token for API calls, or null when signed out. The client refreshes it when due.
 * Throws when the session cannot be read (storage or refresh trouble), which is not the same as
 * signed out: the API client must not treat it as a 401.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data, error } = await getAuthClient().getSession()
  if (error) throw error
  return data.session?.access_token ?? null
}

// F-AU-04: a 401 first tries a silent refresh; only a refused refresh signs her out, once.
let expiring = false
let refreshInFlight: Promise<RefreshOutcome> | null = null

/** Marks that the next SIGNED_OUT event is the app ending an expired session (read by the provider). */
export function markSessionExpiring(): void {
  expiring = true
}

/** Reads and clears the expiring flag. */
export function consumeSessionExpiring(): boolean {
  const was = expiring
  expiring = false
  return was
}

/** `refreshed`: retry the request. `expired`: she was signed out. `unreachable`: offline or the server is down, the session is kept. */
export type RefreshOutcome = 'refreshed' | 'expired' | 'unreachable'

async function refreshOrExpire(failedToken: string | undefined): Promise<RefreshOutcome> {
  const auth = getAuthClient()
  if (failedToken) {
    // A late 401 for a token that has since been replaced says nothing about the current session.
    const { data } = await auth.getSession()
    const current = data.session?.access_token
    if (current && current !== failedToken) return 'refreshed'
  }
  // auth-js emits SIGNED_OUT from inside refreshSession() when the refresh token is refused, so the
  // flag has to be on before the call. The finally below clears it whatever happens, so it can never
  // outlive this attempt and mislabel a later, ordinary sign-out.
  markSessionExpiring()
  try {
    const { data, error } = await auth.refreshSession()
    if (!error && data.session) return 'refreshed'
    // Offline or a 5xx: the refresh token is still good, so keep the session.
    if (error && isAuthRetryableFetchError(error)) return 'unreachable'
    await signOut()
    return 'expired'
  } catch {
    return 'unreachable'
  } finally {
    consumeSessionExpiring()
  }
}

/**
 * Called by the API client on a 401, with the token that request used. Concurrent 401s share one
 * attempt, so she is signed out once.
 */
export function handleUnauthorized(failedToken?: string): Promise<RefreshOutcome> {
  refreshInFlight ??= refreshOrExpire(failedToken).finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}
