// Route table (architecture.md §2). Every page is a React.lazy chunk, checked against the budgets
// in scripts/check-bundle-budget.mjs (initial JS incl. the board route <= 150 KB gz, each other
// route <= 120 KB gz). Phase 5 swaps each PendingPage for its feature page.
import type { RouteObject } from 'react-router'
import { LOGIN_PATH, RESET_PASSWORD_PATH } from './core/auth-paths'
import { RequireAuth } from './core/RequireAuth'
import { AppShell } from './shell/AppShell'
import { AuthPlaceholderPage } from './shell/AuthPlaceholderPage'
import { DESTINATIONS } from './shell/nav'
import { RouteError } from './shell/RouteError'
import { KitchenPage, MorePage, NotFoundPage, PendingPage } from './shell/pages'

export const routes: RouteObject[] = [
  {
    // Every page inside needs a session (F-AU-05); signed-out visitors go to /login.
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          {
            // A page that fails (e.g. a chunk removed by a deploy) shows RouteError inside the shell.
            errorElement: <RouteError />,
            children: [
              { index: true, element: <KitchenPage /> },
              ...DESTINATIONS.filter((d) => d.path !== '/').map((d): RouteObject => ({
                path: d.path.slice(1),
                element: <PendingPage title={d.title} icon={d.icon} />,
              })),
              { path: 'more', element: <MorePage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
  // Public pages (placeholders until 5.11).
  { path: LOGIN_PATH, element: <AuthPlaceholderPage title="Sign in" /> },
  { path: '/register', element: <AuthPlaceholderPage title="Create account" /> },
  { path: RESET_PASSWORD_PATH, element: <AuthPlaceholderPage title="Reset password" /> },
]
