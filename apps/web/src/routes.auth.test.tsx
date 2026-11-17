// SPEC-AU-001 F-AU-05 against the real route table (routes.tsx) in the production topology:
// AuthProvider above the router. Login, register and reset-password sit outside the guard; the
// shell and its not-found page sit inside it.
import { screen } from '@testing-library/react'
import { vi } from 'vitest'
import { AuthProvider } from './core/auth'
import { ToastProvider } from './core/toast'
import { renderRoutesAt } from './test/render-routes'

const fake = vi.hoisted(() => ({ signedIn: true }))
vi.mock('./core/supabase.client', async () => {
  const { testSession } = await import('./test/fake-auth')
  const client = {
    // Read the flag when the provider subscribes, so each test chooses its own session.
    onAuthStateChange(
      callback: (event: 'INITIAL_SESSION', session: typeof testSession | null) => void,
    ) {
      queueMicrotask(() => callback('INITIAL_SESSION', fake.signedIn ? testSession : null))
      return { data: { subscription: { unsubscribe() {} } } }
    },
  }
  return { getAuthClient: () => client, getConfigError: () => null }
})

function renderAt(path: string, signedIn: boolean) {
  fake.signedIn = signedIn
  return renderRoutesAt(path, (children) => (
    <AuthProvider>
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  ))
}

describe('routes.tsx and the guard', () => {
  it('F-AU-05: signed out, a shell page redirects to the sign-in placeholder, without the shell', async () => {
    const view = renderAt('/stock', false)
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(view.location()).toBe('/login')
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
  })

  it.each([
    ['/register', 'Create account'],
    ['/reset-password', 'Reset password'],
    ['/login', 'Sign in'],
  ])('F-AU-05: signed out, %s opens without a redirect', async (path, title) => {
    const view = renderAt(path, false)
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(view.location()).toBe(path)
  })

  it('F-AU-05: signed in, an unknown path shows Not found inside the shell', async () => {
    renderAt('/nope', true)
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: /not found/i })).toBeInTheDocument()
  })
})
