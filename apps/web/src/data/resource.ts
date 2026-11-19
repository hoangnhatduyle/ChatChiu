// Create / update / delete for any list of rows with a numeric id (step 4.4): the cache changes first,
// the server's row replaces the optimistic one, a refusal rolls back. A new row gets a temporary
// negative id until the server answers; screens must not offer edits on a row whose id is negative.
import type { QueryClient } from '@tanstack/react-query'
import { api } from '../core/api-client'
import { ApiClientError } from '../core/errors'
import { defineWrite, type WriteDefinition } from './write'

export type Row = { id: number }

/** Where a list lives in the cache (its own query, or a field of the bootstrap). */
export type WriteOptions = { cancelFetch?: boolean }

export type ListStore<T extends Row> = {
  /** The query (prefix) holding the list: refetched after a rollback, and its in-flight fetch is stopped before a write. */
  queryKey: readonly unknown[]
  read: (client: QueryClient) => T[]
  /** `cancelFetch: false` for changes that come from the server (a fetch on its way is still right). */
  write: (client: QueryClient, rows: T[], options?: WriteOptions) => void
}

export function queryListStore<T extends Row>(key: readonly unknown[]): ListStore<T> {
  return {
    queryKey: key,
    read: (client) => client.getQueryData<T[]>(key) ?? [],
    write: (client, rows, options) => {
      // A list that was never loaded stays unloaded: do not invent a cache entry out of one write.
      if (client.getQueryData(key) === undefined) return
      // A fetch already on its way would land after this change and undo it.
      if (options?.cancelFetch !== false)
        void client.cancelQueries({ queryKey: key }, { revert: false })
      client.setQueryData<T[]>(key, rows)
    },
  }
}

/**
 * DELETE that treats "already gone" as done: a replayed delete whose first attempt got through answers
 * 404, and rolling the row back for that would bring back something that no longer exists.
 */
export async function deleteRow(
  path: string,
  requestId: string,
  body?: unknown,
  options?: { keepalive?: boolean },
): Promise<unknown> {
  try {
    return await api.delete(path, {
      idempotencyKey: requestId,
      body,
      keepalive: options?.keepalive,
    })
  } catch (error) {
    // Only the API's own "no such row" (not a proxy or wrong-route 404), and never for a bulk delete,
    // which does not answer 404.
    if (body === undefined && error instanceof ApiClientError && error.code === 'NOT_FOUND') {
      return { deleted: false }
    }
    throw error
  }
}

/** The name a body carries (`name`, or `itemName` for waste entries), for words like `Add "Milk"`. */
function nameIn(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { name, itemName } = value as { name?: unknown; itemName?: unknown }
  const text = typeof name === 'string' ? name : typeof itemName === 'string' ? itemName : ''
  return text.trim() === '' ? undefined : text.trim()
}

const keyAliases = new Map<string, number>()
/**
 * The React key for a row: a row created on this page keeps the key of its temporary id after the server
 * gives it the real one, so saving does not remount it and drop her focus (7.0.28h). Ids are per table, so
 * the alias is kept per resource name; it is dropped when the row is deleted.
 */
export const rowKey = (resource: string, id: number): number =>
  keyAliases.get(`${resource}:${id}`) ?? id

export const isTempId = (id: number): boolean => id < 0
/** A write on a row that is still being created waits for the user to retry: its real id is not known yet. */
export const tempGuard = (...ids: number[]): string | null =>
  ids.some(isTempId) ? 'This is still being saved. Try again in a moment.' : null
let tempCounter = 0
/** A new temporary id, unique for this page load and always negative. */
export const newTempId = (): number => -(Date.now() * 1000 + (tempCounter++ % 1000))

type CreateInput<TCreate> = { tempId: number; body: TCreate }
type UpdateInput<TUpdate> = { id: number; patch: TUpdate }

export type ResourceOptions<T extends Row, TCreate> = {
  /** Unique name: it prefixes the write keys and scopes. */
  name: string
  /** Words for the failed-writes list, e.g. "location". */
  noun: string
  path: string
  store: ListStore<T>
  /** The row to show before the server answers. */
  draft: (body: TCreate, tempId: number) => T
  /** Runs after a create, update or delete is saved: refresh anything computed from these rows (e.g. statistics). */
  onSaved?: (client: QueryClient) => void
  /** Runs after a delete is saved, with the id that went (e.g. items lose a deleted location). */
  onRemoved?: (client: QueryClient, id: number) => void
}

export type Resource<T extends Row, TCreate, TUpdate> = {
  create: WriteDefinition<CreateInput<TCreate>, T, { tempId: number }>
  update: WriteDefinition<UpdateInput<TUpdate>, T, { id: number; before: Partial<T> | null }>
  remove: WriteDefinition<{ id: number }, unknown, { row: T; index: number } | null>
}

export function defineResource<T extends Row, TCreate, TUpdate extends object>(
  o: ResourceOptions<T, TCreate>,
): Resource<T, TCreate, TUpdate> {
  const create = defineWrite<CreateInput<TCreate>, T, { tempId: number }>({
    key: `${o.name}/create`,
    refetchOnFailure: o.store.queryKey,
    label: `Add ${o.noun}`,
    describe: ({ body }) => {
      const name = nameIn(body)
      return name ? `Add "${name}"` : `Add ${o.noun}`
    },
    scope: ({ tempId }) => `${o.name}:${tempId}`,
    request: ({ body }, requestId) => api.post<T>(o.path, body, { idempotencyKey: requestId }),
    apply: (client, { tempId, body }) => {
      o.store.write(client, [...o.store.read(client), o.draft(body, tempId)])
      return { tempId }
    },
    reconcile: (client, saved, { tempId }) => {
      keyAliases.set(`${o.name}:${saved.id}`, tempId)
      o.onSaved?.(client)
      const rows = o.store.read(client)
      // A refetch may have replaced the temporary row, and a realtime event may already have added the
      // saved one (it can beat the answer): never lose the row, never show it twice.
      const next = rows.some((r) => r.id === tempId)
        ? rows.map((r) => (r.id === tempId ? saved : r))
        : rows.some((r) => r.id === saved.id)
          ? rows.map((r) => (r.id === saved.id ? saved : r))
          : [...rows, saved]
      o.store.write(
        client,
        next.filter((row, i) => next.findIndex((other) => other.id === row.id) === i),
      )
    },
    rollback: (client, { tempId }) =>
      o.store.write(
        client,
        o.store.read(client).filter((r) => r.id !== tempId),
      ),
  })

  const update = defineWrite<UpdateInput<TUpdate>, T, { id: number; before: Partial<T> | null }>({
    key: `${o.name}/update`,
    refetchOnFailure: o.store.queryKey,
    guard: ({ id }) => tempGuard(id),
    label: `Change ${o.noun}`,
    describe: ({ patch }) => {
      const name = nameIn(patch)
      return name ? `Change "${name}"` : `Change ${o.noun}`
    },
    scope: ({ id }) => `${o.name}:${id}`,
    request: ({ id, patch }, requestId) =>
      api.patch<T>(`${o.path}/${id}`, patch, { idempotencyKey: requestId }),
    apply: (client, input) => {
      const { id } = input
      const patch = Object.fromEntries(
        Object.entries(input.patch).filter(([, value]) => value !== undefined),
      ) as Partial<T>
      const rows = o.store.read(client)
      const row = rows.find((r) => r.id === id)
      if (!row) return { id, before: null }
      // Only the fields the patch touches are remembered, so a rollback leaves later changes alone.
      const before: Record<string, unknown> = {}
      for (const field of Object.keys(patch))
        before[field] = (row as Record<string, unknown>)[field]
      o.store.write(
        client,
        rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      )
      return { id, before: before as Partial<T> }
    },
    reconcile: (client, saved) => {
      o.onSaved?.(client)
      o.store.write(
        client,
        o.store.read(client).map((r) => (r.id === saved.id ? saved : r)),
      )
    },
    rollback: (client, { id, before }) => {
      if (!before) return
      o.store.write(
        client,
        o.store.read(client).map((r) => (r.id === id ? { ...r, ...before } : r)),
      )
    },
  })

  const remove = defineWrite<{ id: number }, unknown, { row: T; index: number } | null>({
    key: `${o.name}/remove`,
    refetchOnFailure: o.store.queryKey,
    guard: ({ id }) => tempGuard(id),
    label: `Delete ${o.noun}`,
    scope: ({ id }) => `${o.name}:${id}`,
    request: ({ id }, requestId, options) =>
      deleteRow(`${o.path}/${id}`, requestId, undefined, options),
    apply: (client, { id }) => {
      const rows = o.store.read(client)
      const index = rows.findIndex((r) => r.id === id)
      const row = rows[index]
      if (!row) return null
      o.store.write(
        client,
        rows.filter((r) => r.id !== id),
      )
      return { row, index }
    },
    reconcile: (client, _data, _undo, { id }) => {
      keyAliases.delete(`${o.name}:${id}`)
      o.onSaved?.(client)
      o.onRemoved?.(client, id)
    },
    rollback: (client, undo) => {
      if (!undo) return
      const rows = o.store.read(client).filter((r) => r.id !== undo.row.id)
      o.store.write(client, [...rows.slice(0, undo.index), undo.row, ...rows.slice(undo.index)])
    },
  })

  return { create, update, remove }
}
