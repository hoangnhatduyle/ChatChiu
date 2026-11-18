// Catches a failure to load or render the panel chunk (offline on an installed app, or a chunk a new
// deployment removed) so the board stays usable: the board closes the panel and says what happened.
// React has no function-component error boundary (see shell/RouteErrorBoundary.tsx).
import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode; onError: (error: unknown) => void }

export class PanelLoadBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: unknown) {
    this.props.onError(error ?? new Error('The panel failed to load.'))
  }

  override render() {
    return this.state.failed ? null : this.props.children
  }
}
