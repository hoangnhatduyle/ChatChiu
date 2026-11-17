// The hooks for toasts and undo (step 4.5). The provider is in toast.tsx.
import { createContext, use } from 'react'
import type { ToastStore } from './toast-store'
import type { UndoManager } from './undo'

export type ToastApi = Pick<ToastStore, 'show' | 'dismiss'>
export type ToastContextValue = { toasts: ToastApi; undo: UndoManager }

export const ToastContext = createContext<ToastContextValue | null>(null)

function useToastContext(): ToastContextValue {
  const value = use(ToastContext)
  if (!value) throw new Error('useToast and useUndo need a <ToastProvider> above them.')
  return value
}

export const useToast = (): ToastApi => useToastContext().toasts
export const useUndo = (): UndoManager => useToastContext().undo
