// The saved cache and write queue (SPEC-AP-001 NC-AP-NO-LOST-WRITES, critical): it must never be
// erased because a read failed, never be deleted without a copy, and never be written by two writers.
import 'fake-indexeddb/auto'
import type { PersistedClient } from '@tanstack/react-query-persist-client'
import { beforeEach, vi } from 'vitest'
import {
  acknowledgeQueueDiscarded,
  createIdbPersister,
  deletePersistedCache,
  getPersistenceStatus,
  resetPersistenceStatus,
  type CacheStore,
} from './persistence'

const client = (mutations: unknown[] = [], queries: unknown[] = []): PersistedClient =>
  ({
    timestamp: Date.now(),
    buster: '1',
    clientState: { mutations, queries },
  }) as unknown as PersistedClient

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  const store: CacheStore & { data: Map<string, string> } = {
    data,
    getItem: (key) => Promise.resolve(data.get(key) ?? null),
    setItem: (key, value) => Promise.resolve(void data.set(key, value)),
    removeItem: (key) => Promise.resolve(void data.delete(key)),
  }
  return store
}

beforeEach(() => resetPersistenceStatus())

describe('restore', () => {
  it('F-AP-01: returns the saved client, and undefined when there is none', async () => {
    const store = memoryStore()
    const persister = createIdbPersister('u', { store })
    await expect(persister.restoreClient()).resolves.toBeUndefined()
    await persister.persistClient(client([{ a: 1 }]))
    expect((await persister.restoreClient())?.clientState.mutations).toEqual([{ a: 1 }])
  })

  it('NC-AP-NO-LOST-WRITES: a read that fails throws (it is not "nothing saved") and marks offline mode unavailable', async () => {
    const store = { ...memoryStore(), getItem: () => Promise.reject(new Error('IDB read failed')) }
    const persister = createIdbPersister('u', { store })
    await expect(persister.restoreClient()).rejects.toThrow('IDB read failed')
    expect(getPersistenceStatus()).toBe('unavailable')
  })

  it('NC-AP-NO-LOST-WRITES: after a failed read nothing is written or removed, so the saved queue stays intact', async () => {
    const store = memoryStore({ 'cache:u': JSON.stringify(client([{ queued: true }])) })
    const failing = { ...store, getItem: () => Promise.reject(new Error('IDB read failed')) }
    const persister = createIdbPersister('u', { store: failing })
    await Promise.resolve(persister.restoreClient()).catch(() => undefined)
    await persister.persistClient(client()) // an empty cache must not replace the unread one
    await persister.removeClient()
    expect(JSON.parse(store.data.get('cache:u') ?? 'null').clientState.mutations).toEqual([
      { queued: true },
    ])
  })

  it('NC-AP-NO-LOST-WRITES: a saved blob that cannot be parsed is kept aside, not deleted, and the app starts fresh', async () => {
    const store = memoryStore({ 'cache:u': '{not json' })
    const persister = createIdbPersister('u', { store })
    await expect(persister.restoreClient()).resolves.toBeUndefined()
    expect(store.data.get('cache:u:corrupt')).toBe('{not json')
  })
})

describe('7.0.39: what she is told', () => {
  it('(a) the discarded-queue notice can be acknowledged, and a later discard brings it back', async () => {
    const blob = JSON.stringify(client([{ requestId: 'r1' }]))
    const persister = createIdbPersister('u', { store: memoryStore({ 'cache:u': blob }) })
    await persister.restoreClient()
    await persister.removeClient()
    expect(getPersistenceStatus()).toBe('queue-discarded')
    acknowledgeQueueDiscarded()
    expect(getPersistenceStatus()).toBe('ok')
  })

  it('(b) a failed write-ahead save makes the status unavailable instead of failing silently', async () => {
    const store = memoryStore()
    store.setItem = () => Promise.reject(new Error('quota'))
    const persister = createIdbPersister('u', { store })
    await persister.restoreClient()
    await persister.persistClient(client([{ requestId: 'r1' }]))
    expect(getPersistenceStatus()).toBe('unavailable')
  })

  it('(b) an unreadable blob whose copy could not be kept is reported as a discarded queue', async () => {
    const store = memoryStore({ 'cache:u': '{not json' })
    store.setItem = () => Promise.reject(new Error('quota'))
    const persister = createIdbPersister('u', { store })
    await expect(persister.restoreClient()).resolves.toBeUndefined()
    expect(getPersistenceStatus()).toBe('queue-discarded')
  })
})

describe('removeClient (the library calls it for an expired, mismatched or unreadable blob)', () => {
  it('NC-AP-NO-LOST-WRITES: a blob that holds queued writes is copied aside first, and the loss is reported', async () => {
    const blob = JSON.stringify(client([{ requestId: 'r1' }]))
    const store = memoryStore({ 'cache:u': blob })
    const persister = createIdbPersister('u', { store })
    await persister.restoreClient()
    await persister.removeClient()
    expect(store.data.has('cache:u')).toBe(false)
    expect(store.data.get('cache:u:discarded')).toBe(blob)
    expect(getPersistenceStatus()).toBe('queue-discarded')
  })

  it('removing a blob with no queued writes is quiet', async () => {
    const store = memoryStore({ 'cache:u': JSON.stringify(client([], [{ q: 1 }])) })
    const persister = createIdbPersister('u', { store })
    await persister.restoreClient()
    await persister.removeClient()
    expect(store.data.has('cache:u')).toBe(false)
    expect(store.data.has('cache:u:discarded')).toBe(false)
    expect(getPersistenceStatus()).toBe('ok')
  })
})

describe('persist', () => {
  it('F-AP-01: writes at once, with no throttle delay', async () => {
    const store = memoryStore()
    await createIdbPersister('u', { store }).persistClient(client([{ n: 1 }]))
    expect(store.data.has('cache:u')).toBe(true)
  })

  it('writes never overlap, and the latest snapshot always wins', async () => {
    const written: string[] = []
    let inFlight = 0
    let maxInFlight = 0
    const store = {
      ...memoryStore(),
      setItem: async (_key: string, value: string) => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 5))
        written.push(value)
        inFlight -= 1
      },
    }
    const persister = createIdbPersister('u', { store })
    await Promise.all([1, 2, 3, 4, 5].map((n) => persister.persistClient(client([{ n }]))))
    expect(maxInFlight).toBe(1)
    expect(JSON.parse(written.at(-1) ?? 'null').clientState.mutations).toEqual([{ n: 5 }])
  })

  it('F-AP-01: a failed write marks offline mode unavailable, and a later good write clears it', async () => {
    let fail = true
    const store = {
      ...memoryStore(),
      setItem: () => (fail ? Promise.reject(new Error('quota')) : Promise.resolve()),
    }
    const persister = createIdbPersister('u', { store })
    await persister.persistClient(client())
    expect(getPersistenceStatus()).toBe('unavailable')
    fail = false
    await persister.persistClient(client())
    expect(getPersistenceStatus()).toBe('ok')
  })

  it('a second window that is not the leader does not write', async () => {
    const store = memoryStore()
    const persister = createIdbPersister('u', { store, canWrite: () => false })
    await persister.persistClient(client([{ n: 1 }]))
    expect(store.data.has('cache:u')).toBe(false)
  })
})

describe('deletePersistedCache', () => {
  it('removes the cache and the copies kept aside', async () => {
    const store = memoryStore({
      'cache:u': 'a',
      'cache:u:corrupt': 'b',
      'cache:u:discarded': 'c',
      'cache:v': 'keep',
    })
    await deletePersistedCache('u', store)
    expect([...store.data.keys()]).toEqual(['cache:v'])
  })
})

describe('real IndexedDB (fake)', () => {
  it('round-trips through idb-keyval', async () => {
    const persister = createIdbPersister('real')
    await persister.persistClient(client([{ ok: true }]))
    expect((await persister.restoreClient())?.clientState.mutations).toEqual([{ ok: true }])
    await deletePersistedCache('real')
    await expect(createIdbPersister('real').restoreClient()).resolves.toBeUndefined()
    vi.restoreAllMocks()
  })
})
