// SPEC-AU-001 pages (step 5.11): login, register, reset-password and the public-route redirects,
// rendered through the real route table against a fake Supabase auth client.
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

vi.mock('../../core/supabase.client', async () => {
  const { fakeAuthClient } = await import('../../test/fake-auth-client')
  return { getAuthClient: () => fakeAuthClient, getConfigError: () => null }
})

import { AuthProvider } from '../../core/auth'
import { markSessionExpiring } from '../../core/auth-actions'
import { ToastProvider } from '../../core/toast'
import {
  emitAuth,
  emitAuthFromClient,
  fakeAuthClient,
  resetFakeAuth,
} from '../../test/fake-auth-client'
import { testSession } from '../../test/fake-auth'
import { renderRoutesAt } from '../../test/render-routes'

const PASSWORD = 'correct-horse-battery'

beforeEach(() => resetFakeAuth())

async function openAt(path: string, session: typeof testSession | null = null) {
  const view = renderRoutesAt(path, (children) => (
    <AuthProvider>
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  ))
  await emitAuth('INITIAL_SESSION', session)
  return { ...view, user: userEvent.setup() }
}

/** A sign-in that succeeds the way Supabase does: the SIGNED_IN event, then the call returns. */
function signInSucceeds() {
  fakeAuthClient.signInWithPassword.mockImplementation(async () => {
    emitAuthFromClient('SIGNED_IN', testSession)
    return { data: { session: testSession }, error: null }
  })
}

describe('F-AU-01 login page', () => {
  it('F-AU-01: signs in with email and password and lands on the board', async () => {
    signInSucceeds()
    const { user, location } = await openAt('/login')
    await user.type(await screen.findByLabelText(/email/i), 'cook@home.test')
    await user.type(screen.getByLabelText(/^password/i), PASSWORD)
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(location()).toBe('/'))
    expect(fakeAuthClient.signInWithPassword).toHaveBeenCalledWith({
      email: 'cook@home.test',
      password: PASSWORD,
    })
  })

  it('F-AU-05: after signing in she returns to the page she asked for', async () => {
    signInSucceeds()
    const { user, location } = await openAt('/stock?tab=a')
    await waitFor(() => expect(location()).toBe('/login'))
    await user.type(await screen.findByLabelText(/email/i), 'cook@home.test')
    await user.type(screen.getByLabelText(/^password/i), PASSWORD)
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(location()).toBe('/stock?tab=a'))
  })

  it('F-AU-05: opening Forgot password and coming back still returns her to the page she asked for', async () => {
    signInSucceeds()
    const { user, location } = await openAt('/stock')
    await waitFor(() => expect(location()).toBe('/login'))
    await user.click(await screen.findByRole('button', { name: /forgot password/i }))
    await user.click(await screen.findByRole('button', { name: /back to sign in/i }))
    await user.type(await screen.findByLabelText(/email/i), 'cook@home.test')
    await user.type(screen.getByLabelText(/^password/i), PASSWORD)
    await user.click(screen.getByRole('button', { name: /^sign in/i }))
    await waitFor(() => expect(location()).toBe('/stock'))
  })

  it('F-AU-03: the email she typed is still there when she opens Forgot password', async () => {
    const { user } = await openAt('/login')
    await user.type(await screen.findByLabelText(/email/i), 'cook@home.test')
    await user.click(screen.getByRole('button', { name: /forgot password/i }))
    expect(await screen.findByLabelText(/email/i)).toHaveValue('cook@home.test')
  })

  it('F-AU-01: every field is marked required for assistive technology', async () => {
    await openAt('/login')
    expect(await screen.findByLabelText(/email/i)).toBeRequired()
    expect(screen.getByLabelText(/^password/i)).toBeRequired()
  })

  it('F-AU-01: empty fields show inline errors and call nothing', async () => {
    const { user } = await openAt('/login')
    await user.click(await screen.findByRole('button', { name: /sign in/i }))
    expect(await screen.findAllByText(/enter your (email|password)/i)).toHaveLength(2)
    expect(fakeAuthClient.signInWithPassword).not.toHaveBeenCalled()
  })

  it('F-AU-01: wrong credentials show the reason in an alert and keep the form usable', async () => {
    fakeAuthClient.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials', status: 400 },
    })
    const { user, location } = await openAt('/login')
    await user.type(await screen.findByLabelText(/email/i), 'cook@home.test')
    await user.type(screen.getByLabelText(/^password/i), PASSWORD)
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByText('Invalid login credentials')).toHaveAttribute('role', 'alert')
    expect(location()).toBe('/login')
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled()
  })

  it('F-AU-04: after an expired session the login page says so', async () => {
    const { location } = await openAt('/stock', testSession)
    await screen.findByRole('navigation', { name: 'Main' })
    markSessionExpiring()
    await emitAuth('SIGNED_OUT', null)
    await waitFor(() => expect(location()).toBe('/login'))
    expect(await screen.findByText(/your session expired/i)).toHaveAttribute('role', 'status')
  })

  it.each(['/login', '/register', '/reset-password'])(
    'F-AU-09: a signed-in visitor to %s is sent to the board',
    async (path) => {
      const { location } = await openAt(path, testSession)
      await waitFor(() => expect(location()).toBe('/'))
    },
  )
})

describe('F-AU-03 forgot password', () => {
  it('F-AU-03 / NC-AU-NO-ENUMERATION: the request shows the same neutral message and asks Supabase once', async () => {
    fakeAuthClient.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    const { user } = await openAt('/login')
    await user.click(await screen.findByRole('button', { name: /forgot password/i }))
    await user.type(screen.getByLabelText(/email/i), 'nobody@home.test')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    expect(await screen.findByText(/if an account exists/i)).toHaveAttribute('role', 'status')
    expect(fakeAuthClient.resetPasswordForEmail).toHaveBeenCalledTimes(1)
  })

  it('F-AU-03: /login?forgot=1 opens the request form directly (the expired-link page links to it)', async () => {
    await openAt('/login?forgot=1')
    expect(await screen.findByRole('button', { name: /send reset link/i })).toBeInTheDocument()
  })
})

describe('F-AU-02 register page', () => {
  async function fillRegister(
    user: ReturnType<typeof userEvent.setup>,
    values: { username: string; email: string; password: string; confirm: string },
  ) {
    await user.type(await screen.findByLabelText(/username/i), values.username)
    await user.type(screen.getByLabelText(/email/i), values.email)
    await user.type(screen.getByLabelText(/^password/i), values.password)
    await user.type(screen.getByLabelText(/confirm password/i), values.confirm)
    await user.click(screen.getByRole('button', { name: /create account/i }))
  }

  it('F-AU-02 / NC-AU-NO-WEAK-PASSWORD: a short password, a mismatch and a blank username block with inline errors', async () => {
    const { user } = await openAt('/register')
    await fillRegister(user, {
      username: '  ',
      email: 'a@b.co',
      password: 'short',
      confirm: 'other',
    })
    expect(await screen.findByText(/choose a username/i)).toBeInTheDocument()
    expect(screen.getByText(/at least 12 characters/i)).toBeInTheDocument()
    expect(screen.getByText(/do not match/i)).toBeInTheDocument()
    expect(fakeAuthClient.signUp).not.toHaveBeenCalled()
  })

  it('F-AU-02: a valid form creates the account with the username in user metadata and asks her to confirm by email', async () => {
    fakeAuthClient.signUp.mockResolvedValue({ data: { session: null }, error: null })
    const { user } = await openAt('/register')
    await fillRegister(user, {
      username: 'Chiu',
      email: 'a@b.co',
      password: PASSWORD,
      confirm: PASSWORD,
    })
    expect(await screen.findByText(/check your email/i)).toHaveAttribute('role', 'status')
    expect(fakeAuthClient.signUp).toHaveBeenCalledWith({
      email: 'a@b.co',
      password: PASSWORD,
      options: { data: { username: 'Chiu' } },
    })
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
  })

  it('F-AU-02: when Supabase needs no confirmation she lands on the board signed in', async () => {
    fakeAuthClient.signUp.mockImplementation(async () => {
      emitAuthFromClient('SIGNED_IN', testSession)
      return { data: { session: testSession }, error: null }
    })
    const { user, location } = await openAt('/register')
    await fillRegister(user, {
      username: 'Chiu',
      email: 'a@b.co',
      password: PASSWORD,
      confirm: PASSWORD,
    })
    await waitFor(() => expect(location()).toBe('/'))
  })
})

describe('F-AU-03 / F-AU-07 / F-AU-08 reset-password page', () => {
  async function inRecovery(path = '/reset-password') {
    const opened = await openAt(path)
    await emitAuth('PASSWORD_RECOVERY', testSession)
    return opened
  }

  it('F-AU-07: a recovery link that opens on /login goes to /reset-password', async () => {
    const { location } = await inRecovery('/login')
    await waitFor(() => expect(location()).toBe('/reset-password'))
    expect(await screen.findByLabelText(/new password/i)).toBeInTheDocument()
  })

  it('F-AU-07: a recovery link that opens on /register goes to /reset-password', async () => {
    const { location } = await inRecovery('/register')
    await waitFor(() => expect(location()).toBe('/reset-password'))
  })

  it('F-AU-03: a short new password is blocked inline, a valid one calls updateUser and signs her in', async () => {
    fakeAuthClient.updateUser.mockImplementation(async () => {
      emitAuthFromClient('USER_UPDATED', testSession)
      return { data: { user: {} }, error: null }
    })
    const { user, location } = await inRecovery()
    await user.type(await screen.findByLabelText(/new password/i), 'short')
    await user.type(screen.getByLabelText(/confirm/i), 'short')
    await user.click(screen.getByRole('button', { name: /save password/i }))
    expect(await screen.findByText(/at least 12 characters/i)).toBeInTheDocument()
    expect(fakeAuthClient.updateUser).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText(/new password/i))
    await user.clear(screen.getByLabelText(/confirm/i))
    await user.type(screen.getByLabelText(/new password/i), PASSWORD)
    await user.type(screen.getByLabelText(/confirm/i), PASSWORD)
    await user.click(screen.getByRole('button', { name: /save password/i }))
    await waitFor(() => expect(location()).toBe('/'))
    expect(fakeAuthClient.updateUser).toHaveBeenCalledWith({ password: PASSWORD })
  })

  it("F-AU-08: Cancel ends only this device's recovery session and lands on /login", async () => {
    fakeAuthClient.signOut.mockResolvedValue({ error: null })
    const { user, location } = await inRecovery()
    await user.click(await screen.findByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(location()).toBe('/login'))
    expect(fakeAuthClient.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('F-AU-08: a Cancel that fails stays in recovery and says why, so the session is never left behind unseen', async () => {
    fakeAuthClient.signOut.mockResolvedValue({ error: { message: 'boom', status: 500 } })
    const { user, location } = await inRecovery()
    await user.click(await screen.findByRole('button', { name: /cancel/i }))
    expect(await screen.findByText('boom')).toHaveAttribute('role', 'alert')
    expect(location()).toBe('/reset-password')
    expect(screen.getByRole('button', { name: /save password/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeEnabled()
  })

  it('F-AU-03: Save stays available again when the save succeeded but no sign-in event followed', async () => {
    fakeAuthClient.updateUser.mockResolvedValue({ data: { user: {} }, error: null })
    const { user } = await inRecovery()
    await user.type(await screen.findByLabelText(/new password/i), PASSWORD)
    await user.type(screen.getByLabelText(/confirm/i), PASSWORD)
    await user.click(screen.getByRole('button', { name: /save password/i }))
    await waitFor(() => expect(fakeAuthClient.updateUser).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save password/i })).toBeEnabled(),
    )
  })

  it('F-AU-08: Cancel stays pressable while a save is still in flight', async () => {
    fakeAuthClient.updateUser.mockReturnValue(new Promise(() => {}))
    const { user } = await inRecovery()
    await user.type(await screen.findByLabelText(/new password/i), PASSWORD)
    await user.type(screen.getByLabelText(/confirm/i), PASSWORD)
    await user.click(screen.getByRole('button', { name: /save password/i }))
    expect(await screen.findByRole('button', { name: /saving/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('button', { name: /cancel/i })).toBeEnabled()
  })

  it('NC-AU-RECOVERY-NO-SILENT-EXIT: a stray SIGNED_OUT or token event keeps her on the reset page', async () => {
    const { location } = await inRecovery()
    await screen.findByLabelText(/new password/i)
    await emitAuth('SIGNED_OUT', null)
    await emitAuth('TOKEN_REFRESHED', testSession)
    expect(location()).toBe('/reset-password')
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
  })

  it('F-AU-03: with no recovery session the page says the link is no longer valid and offers a new one', async () => {
    const { location } = await openAt('/reset-password')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Reset password' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/no longer valid/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /new reset link/i })).toHaveAttribute(
      'href',
      '/login?forgot=1',
    )
    expect(location()).toBe('/reset-password')
    await act(async () => {})
  })
})
