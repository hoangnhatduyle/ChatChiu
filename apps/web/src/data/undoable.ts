// Connects the two undo kinds (core/undo.ts) to the write hooks (step 4.5; AR-UNDO-KINDS).
//
//  useCommittedWrite  the write starts now (cache updated first, as always) and a toast offers Undo.
//                     Undo cancels the write if it is still waiting offline (QUEUED_OFFLINE -> UNDONE,
//                     nothing is sent), otherwise sends the reverse change once the first is saved.
//  useHeldWrite       the change is only applied to the cache (the row disappears); the request waits
//                     for the toast to close, or is sent at once with keepalive when the page is
//                     hidden. Undo puts the row back and the server is never called.
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useToast, useUndo } from '../core/toast-context'
import type { ToastAction } from '../core/toast-store'
import type { UndoHandle, UndoManager } from '../core/undo'
import { newRequestId } from './query-client'
import { applyWrite, startWrite, type WriteDefinition, type WriteHandle } from './write'

export type CommitOptions<TData> = {
  message: string
  reverse: Reverse<TData>
  /** Buttons shown before Undo in the toast (the used-up toast). */
  extraActions?: ReadonlyArray<ToastAction>
  /** Called when Undo is pressed, before the reverse is sent. */
  onUndo?: () => void
}

export type Reverse<TData> = {
  /** Builds the reverse change from what the server answered (e.g. the usage row id). */
  build: (saved: TData) => { run: () => WriteHandle<unknown> }
}

/** Starts `def` and offers Undo. Returns the write's own handle. */
export function commitWrite<TInput, TData, TUndo>(
  client: QueryClient,
  undo: UndoManager,
  def: WriteDefinition<TInput, TData, TUndo>,
  input: TInput,
  options: CommitOptions<TData>,
): WriteHandle<TData> {
  const handle = startWrite(client, def, input)
  const committed = undo.commit({
    message: options.message,
    extraActions: options.extraActions,
    reverse: async () => {
      options.onUndo?.()
      if (handle.cancel()) return // still waiting: nothing was sent, nothing to reverse
      const first = await handle.result
      // A refused first write was rolled back and reported already; a failed reverse is reported the same way.
      if (first.status === 'failed') {
        handle.discard() // it was undone: Retry on its failure toast must not send it
        return
      }
      if (first.status !== 'saved') return
      const second = await options.reverse.build(first.data).run().result
      // A refusal is reported by the failed-write toast; one that never started has no toast, so say it here.
      if (second.status === 'failed' && second.blocked) throw second.error
    },
  })
  // A refused (or blocked) first write was rolled back: the toast must not keep offering Undo, or the
  // used-up actions, for a change that never happened.
  void handle.result.then((first) => {
    if (first.status !== 'saved') committed.retract()
  })
  return handle
}

/** Hides the change now and sends it when the toast closes. Returns false (and says why) if blocked. */
export function holdWrite<TInput, TData, TUndo>(
  client: QueryClient,
  undo: UndoManager,
  show: (message: string) => void,
  def: WriteDefinition<TInput, TData, TUndo>,
  input: TInput,
  message: string,
): UndoHandle | null {
  const applied = applyWrite(client, def, input)
  if ('blocked' in applied) {
    show(applied.blocked)
    return null
  }
  const requestId = newRequestId()
  // hide() already ran (applyWrite): the manager's hide is a no-op, its restore reverts the change.
  return undo.hold({
    message,
    hide: () => undefined,
    restore: applied.revert,
    // A refusal rolls the row back and is reported like any failed write (failed-write-toasts.tsx).
    // The same idempotency key for every attempt: a retry after a lost answer must not duplicate it.
    send: async ({ keepalive }) => {
      const result = await startWrite(client, def, input, {
        keepalive,
        requestId,
        preApplied: { undo: applied.undo },
      }).result
      if (result.status === 'failed' && result.blocked) throw result.error
    },
  })
}

export function useCommittedWrite<TInput, TData, TUndo>(
  def: WriteDefinition<TInput, TData, TUndo>,
) {
  const client = useQueryClient()
  const undo = useUndo()
  return useCallback(
    (input: TInput, options: CommitOptions<TData>) =>
      commitWrite(client, undo, def, input, options),
    [client, undo, def],
  )
}

export function useHeldWrite<TInput, TData, TUndo>(def: WriteDefinition<TInput, TData, TUndo>) {
  const client = useQueryClient()
  const undo = useUndo()
  const toasts = useToast()
  return useCallback(
    (input: TInput, message: string) =>
      holdWrite(
        client,
        undo,
        (text) => void toasts.show({ message: text, tone: 'error' }),
        def,
        input,
        message,
      ),
    [client, undo, toasts, def],
  )
}
