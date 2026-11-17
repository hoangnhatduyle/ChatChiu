// Catches a page that fails to render or load (most often a chunk a new deployment removed while an
// old tab was open) and shows RouteError inside the shell; and, around the whole app, shows AppCrash
// instead of a blank page. React has no function-component error boundary, so this is the one class in
// the app. Error reporting (Sentry, VITE_SENTRY_DSN) joins in Phase 6.
import { Component, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router'
import { AppCrash } from './AppCrash'
import { RouteError } from './RouteError'

type Props = { children: ReactNode; fallback: (error: unknown) => ReactNode }
type State = { error: unknown }

class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    // A thrown null or undefined must still count as a failure.
    return { error: error ?? new Error('Something failed.') }
  }

  override render() {
    return this.state.error === null ? this.props.children : this.props.fallback(this.state.error)
  }
}

const routeFallback = (error: unknown) => <RouteError error={error} />

/** The layout route around every page: a failure is shown in place and clears on the next navigation. */
export function RoutePageBoundary() {
  // `key` changes on every navigation, including to the same path, so "Back to the kitchen" on a page
  // that failed tries that page again.
  const { key } = useLocation()
  return (
    <ErrorBoundary key={key} fallback={routeFallback}>
      <Outlet />
    </ErrorBoundary>
  )
}

/** Around the whole app: a failure above the pages shows a full-screen message. */
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary fallback={() => <AppCrash />}>{children}</ErrorBoundary>
}
