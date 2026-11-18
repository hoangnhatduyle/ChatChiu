// Root: auth, then the router (step 3.3). The dev-only diagnostics link stays gated here until
// roadmap 7.0.3 removes the spike; main.tsx serves /diagnostics itself when the flag is on.
import { BrowserRouter } from 'react-router'
import { AppRoutes } from './AppRoutes'
import { AuthProvider } from './core/auth'
import { LiveUpdateCheck } from './core/native/LiveUpdateCheck'
import { ToastProvider } from './core/toast'
import { AppErrorBoundary } from './shell/RouteErrorBoundary'

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
          <LiveUpdateCheck />
        </ToastProvider>
        {import.meta.env.VITE_ENABLE_DIAGNOSTICS === 'true' && (
          <a
            href="/diagnostics"
            className="fixed bottom-24 left-3 z-50 inline-flex min-h-touch items-center rounded-pill border border-field-line bg-surface px-4 text-sm font-semibold text-ink shadow-pop md:bottom-4 md:left-24"
          >
            Notification diagnostics
          </a>
        )}
      </AuthProvider>
    </AppErrorBoundary>
  )
}
