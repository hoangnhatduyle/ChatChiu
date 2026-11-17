// Stand-in for the login, register and reset-password pages until step 5.11 builds them. It sits
// outside the app shell (no navigation for someone who is signed out) and outside RequireAuth.
import { Suspense } from 'react'
import { PendingPage } from './pages'

export function AuthPlaceholderPage({ title }: { title: string }) {
  return (
    <main id="main" className="min-h-dvh bg-bg text-ink">
      <Suspense fallback={null}>
        <PendingPage title={title} icon="home" />
      </Suspense>
    </main>
  )
}
