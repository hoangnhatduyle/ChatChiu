// Step 4.3: query client defaults, retry policy, what is persisted, and the offline write queue that
// survives a reload. SPEC-AP-001 F-AP-01, F-AP-04, NC-AP-NO-LOST-WRITES (critical),
// connectivity_and_queue; SPEC-API-001 idempotency (step 4.3b).
import 'fake-indexeddb/auto'
import { MutationObserver, onlineManager, QueryClient, QueryObserver } from '@tanstack/react-query'
import {
  persistQueryClientRestore,
  persistQueryClientSave,
  type Persister,
} from '@tanstack/react-query-persist-client'
import { afterEach, beforeEach, vi } from 'vitest'
import { createConnectivity } from '../core/connectivity'
import { ApiClientError, networkError, timeoutError } from '../core/errors'
import { createIdbPersister, deletePersistedCache, resetPersistenceStatus } from './persistence'
import {
  CACHE_MAX_AGE_MS,
  CACHE_SCHEMA_VERSION,
  connectOnlineManager,
  createAppQueryClient,
  defineMutation,
  GC_TIME_MS,
  MAX_QUERY_RETRIES,
  newRequestId,
  persistOptionsFor,
  registerMutation,
  adoptQueuedWrites,
  resumeQueuedWrites,
  retryDelay,
  shouldRetry,
  shouldRetryWrite,
} from './query-client'

type Vars = { requestId: string; [field: string]: unknown }
const vars = (extra: Record<string, unknown> = {}): Vars => ({
  requestId: newRequestId(),
  ...extra,
})

const save = (queryClient: QueryClient, persister: Persister) =>
  persistQueryClientSave({ queryClient, ...persistOptionsFor(persister) })
const restore = (queryClient: QueryClient, persister: Persister) =>
  persistQueryClientRestore({ queryClient, ...persistOptionsFor(persister) })
const mutate = (client: QueryClient, key: string, variables: Vars, scope?: string) =>
  new MutationObserver<unknown, Error, Vars>(client, {
    mutationKey: [key],
    ...(scope ? { scope: { id: scope } } : {}),
  }).mutate(variables)
const allMutations = (client: QueryClient) => client.getMutationCache().getAll()

const apiError = (
  status: number,
  code: 'INTERNAL' | 'BAD_REQUEST' | 'RATE_LIMITED',
  retryAfterMs?: number,
) => new ApiClientError({ status, code, message: 'x', retryAfterMs })

beforeEach(() => {
  onlineManager.setOnline(true)
  resetPersistenceStatus()
})
afterEach(async () => {
  vi.useRealTimers()
  onlineManager.setOnline(true)
  await deletePersistedCache('u1')
  await deletePersistedCache('u2')
})

describe('defaults and retry policy', () => {
  it('F-AP-01: queries stay in memory for 24 days (under the browser timer limit) and start stale quickly', () => {
    const client = createAppQueryClient()
    const queries = client.getDefaultOptions().queries
    expect(queries?.gcTime).toBe(GC_TIME_MS)
    expect(client.getDefaultOptions().mutations?.gcTime).toBe(GC_TIME_MS)
    expect(queries?.staleTime).toBe(30_000)
    expect(queries?.refetchOnReconnect).toBe(true)
  })

  it('F-AP-01: gcTime stays under the browser timer limit (2^31-1 ms), or the cache would empty at once', () => {
    expect(GC_TIME_MS).toBeLessThan(2 ** 31 - 1)
    expect(GC_TIME_MS).toBeGreaterThan(7 * 24 * 60 * 60 * 1000)
  })

  it('F-AP-04: a query retries transient failures a limited number of times, other failures not', () => {
    expect(shouldRetry(0, networkError(), MAX_QUERY_RETRIES)).toBe(true)
    expect(shouldRetry(0, timeoutError(), MAX_QUERY_RETRIES)).toBe(true)
    expect(shouldRetry(0, apiError(503, 'INTERNAL'), MAX_QUERY_RETRIES)).toBe(true)
    expect(shouldRetry(MAX_QUERY_RETRIES, networkError(), MAX_QUERY_RETRIES)).toBe(false)
    expect(shouldRetry(0, apiError(400, 'BAD_REQUEST'), MAX_QUERY_RETRIES)).toBe(false)
    expect(shouldRetry(0, apiError(500, 'INTERNAL'), MAX_QUERY_RETRIES)).toBe(false)
    expect(shouldRetry(0, new Error('bug'), MAX_QUERY_RETRIES)).toBe(false)
  })

  it('NC-AP-NO-LOST-WRITES: a write never runs out of retries on a transient failure (a long outage must not drop it)', () => {
    for (const attempt of [0, 5, 50, 5000]) {
      expect(shouldRetryWrite(attempt, networkError())).toBe(true)
      expect(shouldRetryWrite(attempt, apiError(503, 'INTERNAL'))).toBe(true)
      expect(shouldRetryWrite(attempt, apiError(429, 'RATE_LIMITED'))).toBe(true)
    }
    const retry = createAppQueryClient().getDefaultOptions().mutations?.retry
    expect(typeof retry === 'function' && retry(1000, networkError())).toBe(true)
  })

  it('F-AP-04: a write that the server rejected (4xx, a plain 500) is not retried: its hook rolls back and says so', () => {
    for (const error of [
      apiError(400, 'BAD_REQUEST'),
      apiError(500, 'INTERNAL'),
      new Error('bug'),
    ]) {
      expect(shouldRetryWrite(0, error)).toBe(false)
    }
  })

  it('the retry delay grows, is capped, and obeys Retry-After', () => {
    expect(retryDelay(0, networkError())).toBeLessThan(retryDelay(3, networkError()))
    expect(retryDelay(20, networkError())).toBeLessThanOrEqual(30_000)
    expect(retryDelay(5000, networkError())).toBeLessThanOrEqual(30_000)
    expect(retryDelay(0, apiError(429, 'RATE_LIMITED', 12_000))).toBe(12_000)
    expect(retryDelay(0, apiError(429, 'RATE_LIMITED', 999_000))).toBeLessThanOrEqual(60_000)
  })

  it('newRequestId is a valid idempotency key and is unique', () => {
    const a = newRequestId()
    expect(a).toMatch(/^[A-Za-z0-9_-]{1,100}$/)
    expect(newRequestId()).not.toBe(a)
  })
})

describe('persistence options', () => {
  it('NC-AP-NO-LOST-WRITES: the blob is bounded by 30 days and by a schema version, never by deploys', () => {
    const options = persistOptionsFor(createIdbPersister('u1'))
    expect(options.maxAge).toBe(CACHE_MAX_AGE_MS)
    expect(options.buster).toBe(CACHE_SCHEMA_VERSION)
    expect(CACHE_SCHEMA_VERSION).toBe('1')
  })

  it('F-AP-01: a reload while offline still shows the cached data, with no spinner and no request', async () => {
    const persister = createIdbPersister('u1')
    const first = createAppQueryClient()
    await first.prefetchQuery({
      queryKey: ['bootstrap'],
      queryFn: () => Promise.resolve({ items: [1, 2, 3] }),
    })
    await save(first, persister)

    onlineManager.setOnline(false)
    const reloaded = createAppQueryClient()
    await restore(reloaded, persister)
    const queryFn = vi.fn(() => Promise.reject(new Error('must not be called while offline')))
    const result = new QueryObserver(reloaded, {
      queryKey: ['bootstrap'],
      queryFn,
    }).getCurrentResult()
    expect(result.data).toEqual({ items: [1, 2, 3] })
    expect(result.isPending).toBe(false)
    expect(queryFn).not.toHaveBeenCalled()
  })

  it('queries marked meta.persist: false are not saved', async () => {
    const persister = createIdbPersister('u1')
    const client = createAppQueryClient()
    await client.prefetchQuery({ queryKey: ['keep'], queryFn: () => Promise.resolve(1) })
    await client.prefetchQuery({
      queryKey: ['skip'],
      queryFn: () => Promise.resolve(2),
      meta: { persist: false },
    })
    await save(client, persister)
    const reloaded = createAppQueryClient()
    await restore(reloaded, persister)
    expect(reloaded.getQueryData(['keep'])).toBe(1)
    expect(reloaded.getQueryData(['skip'])).toBeUndefined()
  })

  it("NC-AU-NO-TOKEN-STORAGE-LEAK: one user's cache is never shown to another (separate keys)", async () => {
    const one = createAppQueryClient()
    await one.prefetchQuery({
      queryKey: ['bootstrap'],
      queryFn: () => Promise.resolve('private to u1'),
    })
    await save(one, createIdbPersister('u1'))
    const two = createAppQueryClient()
    await restore(two, createIdbPersister('u2'))
    expect(two.getQueryData(['bootstrap'])).toBeUndefined()
  })
})

describe('the offline write queue (NC-AP-NO-LOST-WRITES)', () => {
  it('a write made offline is persisted, survives a reload, and is sent once when back online', async () => {
    const persister = createIdbPersister('u1')
    const sent: unknown[] = []
    const mutationFn = vi.fn((v: Vars) => {
      sent.push(v)
      return Promise.resolve({ id: 1 })
    })
    const first = createAppQueryClient()
    registerMutation(first, ['addItem'], { mutationFn })
    onlineManager.setOnline(false)
    const variables = vars({ name: 'Milk' })
    void mutate(first, 'addItem', variables)
    await vi.waitFor(() => expect(allMutations(first)[0]?.state.isPaused).toBe(true))
    expect(mutationFn).not.toHaveBeenCalled()
    await save(first, persister)

    const reloaded = createAppQueryClient()
    registerMutation(reloaded, ['addItem'], { mutationFn })
    await restore(reloaded, persister)
    expect(allMutations(reloaded)).toHaveLength(1)
    expect(allMutations(reloaded)[0]?.state.variables).toEqual(variables)

    onlineManager.setOnline(true)
    expect(resumeQueuedWrites(reloaded)).toEqual({ resumed: 1, unresolved: 0 })
    await vi.waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1))
    expect(sent).toEqual([variables]) // the same requestId: the idempotency key
  })

  it('a write that was in flight when the app closed is saved and sent again after the reload', async () => {
    const persister = createIdbPersister('u1')
    const first = createAppQueryClient()
    registerMutation(first, ['slow'], { mutationFn: () => new Promise(() => {}) }) // never answers
    const variables = vars({ n: 1 })
    void mutate(first, 'slow', variables)
    await vi.waitFor(() => expect(allMutations(first)).toHaveLength(1))
    await save(first, persister)

    const mutationFn = vi.fn(() => Promise.resolve('ok'))
    const reloaded = createAppQueryClient()
    registerMutation(reloaded, ['slow'], { mutationFn })
    await restore(reloaded, persister)
    expect(resumeQueuedWrites(reloaded)).toEqual({ resumed: 1, unresolved: 0 })
    await vi.waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1))
    expect(mutationFn.mock.calls.at(0)?.at(0)).toEqual(variables)
  })

  it('a write that finished is not saved again', async () => {
    const persister = createIdbPersister('u1')
    const client = createAppQueryClient()
    registerMutation(client, ['done'], { mutationFn: () => Promise.resolve('ok') })
    await mutate(client, 'done', vars())
    await save(client, persister)
    const reloaded = createAppQueryClient()
    await restore(reloaded, persister)
    expect(allMutations(reloaded)).toHaveLength(0)
  })

  it('a restored write with no registered mutationFn is kept and reported, never run or dropped', async () => {
    const persister = createIdbPersister('u1')
    const first = createAppQueryClient()
    registerMutation(first, ['orphan'], { mutationFn: () => new Promise(() => {}) })
    void mutate(first, 'orphan', vars())
    await vi.waitFor(() => expect(allMutations(first)).toHaveLength(1))
    await save(first, persister)

    const reloaded = createAppQueryClient() // this build does not know 'orphan'
    await restore(reloaded, persister)
    expect(resumeQueuedWrites(reloaded)).toEqual({ resumed: 0, unresolved: 1 })
    expect(allMutations(reloaded)).toHaveLength(1)
    expect(allMutations(reloaded)[0]?.state.status).toBe('pending')
  })

  it('queued writes to the same resource replay one at a time, in the order they were made', async () => {
    const persister = createIdbPersister('u1')
    const events: string[] = []
    const mutationFn = vi.fn(async (v: Vars) => {
      const step = String(v.step)
      events.push(`start ${step}`)
      // The first one is the slowest: with no ordering the others would finish before it.
      await new Promise((resolve) => setTimeout(resolve, step === 'one' ? 30 : 1))
      events.push(`end ${step}`)
    })
    const first = createAppQueryClient()
    registerMutation(first, ['useItem'], { mutationFn })
    onlineManager.setOnline(false)
    for (const step of ['one', 'two', 'three'])
      void mutate(first, 'useItem', vars({ step }), 'item:7')
    await vi.waitFor(() => expect(allMutations(first).every((m) => m.state.isPaused)).toBe(true))
    await save(first, persister)

    const reloaded = createAppQueryClient()
    registerMutation(reloaded, ['useItem'], { mutationFn })
    await restore(reloaded, persister)
    onlineManager.setOnline(true)
    resumeQueuedWrites(reloaded)
    await vi.waitFor(() => expect(events).toHaveLength(6))
    expect(events).toEqual([
      'start one',
      'end one',
      'start two',
      'end two',
      'start three',
      'end three',
    ])
  })

  it('write-ahead: a write is saved before it is sent, so closing the tab at once cannot lose it', async () => {
    const persister = createIdbPersister('u1')
    let savedBeforeSend = false
    const client = createAppQueryClient({
      beforeSend: async () => {
        await save(client, persister)
      },
    })
    registerMutation(client, ['wal'], {
      mutationFn: async () => {
        const saved = await persister.restoreClient()
        savedBeforeSend = (saved?.clientState.mutations.length ?? 0) === 1
        return 'ok'
      },
    })
    await mutate(client, 'wal', vars())
    expect(savedBeforeSend).toBe(true)
  })

  it('write-ahead: a save that fails never blocks the write', async () => {
    const client = createAppQueryClient({
      beforeSend: () => Promise.reject(new Error('IDB blocked')),
    })
    registerMutation(client, ['wal2'], { mutationFn: () => Promise.resolve('ok') })
    await expect(mutate(client, 'wal2', vars())).resolves.toBe('ok')
  })

  it('F-AP-04: a write the server rejects is not retried, and is left as an error (its hook rolls back)', async () => {
    const client = createAppQueryClient()
    const mutationFn = vi.fn(() => Promise.reject(apiError(400, 'BAD_REQUEST')))
    registerMutation(client, ['bad'], { mutationFn })
    await expect(mutate(client, 'bad', vars())).rejects.toBeInstanceOf(ApiClientError)
    expect(mutationFn).toHaveBeenCalledTimes(1)
    const [failed] = allMutations(client)
    expect(failed?.state.status).toBe('error')
    expect(failed?.state.isPaused).toBe(false)
  })

  it('F-AP-01: a write that fails because the connection dropped mid-retry pauses, then continues when back online', async () => {
    vi.useFakeTimers()
    const client = createAppQueryClient()
    client.mount() // the provider does this in the app: it resumes paused writes when we come back online
    const mutationFn = vi
      .fn<(v: Vars) => Promise<string>>()
      .mockRejectedValueOnce(networkError())
      .mockResolvedValue('ok')
    registerMutation(client, ['flaky'], { mutationFn })
    void mutate(client, 'flaky', vars())
    await vi.advanceTimersByTimeAsync(0) // first attempt fails, the retry delay starts
    expect(mutationFn).toHaveBeenCalledTimes(1)
    onlineManager.setOnline(false) // the connection is now known to be gone
    await vi.advanceTimersByTimeAsync(35_000) // the delay ends
    expect(allMutations(client)[0]?.state.isPaused).toBe(true)
    expect(mutationFn).toHaveBeenCalledTimes(1)
    onlineManager.setOnline(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(mutationFn).toHaveBeenCalledTimes(2)
    expect(allMutations(client)[0]?.state.status).toBe('success')
    client.unmount()
  })
})

describe('adoptQueuedWrites (a window that becomes the leader)', () => {
  it('NC-AP-NO-LOST-WRITES: takes up writes the previous leader saved, and never duplicates one it already has', async () => {
    const persister = createIdbPersister('u1')
    const previousLeader = createAppQueryClient()
    registerMutation(previousLeader, ['adopt'], { mutationFn: () => new Promise(() => {}) })
    const theirs = vars({ from: 'previous leader' })
    void mutate(previousLeader, 'adopt', theirs)
    await vi.waitFor(() => expect(allMutations(previousLeader)).toHaveLength(1))
    await save(previousLeader, persister)

    const mutationFn = vi.fn(() => Promise.resolve('ok'))
    const me = createAppQueryClient()
    registerMutation(me, ['adopt'], { mutationFn })
    onlineManager.setOnline(false)
    const mine = vars({ from: 'me' })
    void mutate(me, 'adopt', mine)
    await vi.waitFor(() => expect(allMutations(me)).toHaveLength(1))

    await adoptQueuedWrites(me, persister)
    await adoptQueuedWrites(me, persister) // asking twice changes nothing
    expect(
      allMutations(me)
        .map((m) => (m.state.variables as Vars).requestId)
        .sort(),
    ).toEqual([theirs.requestId, mine.requestId].sort())
  })

  it('does nothing when nothing is saved, or the saved cache cannot be read', async () => {
    const me = createAppQueryClient()
    await adoptQueuedWrites(me, createIdbPersister('u2'))
    const unreadable = createIdbPersister('u2', {
      store: {
        getItem: () => Promise.reject(new Error('IDB read failed')),
        setItem: () => Promise.resolve(),
        removeItem: () => Promise.resolve(),
      },
    })
    await expect(adoptQueuedWrites(me, unreadable)).resolves.toBeUndefined()
    expect(allMutations(me)).toHaveLength(0)
  })
})

describe('defineMutation', () => {
  it('NC-AP-NO-LOST-WRITES: every new client already knows every defined mutation, so a restored write can run', async () => {
    const mutationFn = vi.fn(() => Promise.resolve('ok'))
    defineMutation<string, Vars>(['registry-check'], { mutationFn })
    await expect(mutate(createAppQueryClient(), 'registry-check', vars())).resolves.toBe('ok')
    expect(mutationFn).toHaveBeenCalledTimes(1)
  })

  it('defining a key again replaces it (hot reload) instead of piling up', async () => {
    const first = vi.fn(() => Promise.resolve('first'))
    const second = vi.fn(() => Promise.resolve('second'))
    defineMutation(['replace-me'], { mutationFn: first })
    defineMutation(['replace-me'], { mutationFn: second })
    await expect(mutate(createAppQueryClient(), 'replace-me', vars())).resolves.toBe('second')
    expect(first).not.toHaveBeenCalled()
  })
})

describe('connectOnlineManager', () => {
  const connectivityFor = (initiallyOnline = true) =>
    createConnectivity({
      probe: () => Promise.resolve(true),
      isOnline: () => initiallyOnline,
      windowTarget: new EventTarget(),
      documentTarget: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
    })

  it('F-AP-01: TanStack goes offline when the API is unreachable, and back when it is reachable again', () => {
    const connectivity = connectivityFor()
    const stop = connectOnlineManager(connectivity)
    expect(onlineManager.isOnline()).toBe(true)
    connectivity.reportFailure()
    expect(onlineManager.isOnline()).toBe(false)
    connectivity.reportReachable()
    expect(onlineManager.isOnline()).toBe(true)
    stop()
    connectivity.dispose()
  })

  it('F-AP-01: an app that starts offline starts TanStack offline', () => {
    const connectivity = connectivityFor(false)
    const stop = connectOnlineManager(connectivity)
    expect(onlineManager.isOnline()).toBe(false)
    stop()
    connectivity.dispose()
  })

  it('after stop() connectivity no longer drives TanStack, and TanStack is left online', () => {
    const connectivity = connectivityFor()
    const stop = connectOnlineManager(connectivity)
    connectivity.reportFailure()
    expect(onlineManager.isOnline()).toBe(false)
    stop()
    expect(onlineManager.isOnline()).toBe(true)
    connectivity.reportFailure()
    expect(onlineManager.isOnline()).toBe(true)
    connectivity.dispose()
  })
})

describe('createAppQueryClient', () => {
  it('returns independent clients', () => {
    expect(createAppQueryClient()).not.toBe(createAppQueryClient())
    expect(createAppQueryClient()).toBeInstanceOf(QueryClient)
  })
})
