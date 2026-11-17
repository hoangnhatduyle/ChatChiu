// Guard for login, register and reset-password (F-AU-07, F-AU-09): the mirror of RequireAuth.
//  - a recovery session may only be on /reset-password, wherever the link opened;
//  - a signed-in visitor has no business here and goes to the page she asked for, or the board.
import { Suspense } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { RESET_PASSWORD_PATH, safeReturnPath } from './auth-paths'
import { ConfigErrorScreen, SessionLoadingScreen } from './guard-screens'
import { useSession } from './session-context'

export function PublicRoute() {
  const { ready, status, configError } = useSession()
  const location = useLocation()

  if (configError) return <ConfigErrorScreen message={configError} />
  if (!ready) return <SessionLoadingScreen />
  if (status === 'PASSWORD_RECOVERY' && location.pathname !== RESET_PASSWORD_PATH) {
    return <Navigate to={RESET_PASSWORD_PATH} replace />
  }
  if (status === 'SIGNED_IN') {
    const from = (location.state as { from?: unknown } | null)?.from
    return <Navigate to={safeReturnPath(from)} replace />
  }
  // The pages are lazy chunks; a blank page with the loading role fills the gap.
  return (
    <Suspense fallback={<SessionLoadingScreen />}>
      <Outlet />
    </Suspense>
  )
}
