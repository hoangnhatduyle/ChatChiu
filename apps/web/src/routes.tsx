// Route table (architecture.md §2). Every page is a React.lazy chunk, checked against the budgets
// in scripts/check-bundle-budget.mjs (initial JS incl. the board route <= 150 KB gz, each other
// route <= 120 KB gz). Phase 5 swaps each PendingPage for its feature page.
import type { RouteObject } from 'react-router'
import { AppShell } from './shell/AppShell'
import { DESTINATIONS } from './shell/nav'
import { RouteError } from './shell/RouteError'
import { KitchenPage, MorePage, NotFoundPage, PendingPage } from './shell/pages'

export const routes: RouteObject[] = [
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
]
