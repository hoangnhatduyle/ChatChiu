// The on-device copy of the query cache and the offline write queue, in IndexedDB (SPEC-AP-001
// F-AP-01, NC-AP-NO-LOST-WRITES, critical). One blob per signed-in user, so one account's data is never
// shown to another. Rules this file keeps, each from a way a queued write could be lost:
//  - a failed read is never treated as "nothing saved": nothing is written or removed after one;
//  - a blob is never deleted without a copy when it holds queued writes (and the loss is reported);
//  - one writer, serialized, always the latest snapshot (no throttle gap, no stale overwrite);
//  - only the leading window writes (see leadership.ts).
// The status below tells the UI when offline mode cannot be relied on, instead of failing silently.
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client'
import { createStore, del, get, set } from 'idb-keyval'

const DB_NAME = 'chatchiu'
const STORE_NAME = 'cache'
const KEY_PREFIX = 'cache:'
const CORRUPT_SUFFIX = ':corrupt'
const DISCARDED_SUFFIX = ':discarded'

/** 'unavailable': IndexedDB cannot be read or written, so queued writes would not survive a reload. 'queue-discarded': a saved queue was removed (a copy is kept). */
export type PersistenceStatus = 'ok' | 'unavailable' | 'queue-discarded'

type Flags = { readFailed: boolean; writeFailed: boolean; queueDiscarded: boolean }
let flags: Flags = { readFailed: false, writeFailed: false, queueDiscarded: false }
const listeners = new Set<() => void>()

function statusOf({ readFailed, writeFailed, queueDiscarded }: Flags): PersistenceStatus {
  if (readFailed || writeFailed) return 'unavailable'
  return queueDiscarded ? 'queue-discarded' : 'ok'
}

let status: PersistenceStatus = 'ok'

function setFlags(patch: Partial<Flags>) {
  flags = { ...flags, ...patch }
  const next = statusOf(flags)
  if (next === status) return
  status = next
  for (const listener of [...listeners]) listener()
}

export const getPersistenceStatus = (): PersistenceStatus => status

export function subscribePersistenceStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** For tests and "Reset app cache". */
export function resetPersistenceStatus(): void {
  setFlags({ readFailed: false, writeFailed: false, queueDiscarded: false })
}

/** The strings-in, strings-out storage the persister needs. */
export type CacheStore = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

let idbStore: ReturnType<typeof createStore> | undefined

function defaultStore(): CacheStore {
  idbStore ??= createStore(DB_NAME, STORE_NAME)
  const store = idbStore
  return {
    getItem: async (key) => (await get<string>(key, store)) ?? null,
    setItem: (key, value) => set(key, value, store),
    removeItem: (key) => del(key, store),
  }
}

function holdsQueuedWrites(raw: string): boolean {
  try {
    const parsed: unknown = JSON.parse(raw)
    const state = (parsed as { clientState?: { mutations?: unknown } } | null)?.clientState
    return Array.isArray(state?.mutations) && state.mutations.length > 0
  } catch {
    return false
  }
}

export type PersisterOptions = {
  store?: CacheStore
  /** False while another window leads (it alone writes the saved cache). */
  canWrite?: () => boolean
}

export function createIdbPersister(
  userId: string,
  { store = defaultStore(), canWrite = () => true }: PersisterOptions = {},
): Persister {
  const key = `${KEY_PREFIX}${userId}`
  // A failed read blocks writes and removals for this persister: whatever is saved stays as it is.
  let readFailed = false
  let pending: PersistedClient | undefined
  let draining: Promise<void> | undefined

  async function writeLatest() {
    while (pending) {
      const snapshot = pending
      pending = undefined
      try {
        await store.setItem(key, JSON.stringify(snapshot))
        setFlags({ writeFailed: false })
      } catch {
        setFlags({ writeFailed: true })
      }
    }
  }

  return {
    async restoreClient() {
      let raw: string | null
      try {
        raw = await store.getItem(key)
      } catch (error) {
        readFailed = true
        setFlags({ readFailed: true })
        throw error
      }
      readFailed = false
      setFlags({ readFailed: false })
      if (raw === null) return undefined
      try {
        return JSON.parse(raw) as PersistedClient
      } catch {
        // Not deleted: kept aside so it can be recovered, and the app starts fresh.
        await store.setItem(`${key}${CORRUPT_SUFFIX}`, raw).catch(() => undefined)
        return undefined
      }
    },

    persistClient(snapshot) {
      if (readFailed || !canWrite()) return Promise.resolve()
      pending = snapshot
      // Writes run one at a time; calls that arrive meanwhile only replace the pending snapshot.
      draining ??= writeLatest().finally(() => {
        draining = undefined
      })
      return draining
    },

    async removeClient() {
      if (readFailed || !canWrite()) return
      try {
        const raw = await store.getItem(key)
        if (raw !== null && holdsQueuedWrites(raw)) {
          await store.setItem(`${key}${DISCARDED_SUFFIX}`, raw)
          setFlags({ queueDiscarded: true })
        }
        await store.removeItem(key)
      } catch {
        setFlags({ writeFailed: true })
      }
    },
  }
}

/** Removes one user's saved cache, queue and the copies kept aside ("Reset app cache", step 5.8). */
export async function deletePersistedCache(userId: string, store: CacheStore = defaultStore()) {
  const key = `${KEY_PREFIX}${userId}`
  for (const k of [key, `${key}${CORRUPT_SUFFIX}`, `${key}${DISCARDED_SUFFIX}`]) {
    await store.removeItem(k).catch(() => undefined)
  }
}
