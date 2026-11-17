// SPEC-AU-001: AuthProvider + useSession + RequireAuth against a fake Supabase auth client.
import type { AuthChangeEvent, Session } from '@supabase/auth-js'
import { act, render, screen } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router'
import { StrictMode } from 'react'
import { afterEach, beforeEach, vi } from 'vitest'

type Listener = (event: AuthChangeEvent, session: Session | null) => void
const listeners = new Set<Listener>()
const unsubscribe = vi.fn()
const auth = {
  onAuthStateChange: vi.fn((cb: Listener) => {
    listeners.add(cb)
    return { data: { subscription: { unsubscribe: () => (listeners.delete(cb), unsubscribe()) } } }
  }),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}
let configError: string | null = null
vi.mock('./supabase.client', () => ({
  getConfigError: () => configError,
  getAuthClient: () => auth,
}))

import { AuthProvider } from './auth'
import { consumeSessionExpiring, markSessionExpiring } from './auth-actions'
import { RequireAuth } from './RequireAuth'
import { useSession } from './session-context'

const session = { access_token: 'secret-token', user: { id: 'u1' } } as unknown as Session
const emit = (event: AuthChangeEvent, s: Session | null) =>
  act(() => {
    for (const cb of [...listeners]) cb(event, s)
  })

function Where() {
  const loc = useLocation()
  return <p data-testid="where">{loc.pathname + loc.search}</p>
}
function Status() {
  const { status, expired, ready } = useSession()
  return <p data-testid="status">{`${ready ? 'ready' : 'loading'}:${status}:${expired}`}</p>
}

function renderApp(initial: string) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <AuthProvider>
            <Where />
            <Status />
            <Outlet />
          </AuthProvider>
        ),
        children: [
          {
            element: <RequireAuth />,
            children: [
              { path: '/', element: <h1>Kitchen</h1> },
              { path: '/stock', element: <h1>Stock</h1> },
            ],
          },
          { path: '/login', element: <h1>Login page</h1> },
          { path: '/reset-password', element: <h1>Reset page</h1> },
        ],
      },
    ],
    { initialEntries: [initial] },
  )
  const view = render(<RouterProvider router={router} />)
  return { router, unmount: view.unmount }
}

afterEach(() => {
  consumeSessionExpiring()
  window.location.hash = ''
})

beforeEach(() => {
  listeners.clear()
  unsubscribe.mockClear()
  configError = null
  vi.clearAllMocks()
})

describe('F-AU-05 route guard', () => {
  it('F-AU-05: shows a loading state, and nothing protected, while the session is still being read', async () => {
    renderApp('/stock')
    expect(screen.getByTestId('status')).toHaveTextContent('loading:SIGNED_OUT:false')
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
    expect(screen.queryByRole('heading', { name: 'Stock' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Login page' })).toBeNull()
    await emit('INITIAL_SESSION', session)
    expect(screen.queryByRole('status')).toBeNull()
    expect(await screen.findByRole('heading', { name: 'Stock' })).toBeInTheDocument()
  })

  it('F-AU-05: without a session any protected page redirects to /login and remembers the page', async () => {
    const { router } = renderApp('/stock?tab=a')
    await emit('INITIAL_SESSION', null)
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument()
    expect(router.state.location.state).toEqual({ from: '/stock?tab=a' })
  })

  it('F-AU-01: a restored session shows the protected page', async () => {
    renderApp('/')
    await emit('INITIAL_SESSION', session)
    expect(await screen.findByRole('heading', { name: 'Kitchen' })).toBeInTheDocument()
    expect(screen.getByTestId('status')).toHaveTextContent('ready:SIGNED_IN:false')
  })

  it('F-AU-03: a recovery session is sent to /reset-password, not to the protected page', async () => {
    renderApp('/stock')
    await emit('PASSWORD_RECOVERY', session)
    expect(await screen.findByRole('heading', { name: 'Reset page' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Stock' })).toBeNull()
  })

  it('F-AU-05: signing out sends her back to /login', async () => {
    renderApp('/')
    await emit('INITIAL_SESSION', session)
    await screen.findByRole('heading', { name: 'Kitchen' })
    await emit('SIGNED_OUT', null)
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument()
  })

  it('F-AU-04: an expired session ends on /login with the expired notice flag on', async () => {
    renderApp('/')
    await emit('INITIAL_SESSION', session)
    await screen.findByRole('heading', { name: 'Kitchen' })
    markSessionExpiring()
    await emit('SIGNED_OUT', null)
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument()
    expect(screen.getByTestId('status')).toHaveTextContent('ready:SIGNED_OUT:true')
  })

  it('F-AU-03: a recovery link in the address bar never shows protected pages, even though the session arrives first', async () => {
    window.location.hash = '#access_token=t&refresh_token=r&type=recovery'
    renderApp('/stock')
    // auth-js reports the session first and PASSWORD_RECOVERY a tick later.
    await emit('INITIAL_SESSION', session)
    expect(screen.queryByRole('heading', { name: 'Stock' })).toBeNull()
    await emit('PASSWORD_RECOVERY', session)
    expect(await screen.findByRole('heading', { name: 'Reset page' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Stock' })).toBeNull()
  })

  it('F-AU-05: under StrictMode there is one live subscription, and an expiry is reported once', async () => {
    const router = createMemoryRouter(
      [
        {
          element: (
            <AuthProvider>
              <Status />
              <Outlet />
            </AuthProvider>
          ),
          children: [
            { element: <RequireAuth />, children: [{ path: '/', element: <h1>Kitchen</h1> }] },
            { path: '/login', element: <h1>Login page</h1> },
          ],
        },
      ],
      { initialEntries: ['/'] },
    )
    const view = render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    )
    expect(listeners.size).toBe(1)
    await emit('INITIAL_SESSION', session)
    await screen.findByRole('heading', { name: 'Kitchen' })
    markSessionExpiring()
    await emit('SIGNED_OUT', null)
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument()
    expect(screen.getByTestId('status')).toHaveTextContent('ready:SIGNED_OUT:true')
    view.unmount()
    expect(listeners.size).toBe(0)
  })

  it('F-AU-01: a sign-in that throws unexpectedly ends SIGNED_OUT (no stuck "signing in")', async () => {
    auth.signInWithPassword.mockRejectedValue(new TypeError('Failed to fetch'))
    function Trigger() {
      const { signIn, status } = useSession()
      return (
        <>
          <button onClick={() => void signIn('a@b.co', 'a-long-enough-password')}>go</button>
          <p data-testid="live-status">{status}</p>
        </>
      )
    }
    const router = createMemoryRouter([
      {
        element: (
          <AuthProvider>
            <Trigger />
          </AuthProvider>
        ),
        path: '/',
      },
    ])
    render(<RouterProvider router={router} />)
    await emit('INITIAL_SESSION', null)
    await act(async () => screen.getByRole('button', { name: 'go' }).click())
    expect(screen.getByTestId('live-status')).toHaveTextContent('SIGNED_OUT')
  })

  it('a missing Supabase configuration is shown as an alert instead of a blank page', async () => {
    configError = 'Supabase is not configured'
    renderApp('/')
    expect(await screen.findByRole('alert')).toHaveTextContent(/not configured/i)
    expect(auth.onAuthStateChange).not.toHaveBeenCalled()
  })

  it('unsubscribes from auth events when the provider unmounts', async () => {
    const { unmount } = renderApp('/')
    await emit('INITIAL_SESSION', session)
    unmount()
    expect(listeners.size).toBe(0)
  })
})
