// The write pattern, once (architecture §3.2/3.3; SPEC-AP-001 F-AP-04; SPEC-KB-001 board_usage_change):
//   1. the cache is updated first, synchronously, before anything is sent (d5533bc0);
//   2. the request goes out with the write's requestId as its Idempotency-Key (queued while offline,
//      and replayed after a reload with the same key: see query-client.ts);
//   3. on success the server's row replaces the optimistic one: no list refetch;
//   4. on a failure the server decided, the change is rolled back and the write is kept as "failed" so
//      the user can Retry (same key) or Discard.
// Each data/<domain>.ts module declares its writes with defineWrite and starts them with useWrite.
import {
  useMutationState,
  useQueryClient,
  type Mutation,
  type QueryClient,
} from '@tanstack/react-query'
import { useCallback } from 'react'
import { newRequestId, defineMutation } from './query-client'

/** What a write does. TUndo must be JSON: it is saved with a queued write so a rollback survives a reload. */
export type WriteDefinition<TInput, TData, TUndo> = {
  /** Unique, stable: it is saved with queued writes. */
  key: string
  /** Plain words for the failed-writes list ("Add milk"). */
  label: string
  request: (input: TInput, requestId: string, options?: RequestOptions) => Promise<TData>
  /** Updates the cache at once and returns what is needed to undo that. */
  apply?: (client: QueryClient, input: TInput) => TUndo
  /** Puts the server's answer in the cache (replacing a temporary row, say). */
  reconcile?: (client: QueryClient, data: TData, undo: TUndo, input: TInput) => void
  rollback?: (client: QueryClient, undo: TUndo, input: TInput) => void
  /** Writes sharing a scope id are sent one at a time, in order. */
  scope?: (input: TInput) => string
  /** A reason this write cannot start now (e.g. its row is still being created); nothing changes and it fails at once. */
  guard?: (input: TInput) => string | null
  /** Refetched after a rollback, so a rollback that raced another write cannot leave the cache drifting from the server. */
  refetchOnFailure?: readonly unknown[]
  /** False for calls that are pointless to replay later (AI calls): they are neither queued nor saved. */
  persist?: boolean
}

/** `keepalive`: the page is being hidden, so the request must outlive it (the undo flush, core/undo.ts). */
export type RequestOptions = { keepalive?: boolean }

export type WriteResult<TData> =
  | { status: 'saved'; data: TData }
  /** `blocked`: refused before it started (nothing was sent and no failed write was recorded). */
  | { status: 'failed'; error: unknown; blocked?: true }
  | { status: 'cancelled' }

export type WriteHandle<TData> = {
  requestId: string
  result: Promise<WriteResult<TData>>
  /** Stops a write that has not been sent yet and rolls it back. False once it may have reached the server. */
  cancel: () => boolean
  /** Drops the write from the failed list if it failed, so Retry can no longer send it (it was undone). */
  discard: () => void
}

type Variables<TInput> = {
  requestId: string
  input: TInput
  keepalive?: boolean
  undo?: unknown
  preApplied?: boolean
}
type AnyDefinition = WriteDefinition<unknown, unknown, unknown>

const definitions = new Map<string, AnyDefinition>()
const sentIds = new Set<string>()
const cancelledIds = new Set<string>()
/** The undo context of a write that has been applied, available before TanStack stores it. */
const undoById = new Map<string, unknown>()
const keyOf = (def: { key: string }) => ['write', def.key]

export function defineWrite<TInput, TData, TUndo = undefined>(
  def: WriteDefinition<TInput, TData, TUndo>,
): WriteDefinition<TInput, TData, TUndo> {
  definitions.set(def.key, def as unknown as AnyDefinition)
  defineMutation<TData, Variables<TInput>, TUndo>(keyOf(def), {
    mutationFn: ({ requestId, input, keepalive }) => {
      if (cancelledIds.has(requestId)) throw new Error('This change was cancelled.')
      sentIds.add(requestId)
      return def.request(input, requestId, { keepalive })
    },
    onMutate: ({ requestId, input, undo: applied, preApplied }, context) => {
      // A held write was applied (hidden) when the user acted; it is sent later with that undo context.
      const undo = (preApplied ? applied : def.apply?.(context.client, input)) as TUndo
      undoById.set(requestId, undo)
      return undo
    },
    onSuccess: (data, { requestId, input }, undo, context) => {
      undoById.delete(requestId)
      try {
        def.reconcile?.(context.client, data, undo as TUndo, input)
      } catch (error) {
        // The server has the change; a failure to show it must not roll it back or report it as failed.
        console.error(`Could not show the saved result of ${def.key}`, error)
        void context.client.invalidateQueries()
      }
    },
    onError: (_error, { requestId, input }, undo, context) => {
      undoById.delete(requestId)
      if (cancelledIds.has(requestId)) return
      def.rollback?.(context.client, undo as TUndo, input)
      if (def.refetchOnFailure)
        void context.client.invalidateQueries({ queryKey: def.refetchOnFailure })
    },
  })
  return def
}

type Stored = { mutation: Mutation<unknown, Error, Variables<unknown>, unknown> }

export type StartOptions = {
  /** Reuse an earlier write's idempotency key (Retry). */
  requestId?: string
  keepalive?: boolean
  /** The write was already applied by applyWrite: do not apply it again; this is its undo context. */
  preApplied?: { undo: unknown }
  /** The caller turns a 409 that names the row in the way into its own prompt: no failed-write toast for it. */
  handlesConflict?: boolean
}

/** Applies a write's cache change now and sends nothing: the first half of a held write. */
export function applyWrite<TInput, TData, TUndo>(
  client: QueryClient,
  def: WriteDefinition<TInput, TData, TUndo>,
  input: TInput,
): { undo: TUndo; revert: () => void } | { blocked: string } {
  const blocked = def.guard?.(input)
  if (blocked) return { blocked }
  const undo = def.apply?.(client, input) as TUndo
  return { undo, revert: () => def.rollback?.(client, undo, input) }
}

/** Starts a write: the cache changes before this returns. */
export function startWrite<TInput, TData, TUndo>(
  client: QueryClient,
  def: WriteDefinition<TInput, TData, TUndo>,
  input: TInput,
  options: StartOptions = {},
): WriteHandle<TData> {
  const requestId = options.requestId ?? newRequestId()
  const reason = def.guard?.(input)
  if (reason) {
    return {
      requestId,
      result: Promise.resolve({ status: 'failed', error: new Error(reason), blocked: true }),
      cancel: () => false,
      discard: () => undefined,
    }
  }
  const cache = client.getMutationCache()
  const mutation = cache.build(
    client,
    client.defaultMutationOptions({
      mutationKey: keyOf(def),
      // An AI call is never held for later: offline it fails at once.
      ...(def.persist === false ? { networkMode: 'always' as const, retry: false } : {}),
      // A keepalive send must not wait behind another write of the same row: the page may be gone first.
      scope: def.scope && !options.keepalive ? { id: def.scope(input) } : undefined,
      meta: {
        label: def.label,
        writeKey: def.key,
        ...(def.persist === false ? { persist: false } : {}),
        ...(options.handlesConflict ? { handlesConflict: true } : {}),
      },
    }),
  ) as unknown as Stored['mutation']
  let cancelNow: () => void = () => undefined
  const cancelled = new Promise<WriteResult<TData>>((resolve) => {
    cancelNow = () => resolve({ status: 'cancelled' })
  })
  const sent = mutation
    .execute({
      requestId,
      input,
      keepalive: options.keepalive,
      undo: options.preApplied?.undo,
      preApplied: options.preApplied !== undefined,
    })
    .then((data): WriteResult<TData> => ({ status: 'saved', data: data as TData }))
    .catch((error: unknown): WriteResult<TData> => ({ status: 'failed', error }))
  return {
    requestId,
    result: Promise.race([sent, cancelled]),
    discard: () => {
      if (mutation.state.status === 'error') cache.remove(mutation)
    },
    cancel: () => {
      if (sentIds.has(requestId) || mutation.state.status !== 'pending') return false
      cancelledIds.add(requestId)
      try {
        const undo = undoById.has(requestId) ? undoById.get(requestId) : mutation.state.context
        if (undo !== undefined) def.rollback?.(client, undo as TUndo, input)
      } finally {
        undoById.delete(requestId)
        cache.remove(mutation)
        cancelNow()
      }
      return true
    },
  }
}

/** The hook form of startWrite, on the provider's client. */
export function useWrite<TInput, TData, TUndo>(
  def: WriteDefinition<TInput, TData, TUndo>,
): (input: TInput) => WriteHandle<TData> {
  const client = useQueryClient()
  return useCallback((input: TInput) => startWrite(client, def, input), [client, def])
}

export type FailedWrite = { id: string; label: string; error: unknown; requestId: string }

const isWrite = (mutation: Mutation) => mutation.options.mutationKey?.[0] === 'write'

/** Writes the server refused: already rolled back, waiting for Retry or Discard. */
export function useFailedWrites(): FailedWrite[] {
  return useMutationState<FailedWrite>({
    filters: {
      status: 'error',
      predicate: (m) => isWrite(m) && m.meta?.persist !== false,
    },
    select: (mutation) => ({
      id: String(mutation.mutationId),
      label: String(mutation.meta?.label ?? 'A change'),
      error: mutation.state.error,
      requestId: String((mutation.state.variables as Variables<unknown>).requestId),
    }),
  })
}

function findFailed(client: QueryClient, id: string): Mutation | undefined {
  return client
    .getMutationCache()
    .getAll()
    .find((m) => String(m.mutationId) === id && m.state.status === 'error' && isWrite(m))
}

/** Applies the change again and resends it with the same idempotency key. */
export function retryFailedWrite(
  client: QueryClient,
  id: string,
): WriteHandle<unknown> | undefined {
  const failed = findFailed(client, id)
  const def = definitions.get(String(failed?.meta?.writeKey))
  if (!failed || !def) return undefined
  const { requestId, input } = failed.state.variables as Variables<unknown>
  const handle = startWrite(client, def, input, { requestId })
  client.getMutationCache().remove(failed)
  return handle
}

export function dismissFailedWrite(client: QueryClient, id: string): void {
  const failed = findFailed(client, id)
  if (failed) client.getMutationCache().remove(failed)
}
