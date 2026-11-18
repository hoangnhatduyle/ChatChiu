// Lazy page components (one chunk each). Kept apart from routes.tsx so that file exports only the
// route table (fast refresh).
import { lazy } from 'react'

export const KitchenPage = lazy(() => import('../features/kitchen-board/KitchenBoardPage'))
export const ItemFormPage = lazy(() => import('../features/item-form/ItemFormPage'))
export const PendingPage = lazy(() => import('./PendingPage'))
export const MorePage = lazy(() => import('./MorePage'))
export const NotFoundPage = lazy(() => import('./NotFoundPage'))
