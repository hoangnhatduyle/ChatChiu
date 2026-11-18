// App shell (SPEC-AP-001): nav rail from 768 px, bottom bar below, the routed page in <main>, and
// the "New version" prompt. Pages are lazy (routes.tsx); while one loads, a skeleton in the page's
// shape shows instead of a spinner (NC-AP-NO-SPINNER-WITH-CACHE).
import { Suspense, useEffect, useRef, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Skeleton } from '../ui/Skeleton'
import { BottomNav } from './BottomNav'
import { NavRail } from './NavRail'
import { PwaUpdatePrompt } from './UpdatePrompt'

export function AppShell({ banner }: { banner?: ReactNode }) {
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const focusedPath = useRef(pathname)

  // After a navigation, move focus to the new page's h1 (or <main>), so keyboard and screen-reader
  // users land on the new content. Keyed on the path, so the first load (and StrictMode's second
  // effect run) never steals focus.
  useEffect(() => {
    if (focusedPath.current === pathname) return
    focusedPath.current = pathname
    const main = mainRef.current
    const heading = main?.querySelector<HTMLElement>('h1')
    ;(heading ?? main)?.focus()
  }, [pathname])

  return (
    <div className="min-h-dvh bg-bg text-ink md:flex">
      <a
        href="#main"
        className="sr-only rounded-control bg-surface px-4 py-3 font-bold text-ink shadow-pop focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>
      <NavRail />
      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className="min-w-0 flex-1 pb-[calc(var(--spacing-nav)+env(safe-area-inset-bottom))] outline-none md:pb-0"
      >
        {banner}
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
      <BottomNav />
      <PwaUpdatePrompt />
    </div>
  )
}

/** Shown while a page's code loads: the page header and a few rows, in their final positions. */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 pt-5 md:px-6 md:pt-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-3 h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-4/5" />
    </div>
  )
}
