// Undo, in the two kinds architecture §3.3 names (AR-UNDO-KINDS; SPEC-QP-001 commit_now_action and
// hold_until_close_action). Nothing undoable asks "are you sure?" (CS-UNDO-NOT-CONFIRM).
//
//  commit  the change was already sent; Undo sends the reverse (usage, move, restock, tick...).
//          The newest one stays undoable without a time limit (undoLast), for anyone who cannot reach
//          a 5-second toast (keyboard and screen-reader users, WCAG 2.2.1).
//  hold    the change is only hidden on screen; the server call waits for the toast to close
//          (UNDO_WINDOW_MS, longer while the toast is hovered or focused). Hiding or leaving the
//          page sends it at once with fetch keepalive, so nothing is lost (NC-QP-NO-LOST-ACTION).
//          An undone action is never sent (FORBID UNDONE -> SENDING).
//
// This file knows nothing about the API or the cache: the caller passes what to do. data/undoable.ts
// connects it to the write hooks.
import type { ToastAction, ToastStore } from './toast-store'

export type SendOptions = { keepalive: boolean }

export type CommitSpec = {
  message: string
  /** Buttons shown before Undo (the used-up toast: Add to shopping list, Remove). */
  extraActions?: ReadonlyArray<ToastAction>
  /** Sends the reverse change. A failure is reported with Retry. */
  reverse: () => Promise<unknown> | void
}

export type HoldSpec = {
  message: string
  /** Hides the change on screen now. */
  hide: () => void
  /** Shows it again (Undo). */
  restore: () => void
  /** Makes the server call. A failure is reported with Retry. */
  send: (options: SendOptions) => Promise<unknown> | void
}

/** What `commit` returns: Undo, and a way to take the toast back when the change was refused. */
export interface CommitHandle extends UndoHandle {
  /** The change never happened (its write was refused): drop the toast and the Undo for it. */
  retract: () => void
}

export interface UndoHandle {
  /** Runs the undo; false if it is no longer possible (already undone, or already sent). */
  undo: () => Promise<boolean>
}

export interface UndoManager {
  commit: (spec: CommitSpec) => CommitHandle
  hold: (spec: HoldSpec) => UndoHandle
  canUndoLast: () => boolean
  undoLast: () => Promise<boolean>
  /** Sends every held action now (the page is going away). */
  /** Listens for the page being hidden or closed. Safe to call again after dispose. */
  start: () => void
  flush: () => void
  dispose: () => void
}

type Deps = {
  toasts: ToastStore
  windowTarget?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>
  documentTarget?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & {
    visibilityState: DocumentVisibilityState
  }
}

type Entry = { message: string; undo: () => Promise<boolean>; isUndoable: () => boolean }

export function createUndoManager({
  toasts,
  windowTarget = window,
  documentTarget = document,
}: Deps): UndoManager {
  // Newest last; entries that can no longer be undone are dropped as new ones arrive.
  let stack: Entry[] = []
  const MAX_STACK = 20
  const remember = (entry: Entry) => {
    stack = [...stack.filter((e) => e.isUndoable()), entry].slice(-MAX_STACK)
  }
  const newest = () => [...stack].reverse().find((e) => e.isUndoable())
  const pendingHolds = new Set<() => void>()

  function failure(message: string, retry: () => void) {
    toasts.show({
      message,
      tone: 'error',
      actions: [{ label: 'Retry', onPress: retry }],
    })
  }

  function commit({ message, reverse, extraActions = [] }: CommitSpec): CommitHandle {
    let state: 'saved' | 'reversing' | 'reversed' | 'retracted' = 'saved'
    let toastId: number | null = null

    const run = async (): Promise<boolean> => {
      if (state !== 'saved') return false
      state = 'reversing'
      if (toastId !== null) toasts.dismiss(toastId)
      try {
        await reverse()
        state = 'reversed'
        return true
      } catch {
        state = 'saved'
        failure("Couldn't undo", () => void run())
        return false
      }
    }
    const entry: Entry = { message, undo: run, isUndoable: () => state === 'saved' }
    remember(entry)
    toastId = toasts.show({
      message,
      actions: [...extraActions, { label: 'Undo', onPress: () => void run() }],
    })
    const retract = () => {
      if (state !== 'saved') return
      state = 'retracted'
      if (toastId !== null) toasts.dismiss(toastId)
    }
    return { undo: run, retract }
  }

  function hold({ message, hide, restore, send }: HoldSpec): UndoHandle {
    let state: 'hidden' | 'undone' | 'sent' = 'hidden'
    let toastId: number | null = null

    const sendNow = (keepalive: boolean) => {
      if (state !== 'hidden') return
      state = 'sent'
      pendingHolds.delete(flushOne)
      const attempt = async () => {
        try {
          await send({ keepalive })
        } catch {
          failure("Couldn't save", () => void attempt())
        }
      }
      void attempt()
    }
    const flushOne = () => {
      sendNow(true) // first: the toast's onClose would otherwise send without keepalive
      if (toastId !== null) toasts.dismiss(toastId)
    }
    const undo = (): Promise<boolean> => {
      if (state !== 'hidden') return Promise.resolve(false)
      state = 'undone'
      pendingHolds.delete(flushOne)
      if (toastId !== null) toasts.dismiss(toastId)
      restore()
      return Promise.resolve(true)
    }
    const entry: Entry = { message, undo, isUndoable: () => state === 'hidden' }

    hide()
    pendingHolds.add(flushOne)
    remember(entry)
    toastId = toasts.show({
      message,
      actions: [{ label: 'Undo', onPress: () => void undo() }],
      keep: true, // never pushed out by newer toasts: that would end the Undo window early
      onClose: () => sendNow(false),
    })
    return { undo }
  }

  const flush = () => {
    for (const flushOne of [...pendingHolds]) flushOne()
  }
  const onVisibility = () => {
    if (documentTarget.visibilityState === 'hidden') flush()
  }
  // start() may run again after dispose(): React's strict mode mounts, unmounts and mounts again.
  const start = () => {
    documentTarget.addEventListener('visibilitychange', onVisibility)
    windowTarget.addEventListener('pagehide', flush)
  }

  return {
    start,
    commit,
    hold,
    canUndoLast: () => newest() !== undefined,
    undoLast: async () => {
      const entry = newest()
      if (!entry) return false
      const done = await entry.undo()
      // Ctrl+Z may reverse a change from a while ago: say what was undone.
      if (done) toasts.show({ message: `Undone · ${entry.message}` })
      return done
    },
    flush,
    dispose: () => {
      flush()
      documentTarget.removeEventListener('visibilitychange', onVisibility)
      windowTarget.removeEventListener('pagehide', flush)
    },
  }
}
