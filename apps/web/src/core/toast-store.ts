// The toast queue, outside React (step 4.5, F-AP-03). The region (toast.tsx) renders it; core/undo.ts
// and anything else shows toasts through it. Announcements are kept apart from the visible toasts:
// the live regions stay mounted and only their text changes, because a live region that appears
// together with its text is often not announced.
import { UNDO_WINDOW_MS } from '@chatchiu/domain'

export type ToastAction = { label: string; onPress: () => void }

export type ToastSpec = {
  message: string
  actions?: ReadonlyArray<ToastAction>
  tone?: 'default' | 'error'
  /** `null` keeps it until handled. An error toast always stays until dismissed. */
  durationMs?: number | null
  /** A toast that must not be pushed out by newer ones (a held action's Undo window). */
  keep?: boolean
  /** Called once, however the toast ends (timer, a button, dismissed, pushed out by newer ones). */
  onClose?: () => void
}

export type ToastItem = Readonly<ToastSpec> & { readonly id: number }

export type Announcements = { status: string; alert: string }

/** How many toasts show at once; the oldest is closed (its onClose runs) to make room. */
export const MAX_VISIBLE_TOASTS = 3
/** The text is cleared first and set again after this, so a repeated message is announced again. */
export const ANNOUNCE_GAP_MS = 60

export interface ToastStore {
  show: (spec: ToastSpec) => number
  dismiss: (id: number) => void
  getItems: () => ReadonlyArray<ToastItem>
  getAnnouncements: () => Announcements
  subscribe: (listener: () => void) => () => void
  dispose: () => void
}

export function createToastStore(): ToastStore {
  let items: ReadonlyArray<ToastItem> = []
  let announcements: Announcements = { status: '', alert: '' }
  let nextId = 1
  const listeners = new Set<() => void>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const notify = () => listeners.forEach((listener) => listener())

  // Messages that arrive while a clear-and-set is already waiting join it: two announcements set
  // within a few milliseconds would overwrite each other, and a screen reader would say only the last.
  const waiting: Record<keyof Announcements, string[]> = { status: [], alert: [] }

  function announce(kind: keyof Announcements, text: string) {
    waiting[kind].push(text)
    if (waiting[kind].length > 1) return // its timer is already running
    announcements = { ...announcements, [kind]: '' }
    notify()
    const timer = setTimeout(() => {
      timers.delete(timer)
      const parts = [...new Set(waiting[kind])].map((m) => m.replace(/\.$/, ''))
      announcements = { ...announcements, [kind]: parts.join('. ') }
      waiting[kind] = []
      notify()
    }, ANNOUNCE_GAP_MS)
    timers.add(timer)
  }

  function dismiss(id: number) {
    const item = items.find((i) => i.id === id)
    if (!item) return
    items = items.filter((i) => i.id !== id)
    notify()
    item.onClose?.()
  }

  function show(spec: ToastSpec): number {
    const item: ToastItem = {
      ...spec,
      id: nextId++,
      durationMs: spec.durationMs === undefined ? UNDO_WINDOW_MS : spec.durationMs,
    }
    items = [...items, item]
    // The oldest toasts that may be pushed out; a kept one stays even beyond the limit.
    const excess = Math.max(0, items.length - MAX_VISIBLE_TOASTS)
    const overflow = items.filter((i) => !i.keep).slice(0, excess)
    notify()
    announce(item.tone === 'error' ? 'alert' : 'status', item.message)
    overflow.forEach((old) => dismiss(old.id))
    return item.id
  }

  return {
    show,
    dismiss,
    getItems: () => items,
    getAnnouncements: () => announcements,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: () => {
      timers.forEach(clearTimeout)
      timers.clear()
      waiting.status = []
      waiting.alert = []
      listeners.clear()
    },
  }
}
