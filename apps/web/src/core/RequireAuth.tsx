// Route guard (F-AU-05): every page except login, register and reset-password needs a session.
// Used as a layout route in routes.tsx; it renders the protected children through <Outlet />.
import { Navigate, Outlet, useLocation } from 'react-router'
import { useSession } from './session-context'
import { ConfigErrorScreen, SessionLoadingScreen } from './guard-screens'
import { LOGIN_PATH, RESET_PASSWORD_PATH } from './auth-paths'

export function RequireAuth() {
  const { ready, status, configError, signedOutOnPurpose } = useSession()
  const location = useLocation()

  if (configError) return <ConfigErrorScreen message={configError} />
  if (!ready) return <SessionLoadingScreen />
  // A recovery link gives a temporary session; it may only be used to set a new password.
  if (status === 'PASSWORD_RECOVERY') return <Navigate to={RESET_PASSWORD_PATH} replace />
  if (status !== 'SIGNED_IN') {
    // F-AU-09: after her own sign-out there is no page to come back to (the next person to sign in
    // lands on the board); after an expiry she returns to where she was.
    const from = location.pathname + location.search + location.hash
    return <Navigate to={LOGIN_PATH} replace state={signedOutOnPurpose ? undefined : { from }} />
  }
  return <Outlet />
}
