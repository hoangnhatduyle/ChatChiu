// Route table (architecture.md §2). Every page is a React.lazy chunk, checked against the budgets
// in scripts/check-bundle-budget.mjs (initial JS incl. the board route <= 200 KB gz, each other
// route <= 120 KB gz). The scan route stays a PendingPage until step 5.10.
import type { RouteObject } from 'react-router'
import { LOGIN_PATH, RESET_PASSWORD_PATH } from './core/auth-paths'
import { PublicRoute } from './core/PublicRoute'
import { RequireAuth } from './core/RequireAuth'
import { AppDataProvider } from './data/AppDataProvider'
import { LoginPage, RegisterPage, ResetPasswordPage } from './features/auth/pages'
import { AppShell } from './shell/AppShell'
import { RoutePageBoundary } from './shell/RouteErrorBoundary'
import {
  InventoryPage,
  ItemFormPage,
  KitchenPage,
  MealsPage,
  MorePage,
  NotFoundPage,
  PendingPage,
  SettingsPage,
  ShoppingPage,
  StatsPage,
} from './shell/pages'

export const routes: RouteObject[] = [
  {
    // Every page inside needs a session (F-AU-05); signed-out visitors go to /login.
    element: <RequireAuth />,
    children: [
      {
        // The signed-in user's query client: IndexedDB cache and the offline write queue (step 4.3).
        element: <AppDataProvider />,
        children: [
          {
            path: '/',
            element: <AppShell />,
            children: [
              {
                // A page that fails (e.g. a chunk removed by a deploy) shows RouteError inside the shell.
                element: <RoutePageBoundary />,
                children: [
                  { index: true, element: <KitchenPage /> },
                  { path: 'settings', element: <SettingsPage /> },
                  { path: 'more', element: <MorePage /> },
                  { path: 'stock', element: <InventoryPage /> },
                  { path: 'shopping', element: <ShoppingPage /> },
                  { path: 'meals', element: <MealsPage /> },
                  { path: 'stats', element: <StatsPage /> },
                  // The item form (5.3); the receipt scan (5.10) is a stand-in until its step lands.
                  { path: 'stock/new', element: <ItemFormPage /> },
                  { path: 'stock/:id/edit', element: <ItemFormPage /> },
                  { path: 'scan', element: <PendingPage title="Scan receipt" icon="scan" /> },
                  { path: '*', element: <NotFoundPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    // Auth pages: a recovery session is kept on /reset-password, a signed-in visitor is sent on (F-AU-07, F-AU-09).
    element: <PublicRoute />,
    children: [
      {
        // A page chunk that fails to load (offline, removed by a deploy) shows a retry, not a crash.
        element: <RoutePageBoundary />,
        children: [
          { path: LOGIN_PATH, element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: RESET_PASSWORD_PATH, element: <ResetPasswordPage /> },
        ],
      },
    ],
  },
]
