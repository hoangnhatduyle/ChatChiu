// The query client: cache times, retry policy, what is persisted, and the hook-up to connectivity
// (step 4.3). Server state lives only here (CS-STATE-HOMES); data/<domain>.ts modules (4.4) add the
// useXxxQuery / useXxxMutation hooks on top.
//
// How the offline queue works (SPEC-AP-001 connectivity_and_queue, NC-AP-NO-LOST-WRITES):
//  - while the API is unreachable TanStack pauses every mutation;
//  - every write that is pending (paused, waiting to retry, or in flight) is saved with the cache,
//    and a write is saved *before* it is sent (beforeSend), so closing the tab cannot lose it;
//  - after a reload resumeQueuedWrites runs them again, in order per `scope.id`;
//  - each write carries a `requestId` in its variables (newRequestId), sent as `Idempotency-Key` on every
//    attempt so the server can recognise a repeat (server side: roadmap step 4.3b). Resending after an
//    unknown outcome relies on that, so a write hook must not be used before 4.3b lands;
//  - a transient failure never uses up a write's retries (a long outage must not drop it); only a
//    failure the server decided (4xx, a plain 500) ends it, and its hook then rolls back and says so;
//  - TanStack drains the queue only while the tab is visible (its retries are focus-gated).
import {
  defaultShouldDehydrateQuery,
  hydrate,
  onlineManager,
  QueryClient,
  type MutationKey,
  type MutationOptions,
} from '@tanstack/react-query'
import type { PersistQueryClientOptions, Persister } from '@tanstack/react-query-persist-client'
import { ApiClientError, isTransient } from '../core/errors'
import type { Connectivity } from '../core/connectivity'

const DAY_MS = 24 * 60 * 60 * 1000
/**
 * How long a device may sit unused and still open with its saved cache and queued writes. Beyond it the
 * saved cache is dropped, queue included, so keep it long.
 */
export const CACHE_MAX_AGE_MS = 30 * DAY_MS
/**
 * How long an unused query or finished mutation stays in memory (and so in what is saved). Timers
 * cannot be longer than 2^31-1 ms (about 24.8 days): a longer gcTime fires at once and empties the
 * cache, so this stays below that limit.
 */
export const GC_TIME_MS = 24 * DAY_MS
/**
 * Bump only when the shape of the saved cache changes: a different value discards the whole saved cache,
 * and with it any queued writes. It must never follow deploys.
 */
export const CACHE_SCHEMA_VERSION = '1'
/** Cached data younger than this is shown without a request on mount or focus. */
export const QUERY_STALE_MS = 30_000
export const MAX_QUERY_RETRIES = 2
const RETRY_BASE_MS = 1_000
const RETRY_CAP_MS = 30_000
const RETRY_AFTER_CAP_MS = 60_000
const RETRY_JITTER = 0.25

/** Retry a failure only if it is transient (offline, timeout, gateway, rate limit) and attempts remain. */
export function shouldRetry(failureCount: number, error: unknown, max: number): boolean {
  return failureCount < max && isTransient(error)
}

/**
 * A write is retried for as long as the failure is transient, however long that takes: running out of
 * retries during an outage would drop it. (Backoff is capped, and TanStack pauses it while offline.)
 */
export function shouldRetryWrite(_failureCount: number, error: unknown): boolean {
  return isTransient(error)
}

/** Exponential backoff with a little jitter, capped; a server's Retry-After wins (up to a minute). */
export function retryDelay(attemptIndex: number, error: unknown): number {
  if (error instanceof ApiClientError && error.retryAfterMs !== undefined) {
    return Math.min(error.retryAfterMs, RETRY_AFTER_CAP_MS)
  }
  const backoff = RETRY_BASE_MS * 2 ** attemptIndex * (1 + Math.random() * RETRY_JITTER)
  return Math.min(backoff, RETRY_CAP_MS)
}

type Variables = { requestId: string }
type Options<TData, TVariables, TContext> = Omit<
  MutationOptions<TData, Error, TVariables, TContext>,
  'mutationKey'
>

/**
 * Registers what a mutation does by key on one client, so a paused write restored after a reload can
 * run (TanStack cannot resume a restored write that has no mutationFn). `TVariables` must carry a
 * `requestId`: the idempotency key that makes a retry safe.
 */
export function registerMutation<TData, TVariables extends Variables, TContext = unknown>(
  client: QueryClient,
  key: MutationKey,
  options: Options<TData, TVariables, TContext>,
): void {
  const { mutationFn } = options
  client.setMutationDefaults<TData, Error, TVariables, TContext>(key, {
    ...options,
    // Write-ahead save, at the start of the request and not in a cache-wide onMutate: TanStack awaits
    // that one before the mutation's own onMutate, which would delay the optimistic cache update behind
    // an IndexedDB write (d5533bc0: the cache is written synchronously, before any await).
    ...(mutationFn
      ? {
          mutationFn: async (variables: TVariables, context: Parameters<typeof mutationFn>[1]) => {
            // A keepalive request (the page is being hidden) goes out at once: an IndexedDB save first
            // could outlive the page. Its undo context is already in the variables.
            if (!(variables as { keepalive?: boolean }).keepalive) await runBeforeSend(client)
            return mutationFn(variables, context)
          },
        }
      : {}),
  })
}

const beforeSendByClient = new WeakMap<QueryClient, () => Promise<void> | void>()

async function runBeforeSend(client: QueryClient): Promise<void> {
  try {
    await beforeSendByClient.get(client)?.()
  } catch {
    // The write still goes ahead; a failing save shows in the persistence status.
  }
}

const definitions = new Map<string, (client: QueryClient) => void>()

/**
 * Declares what a mutation does, once, at import time. Every client made by createAppQueryClient then
 * knows it. Every data module that has mutations must load at app start, not with a lazy route (step 4.4
 * imports them all from one place): a client made earlier does not learn a later definition. Defining
 * a key again replaces it.
 */
export function defineMutation<TData, TVariables extends Variables, TContext = unknown>(
  key: MutationKey,
  options: Options<TData, TVariables, TContext>,
): void {
  definitions.set(JSON.stringify(key), (client) => registerMutation(client, key, options))
}

export type AppQueryClientOptions = {
  /** Awaited at the start of every write's request, before it is sent: saves it (write-ahead). A failure never blocks the write. */
  beforeSend?: () => Promise<void> | void
}

export function createAppQueryClient({ beforeSend }: AppQueryClientOptions = {}): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_MS,
        gcTime: GC_TIME_MS,
        retry: (count, error) => shouldRetry(count, error, MAX_QUERY_RETRIES),
        retryDelay,
        refetchOnReconnect: true,
        refetchOnWindowFocus: true,
      },
      mutations: {
        gcTime: GC_TIME_MS,
        retry: shouldRetryWrite,
        retryDelay,
      },
    },
  })
  if (beforeSend) beforeSendByClient.set(client, beforeSend)
  for (const apply of definitions.values()) apply(client)
  return client
}

/**
 * Drops the restored writes this build cannot run (their mutationFn is not defined here), after she chose to.
 * Returns how many went. Writes this build can run are never touched.
 */
export function discardUnsendableWrites(client: QueryClient): number {
  const cache = client.getMutationCache()
  const unsendable = cache
    .getAll()
    .filter((m) => m.state.status === 'pending' && !m.options.mutationFn)
  for (const mutation of unsendable) cache.remove(mutation)
  return unsendable.length
}

/**
 * Runs the writes a restored cache holds (paused, waiting to retry, or in flight when the app closed).
 * TanStack's own resumePausedMutations only picks up paused ones. A write whose mutationFn this build
 * does not define stays in the cache untouched and is counted as unresolved, never run or dropped.
 */
export function resumeQueuedWrites(client: QueryClient): { resumed: number; unresolved: number } {
  let resumed = 0
  let unresolved = 0
  for (const mutation of client.getMutationCache().getAll()) {
    if (mutation.state.status !== 'pending') continue
    if (!mutation.options.mutationFn) {
      unresolved += 1
      continue
    }
    resumed += 1
    void mutation.continue().catch(() => undefined) // a failure is the write hook's to report
  }
  return { resumed, unresolved }
}

/** A fresh idempotency key for one logical write; keep it in the mutation variables so replays reuse it. */
export function newRequestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // Insecure contexts have no randomUUID; this is still a 128-bit random id.
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * A window that has just become the leader takes up writes another window saved that it does not have
 * yet (matched by requestId), so none is missed and none is run twice. A saved cache that cannot be
 * read changes nothing (the persistence status already says so).
 */
export async function adoptQueuedWrites(client: QueryClient, persister: Persister): Promise<void> {
  let saved: Awaited<ReturnType<Persister['restoreClient']>>
  try {
    saved = await persister.restoreClient()
  } catch {
    return
  }
  if (!saved) return
  const idOf = (variables: unknown): string | undefined => {
    const id = (variables as { requestId?: unknown } | undefined)?.requestId
    return typeof id === 'string' ? id : undefined
  }
  const known = new Set(
    client
      .getMutationCache()
      .getAll()
      .map((m) => idOf(m.state.variables)),
  )
  const fresh = saved.clientState.mutations.filter((m) => {
    const id = idOf(m.state.variables)
    return id !== undefined && !known.has(id)
  })
  if (fresh.length > 0) hydrate(client, { mutations: fresh, queries: [] })
}

/** What gets saved: successful queries (not those marked `meta.persist: false`) and every pending write. */
export function persistOptionsFor(
  persister: Persister,
): Omit<PersistQueryClientOptions, 'queryClient'> {
  return {
    persister,
    maxAge: CACHE_MAX_AGE_MS,
    buster: CACHE_SCHEMA_VERSION,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) =>
        defaultShouldDehydrateQuery(query) && query.meta?.persist !== false,
      // Every write that has not finished, not only the paused ones: one waiting to retry or in flight
      // when the app closes would otherwise vanish. Safe to run again because of the idempotency key.
      shouldDehydrateMutation: (mutation) =>
        mutation.meta?.persist !== false &&
        (mutation.state.status === 'pending' ||
          // A refused write waits for Retry or Discard, and must still be there after a reload.
          (mutation.state.status === 'error' && mutation.meta?.writeKey !== undefined)),
    },
  }
}

/** Makes TanStack's online state follow our own reachability (a failed request, a probe), not just the browser's. */
export function connectOnlineManager(connectivity: Connectivity): () => void {
  onlineManager.setEventListener((setOnline) => {
    setOnline(connectivity.isOnline())
    return connectivity.subscribe(() => setOnline(connectivity.isOnline()))
  })
  return () => {
    // Back to TanStack's own behaviour (the browser's online/offline events), and not left stuck offline.
    onlineManager.setEventListener((setOnline) => {
      const goOnline = () => setOnline(true)
      const goOffline = () => setOnline(false)
      window.addEventListener('online', goOnline)
      window.addEventListener('offline', goOffline)
      return () => {
        window.removeEventListener('online', goOnline)
        window.removeEventListener('offline', goOffline)
      }
    })
    onlineManager.setOnline(true)
  }
}
