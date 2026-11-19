// Account actions (SPEC-AU-001), ported from OLD supabase-auth.service.ts. Plain async functions, so
// both the React provider (auth.tsx) and the API client (4.2) can use them. None of them throws: a
// failure of any kind comes back as a result, so a caller is never left half-way through a state change.
import { isAuthRetryableFetchError } from '@supabase/auth-js'
import { MAX_USERNAME_LENGTH, MIN_PASSWORD_LENGTH, normaliseUsername } from './auth-rules'
import { getAuthClient } from './supabase.client'

export { MAX_USERNAME_LENGTH, MIN_PASSWORD_LENGTH }

const HTTP_TOO_MANY_REQUESTS = 429
const HTTP_SERVER_ERROR = 500
/** GoTrue answers this only for an address that has an account, so it must not be shown (NC-AU-NO-ENUMERATION). */
const EMAIL_SEND_LIMIT_CODE = 'over_email_send_rate_limit'

const OFFLINE_MESSAGE = "Can't connect right now. Check your internet connection and try again."
const UNAVAILABLE_MESSAGE = 'The service is unavailable right now. Try again in a moment.'
const RATE_LIMIT_MESSAGE = 'Too many attempts. Wait a minute and try again.'
const GENERIC_MESSAGE = 'Something went wrong. Try again.'
const TIMEOUT_MESSAGE = 'This is taking too long. Check your connection and try again.'
/** An auth call that has not answered by now is reported as a failure, so a form is never stuck. */
export const REQUEST_TIMEOUT_MS = 20_000
const WEAK_PASSWORD_MESSAGE = `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`
const USERNAME_MESSAGE = `Choose a username of up to ${MAX_USERNAME_LENGTH} characters.`

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
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<AuthResult>((resolve) => {
    timer = setTimeout(
      () => resolve({ success: false, message: TIMEOUT_MESSAGE }),
      REQUEST_TIMEOUT_MS,
    )
  })
  const attempt = run().catch((error: unknown): AuthResult => ({
    success: false,
    // fetch reports "no connection" as a TypeError.
    message: error instanceof TypeError ? OFFLINE_MESSAGE : GENERIC_MESSAGE,
  }))
  try {
    return await Promise.race([attempt, timeout])
  } finally {
    clearTimeout(timer)
  }
}

export function signIn(email: string, password: string): Promise<AuthResult> {
  return guarded(async () => {
    const { error } = await getAuthClient().signInWithPassword({ email, password })
    return error ? failure(error) : { success: true }
  })
}

/** Supabase Auth has no username field, so it travels as user metadata (F-AU-02). */
export function signUp(email: string, password: string, username: string): Promise<AuthResult> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return Promise.resolve({ success: false, message: WEAK_PASSWORD_MESSAGE })
  }
  const name = normaliseUsername(username)
  if (name === null) return Promise.resolve({ success: false, message: USERNAME_MESSAGE })
  return guarded(async () => {
    const { data, error } = await getAuthClient().signUp({
      email,
      password,
      options: { data: { username: name } },
    })
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
 * 'global', which would sign out every device on the shared login (D11). A failure is reported, not
 * hidden: auth-js can return an error before it has cleared the stored session, so callers that need
 * the session gone (Cancel on the reset page) must check the result.
 */
export function signOut(): Promise<AuthResult> {
  return guarded(async () => {
    const { error } = await getAuthClient().signOut({ scope: 'local' })
    return error ? failure(error) : { success: true }
  })
}

let recoveryActive = false

/** Tells the token source that a password-recovery session is (or is no longer) active. */
export function setRecoveryActive(active: boolean): void {
  recoveryActive = active
}

/**
 * The current access token for API calls, or null when signed out. The client refreshes it when due.
 * Throws when the session cannot be read (storage or refresh trouble), which is not the same as
 * signed out: the API client must not treat it as a 401.
 */
export async function getAccessToken(): Promise<string | null> {
  // A recovery link's session proves only that she held the link (a crafted link fragment can carry someone
  // else's): it must not be used for API calls until she has set a password (7.0.41d).
  if (recoveryActive) return null
  const { data, error } = await getAuthClient().getSession()
  if (error) throw error
  return data.session?.access_token ?? null
}

// F-AU-09: the next SIGNED_OUT event is her own sign-out, so the login page forgets the page she left.
let signingOutOnPurpose = false

/** Marks that the next SIGNED_OUT event is her own choice (read by the provider). */
export function markUserSignOut(): void {
  signingOutOnPurpose = true
}

/** Reads and clears the user-sign-out flag. */
export function consumeUserSignOut(): boolean {
  const was = signingOutOnPurpose
  signingOutOnPurpose = false
  return was
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
