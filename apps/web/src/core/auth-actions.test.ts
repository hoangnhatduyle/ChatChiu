// SPEC-AU-001 account actions against a fake Supabase auth client (no network).
import { AuthRetryableFetchError } from '@supabase/auth-js'
import { beforeEach, vi } from 'vitest'

const auth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  refreshSession: vi.fn(),
  getSession: vi.fn(),
}
vi.mock('./supabase.client', () => ({ getAuthClient: () => auth }))

import {
  consumeSessionExpiring,
  getAccessToken,
  setRecoveryActive,
  handleUnauthorized,
  markSessionExpiring,
  MAX_USERNAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  REQUEST_TIMEOUT_MS,
  markUserSignOut,
  consumeUserSignOut,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from './auth-actions'

const LONG_PASSWORD = 'correct-horse-battery'

beforeEach(() => {
  vi.resetAllMocks()
  consumeSessionExpiring()
})

describe('F-AU-01 signIn', () => {
  it('F-AU-01: returns success for valid credentials', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null })
    await expect(signIn('a@b.co', LONG_PASSWORD)).resolves.toEqual({ success: true })
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.co',
      password: LONG_PASSWORD,
    })
  })

  it('F-AU-01: returns the server message for wrong credentials', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials', status: 400 },
    })
    await expect(signIn('a@b.co', 'nope')).resolves.toEqual({
      success: false,
      message: 'Invalid login credentials',
    })
  })

  it('F-AU-01: a network failure says so instead of leaking the raw error', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    })
    const result = await signIn('a@b.co', LONG_PASSWORD)
    expect(result).toMatchObject({ success: false })
    expect(result.success === false && result.message).toMatch(/connect|offline/i)
  })
})

describe('F-AU-02 signUp and NC-AU-NO-WEAK-PASSWORD', () => {
  it('NC-AU-NO-WEAK-PASSWORD: signUp rejects a password under 12 characters without calling Supabase (T-SPEC-AU-001-NC-NC_AU_NO_WEAK_PASSWORD)', async () => {
    const result = await signUp('a@b.co', 'x'.repeat(MIN_PASSWORD_LENGTH - 1), 'Chiu')
    expect(result).toMatchObject({ success: false })
    expect(auth.signUp).not.toHaveBeenCalled()
  })

  it('F-AU-02: signUp with 12+ characters reports needsConfirmation when Supabase returns no session', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null })
    await expect(signUp('a@b.co', 'x'.repeat(MIN_PASSWORD_LENGTH), 'Chiu')).resolves.toEqual({
      success: true,
      needsConfirmation: true,
    })
  })

  it('F-AU-02: signUp signs in directly when Supabase returns a session', async () => {
    auth.signUp.mockResolvedValue({ data: { session: {} }, error: null })
    await expect(signUp('a@b.co', LONG_PASSWORD, 'Chiu')).resolves.toEqual({ success: true })
  })

  it('F-AU-02: signUp stores the trimmed username as user_metadata.username', async () => {
    auth.signUp.mockResolvedValue({ data: { session: {} }, error: null })
    await signUp('a@b.co', LONG_PASSWORD, '  Chiu  ')
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'a@b.co',
      password: LONG_PASSWORD,
      options: { data: { username: 'Chiu' } },
    })
  })

  it.each(['', '   ', 'x'.repeat(MAX_USERNAME_LENGTH + 1)])(
    'F-AU-02: signUp rejects the username %j without calling Supabase',
    async (username) => {
      const result = await signUp('a@b.co', LONG_PASSWORD, username)
      expect(result).toMatchObject({ success: false })
      expect(auth.signUp).not.toHaveBeenCalled()
    },
  )
})

describe('auth calls cannot hang forever', () => {
  afterEach(() => vi.useRealTimers())

  it('F-AU-01: a sign-in that never answers ends in a failure after the time limit', async () => {
    vi.useFakeTimers()
    auth.signInWithPassword.mockReturnValue(new Promise(() => {}))
    const pending = signIn('a@b.co', LONG_PASSWORD)
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    await expect(pending).resolves.toEqual({
      success: false,
      message: expect.stringMatching(/taking too long/i),
    })
  })
})

describe('F-AU-09 signing out on purpose', () => {
  it('F-AU-09: the user-sign-out flag is set by markUserSignOut and read once', () => {
    expect(consumeUserSignOut()).toBe(false)
    markUserSignOut()
    expect(consumeUserSignOut()).toBe(true)
    expect(consumeUserSignOut()).toBe(false)
  })
})

describe('F-AU-03 recovery and NC-AU-NO-ENUMERATION', () => {
  it('NC-AU-NO-WEAK-PASSWORD: updatePassword rejects under 12 characters without calling updateUser', async () => {
    const result = await updatePassword('short')
    expect(result).toMatchObject({ success: false })
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('F-AU-03: updatePassword calls updateUser with the new password', async () => {
    auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null })
    await expect(updatePassword(LONG_PASSWORD)).resolves.toEqual({ success: true })
    expect(auth.updateUser).toHaveBeenCalledWith({ password: LONG_PASSWORD })
  })

  it('F-AU-03: the reset email links back to /reset-password on this origin', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    await requestPasswordReset('a@b.co')
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.co', {
      redirectTo: `${window.location.origin}/reset-password`,
    })
  })

  it('NC-AU-NO-ENUMERATION: an "unknown user" style error looks the same as success', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { message: 'User not found', status: 400 },
    })
    await expect(requestPasswordReset('nobody@b.co')).resolves.toEqual({ success: true })
  })

  it('NC-AU-NO-ENUMERATION: the per-email send limit (only hit by real accounts) looks like success', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: {
        message: 'email rate limit exceeded',
        status: 429,
        code: 'over_email_send_rate_limit',
      },
    })
    await expect(requestPasswordReset('a@b.co')).resolves.toEqual({ success: true })
  })

  it('NC-AU-NO-ENUMERATION: rate limiting and network errors are still reported', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { message: 'rate limit', status: 429 },
    })
    await expect(requestPasswordReset('a@b.co')).resolves.toMatchObject({ success: false })
  })
})

describe('F-AU-06 sign out scope', () => {
  it("F-AU-06: signOut uses scope 'local' so other devices stay signed in (T-SPEC-AU-001-NC-NC_AU_SIGNOUT_SCOPE)", async () => {
    auth.signOut.mockResolvedValue({ error: null })
    await signOut()
    expect(auth.signOut).toHaveBeenCalledTimes(1)
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})

describe('F-AU-04 session expiry', () => {
  it('F-AU-04: a 401 first tries a silent refresh and keeps the session when it works', async () => {
    auth.refreshSession.mockResolvedValue({
      data: { session: { access_token: 'new' } },
      error: null,
    })
    await expect(handleUnauthorized()).resolves.toBe('refreshed')
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('F-AU-04: when the refresh is refused she is signed out locally once, and the expiring flag is on only while signing out', async () => {
    auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'bad', status: 400 },
    })
    // auth-js emits SIGNED_OUT inside refreshSession(), so the flag must already be on then.
    let flagDuringRefresh: boolean | undefined
    auth.refreshSession.mockImplementation(async () => {
      flagDuringRefresh = consumeSessionExpiring()
      markSessionExpiring()
      return { data: { session: null }, error: { message: 'bad', status: 400 } }
    })
    let flagDuringSignOut: boolean | undefined
    auth.signOut.mockImplementation(async () => {
      flagDuringSignOut = consumeSessionExpiring()
      markSessionExpiring() // the provider reads it on the SIGNED_OUT event; put it back to check cleanup
      return { error: null }
    })
    const results = await Promise.all([
      handleUnauthorized(),
      handleUnauthorized(),
      handleUnauthorized(),
    ])
    expect(results).toEqual(['expired', 'expired', 'expired'])
    expect(auth.refreshSession).toHaveBeenCalledTimes(1)
    expect(auth.signOut).toHaveBeenCalledTimes(1)
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(flagDuringRefresh).toBe(true)
    expect(flagDuringSignOut).toBe(true)
    // Once signOut has finished (its SIGNED_OUT event is delivered by then) the flag never lingers.
    expect(consumeSessionExpiring()).toBe(false)
  })

  it('F-AU-04: a late 401 for a token that has since been replaced is not an expiry', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'newer' } }, error: null })
    await expect(handleUnauthorized('older')).resolves.toBe('refreshed')
    expect(auth.refreshSession).not.toHaveBeenCalled()
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('F-AU-04: a refresh that succeeds clears the expiring flag it set up front', async () => {
    auth.refreshSession.mockResolvedValue({
      data: { session: { access_token: 'new' } },
      error: null,
    })
    await handleUnauthorized()
    expect(consumeSessionExpiring()).toBe(false)
  })

  it('F-AU-04: a refresh that fails because she is offline does NOT end the session', async () => {
    auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    })
    await expect(handleUnauthorized()).resolves.toBe('unreachable')
    expect(auth.signOut).not.toHaveBeenCalled()
    expect(consumeSessionExpiring()).toBe(false)
  })

  it('F-AU-04: a refresh that throws keeps the session (we do not know it is invalid) and clears the flag', async () => {
    auth.refreshSession.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(handleUnauthorized()).resolves.toBe('unreachable')
    expect(auth.signOut).not.toHaveBeenCalled()
    expect(consumeSessionExpiring()).toBe(false)
  })

  it('F-AU-04: a new 401 after the first attempt finished starts a fresh attempt', async () => {
    auth.refreshSession.mockResolvedValue({ data: { session: { access_token: 'n' } }, error: null })
    await handleUnauthorized()
    await handleUnauthorized()
    expect(auth.refreshSession).toHaveBeenCalledTimes(2)
  })

  it('F-AU-04: if signOut itself throws, the expiring flag is cleared and the session still counts as expired', async () => {
    auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'bad', status: 400 },
    })
    auth.signOut.mockRejectedValue(new Error('subscriber failed'))
    await expect(handleUnauthorized()).resolves.toBe('expired')
    expect(consumeSessionExpiring()).toBe(false)
  })
})

describe('actions never throw (a throw would leave the UI mid-sign-in)', () => {
  it('F-AU-01: signIn turns an unexpected throw into a failure result', async () => {
    auth.signInWithPassword.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(signIn('a@b.co', LONG_PASSWORD)).resolves.toMatchObject({ success: false })
  })

  it('F-AU-02: signUp, updatePassword and requestPasswordReset do the same', async () => {
    auth.signUp.mockRejectedValue(new Error('boom'))
    auth.updateUser.mockRejectedValue(new Error('boom'))
    auth.resetPasswordForEmail.mockRejectedValue(new Error('boom'))
    await expect(signUp('a@b.co', LONG_PASSWORD, 'Chiu')).resolves.toMatchObject({ success: false })
    await expect(updatePassword(LONG_PASSWORD)).resolves.toMatchObject({ success: false })
    await expect(requestPasswordReset('a@b.co')).resolves.toMatchObject({ success: false })
  })

  it('F-AU-06: signOut reports a server-side failure (this device is still signed out locally) and never throws', async () => {
    auth.signOut.mockResolvedValueOnce({ error: { message: 'revoke failed', status: 500 } })
    await expect(signOut()).resolves.toMatchObject({ success: false })
    auth.signOut.mockRejectedValueOnce(new Error('boom'))
    await expect(signOut()).resolves.toMatchObject({ success: false })
    auth.signOut.mockResolvedValueOnce({ error: null })
    await expect(signOut()).resolves.toEqual({ success: true })
  })

  it('NC-AU-NO-ENUMERATION: a server fault (500) is reported, not shown as "check your email"', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { message: 'smtp down', status: 500 },
    })
    await expect(requestPasswordReset('a@b.co')).resolves.toMatchObject({ success: false })
  })
})

describe('getAccessToken', () => {
  it('F-AU-01: returns the current access token, or null without a session', async () => {
    auth.getSession.mockResolvedValueOnce({
      data: { session: { access_token: 'tok' } },
      error: null,
    })
    await expect(getAccessToken()).resolves.toBe('tok')
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null })
    await expect(getAccessToken()).resolves.toBeNull()
  })

  it('7.0.41d: no token is handed out while a password-recovery session is active, and again after', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'recovery-tok' } },
      error: null,
    })
    setRecoveryActive(true)
    await expect(getAccessToken()).resolves.toBeNull()
    setRecoveryActive(false)
    await expect(getAccessToken()).resolves.toBe('recovery-tok')
  })

  it('F-AU-04: a storage or refresh error is thrown, not mistaken for "signed out"', async () => {
    auth.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'lock timeout' },
    })
    await expect(getAccessToken()).rejects.toBeDefined()
  })
})
