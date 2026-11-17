// Lazy auth pages (one chunk each), apart from routes.tsx so that file exports only the route table.
import { lazy } from 'react'

export const LoginPage = lazy(() => import('./LoginPage'))
export const RegisterPage = lazy(() => import('./RegisterPage'))
export const ResetPasswordPage = lazy(() => import('./ResetPasswordPage'))
