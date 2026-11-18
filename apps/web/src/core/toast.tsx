// The toast region and provider (step 4.5, F-AP-03). One place shows every message, Undo and Retry.
//
// Accessibility (carried over from the Toast component, decided in 3.x):
//  - two live regions, role="status" and role="alert", stay mounted for the life of the app and only
//    their text changes; the visible toasts do not announce themselves (live={false});
//  - the region is marked data-live-announcer, so react-aria's modal handling (ResponsivePanel) does not
//    hide it from screen readers while a panel is open;
//  - a keyboard route: Alt+Shift+T moves focus to the newest toast's first button, and Ctrl/Cmd+Z undoes
//    the newest change (no time limit for commit-now changes: core/undo.ts undoLast).
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Toast } from '../ui/Toast'
import { ToastContext } from './toast-context'
import { createToastStore, type ToastStore } from './toast-store'
import { createUndoManager } from './undo'

const FOCUS_SHORTCUT = { code: 'KeyT' }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [value] = useState(() => {
    const toasts = createToastStore()
    return { toasts, undo: createUndoManager({ toasts }) }
  })
  useEffect(() => {
    value.undo.start()
    return () => value.undo.dispose() // sends what is still held (keepalive)
  }, [value])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleShortcut(event, value.undo)
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [value])
  return (
    <ToastContext value={value}>
      {children}
      <ToastRegion store={value.toasts} />
    </ToastContext>
  )
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function handleShortcut(
  event: KeyboardEvent,
  undo: { canUndoLast: () => boolean; undoLast: () => Promise<boolean> },
) {
  const key = event.key.toLowerCase()
  // event.code: with Option held, macOS reports a different character in event.key.
  if (event.code === FOCUS_SHORTCUT.code && event.altKey && event.shiftKey) {
    const toasts = document.querySelectorAll<HTMLElement>('[data-toast]')
    toasts[toasts.length - 1]?.querySelector<HTMLElement>('button')?.focus()
    event.preventDefault()
    return
  }
  if (
    key === 'z' &&
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    !isEditable(event.target)
  ) {
    if (!undo.canUndoLast()) return
    event.preventDefault()
    void undo.undoLast()
  }
}

function ToastRegion({ store }: { store: ToastStore }) {
  const items = useSyncExternalStore(store.subscribe, store.getItems)
  const { status, alert } = useSyncExternalStore(store.subscribe, store.getAnnouncements)
  return (
    <div
      data-live-announcer="true"
      // Marked as a top layer so the open panel's focus containment lets Alt+Shift+T move focus here (7.0.21b).
      data-react-aria-top-layer="true"
      className="pointer-events-none fixed inset-x-3 bottom-[calc(var(--spacing-nav)+env(safe-area-inset-bottom)+12px)] z-[60] flex flex-col items-center gap-2 md:bottom-6"
    >
      <div role="status" className="sr-only">
        {status}
      </div>
      <div role="alert" className="sr-only">
        {alert}
      </div>
      <div role="region" aria-label="Notifications" className="contents">
        {items.map((item) => (
          <div key={item.id} className="pointer-events-auto flex w-full justify-center">
            <Toast
              live={false}
              message={item.message}
              tone={item.tone}
              durationMs={item.durationMs}
              onClose={() => store.dismiss(item.id)}
              actions={item.actions?.map((action) => ({
                label: action.label,
                onPress: () => {
                  action.onPress()
                  store.dismiss(item.id)
                },
              }))}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
