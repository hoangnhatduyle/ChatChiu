// Route guard (F-AU-05): every page except login, register and reset-password needs a session.
// Used as a layout route in routes.tsx; it renders the protected children through <Outlet />.
import { Navigate, Outlet, useLocation } from 'react-router'
import { useSession } from './session-context'
import { LOGIN_PATH, RESET_PASSWORD_PATH } from './auth-paths'

export function RequireAuth() {
  const { ready, status, configError } = useSession()
  const location = useLocation()

  if (configError) {
    return (
      <main id="main" className="min-h-dvh bg-bg p-6 text-ink">
        <h1 className="text-xl font-bold">Chắt Chiu can&apos;t start</h1>
        <p role="alert" className="mt-2">
          {configError}
        </p>
      </main>
    )
  }
  // Nothing protected (and no redirect) until the stored session has been read.
  if (!ready) {
    return (
      <main id="main" className="min-h-dvh bg-bg" aria-busy="true">
        <p role="status" className="sr-only">
          Loading…
        </p>
      </main>
    )
  }
  // A recovery link gives a temporary session; it may only be used to set a new password.
  if (status === 'PASSWORD_RECOVERY') return <Navigate to={RESET_PASSWORD_PATH} replace />
  if (status !== 'SIGNED_IN') {
    const from = location.pathname + location.search + location.hash
    return <Navigate to={LOGIN_PATH} replace state={{ from }} />
  }
  return <Outlet />
}
