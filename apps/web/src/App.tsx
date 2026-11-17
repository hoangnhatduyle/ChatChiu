// Root: the router (step 3.3). The dev-only diagnostics link stays gated here until roadmap
// 7.0.3 removes the spike; main.tsx serves /diagnostics itself when the flag is on.
import { createBrowserRouter, RouterProvider } from 'react-router'
import { routes } from './routes'

const router = createBrowserRouter(routes)
// Dev only: drop the old router (and its history listener) when this module is hot-replaced.
if (import.meta.hot) import.meta.hot.dispose(() => router.dispose())

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      {import.meta.env.VITE_ENABLE_DIAGNOSTICS === 'true' && (
        <a
          href="/diagnostics"
          className="fixed bottom-24 left-3 z-50 inline-flex min-h-touch items-center rounded-pill border border-field-line bg-surface px-4 text-sm font-semibold text-ink shadow-pop md:bottom-4 md:left-24"
        >
          Notification diagnostics
        </a>
      )}
    </>
  )
}
