// Step 4.3: the provider that gives the signed-in user a query client backed by IndexedDB, resumes
// queued writes after the cache is restored, and exposes the pending-write count.
// SPEC-AP-001 F-AP-01, NC-AP-NO-LOST-WRITES (critical); SPEC-AU-001 (one user's cache is not another's).
import 'fake-indexeddb/auto'
import {
  MutationObserver,
  onlineManager,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { persistQueryClientSave } from '@tanstack/react-query-persist-client'
import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, vi } from 'vitest'
import { AuthProvider } from '../core/auth'
import { ToastProvider } from '../core/toast'
import { RequireAuth } from '../core/RequireAuth'
import { SessionContext, type SessionValue } from '../core/session-context'
import { AppDataProvider } from './AppDataProvider'
import { createIdbPersister, deletePersistedCache, resetPersistenceStatus } from './persistence'
import {
  createAppQueryClient,
  defineMutation,
  newRequestId,
  persistOptionsFor,
  registerMutation,
} from './query-client'
import { usePendingWrites, useSyncSummary } from './sync-status'

// The theme follower reads preferences over the network; this file is about the saved cache and queue.
vi.mock('./ThemeSync', () => ({ ThemeSync: () => null }))
vi.mock('../core/supabase.client', async () => (await import('../test/fake-auth')).fakeAuthModule())

// Lets one test make IndexedDB reads fail; every other test uses the real (fake) implementation.
const idb = vi.hoisted(() => ({ failReads: false }))
vi.mock('idb-keyval', async (importOriginal) => {
  const actual = await importOriginal<typeof import('idb-keyval')>()
  return {
    ...actual,
    get: ((...args: Parameters<typeof actual.get>) =>
      idb.failReads
        ? Promise.reject(new Error('IDB read failed'))
        : actual.get(...args)) as typeof actual.get,
  }
})

type Vars = { requestId: string; [field: string]: unknown }
const vars = (extra: Record<string, unknown> = {}): Vars => ({
  requestId: newRequestId(),
  ...extra,
})

let client: QueryClient | undefined
function Probe() {
  const live = useQueryClient()
  useEffect(() => {
    client = live
  }, [live])
  const { waiting, syncing, unresolved } = usePendingWrites()
  const { persistence } = useSyncSummary()
  return (
    <>
      <p data-testid="pending">{`${waiting}/${syncing}`}</p>
      <p data-testid="unresolved">{unresolved}</p>
      <p data-testid="persistence">{persistence}</p>
    </>
  )
}

/** The client the page received, once the probe's effect has run. */
const liveClient = () =>
  vi.waitFor(() => {
    if (!client) throw new Error('the page has no client yet')
    return client
  })

function renderSignedIn() {
  return render(
    <AuthProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<RequireAuth />}>
              <Route element={<AppDataProvider />}>
                <Route path="/" element={<Probe />} />
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthProvider>,
  )
}

const USER = 'test-user' // the id in test/fake-auth.ts
const savedBlob = (userId: string) => createIdbPersister(userId).restoreClient()
const hidePage = () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  client = undefined
  idb.failReads = false
  resetPersistenceStatus()
  onlineManager.setOnline(true)
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  client?.getMutationCache().clear()
  onlineManager.setOnline(true)
  await deletePersistedCache(USER)
  await deletePersistedCache('other-user')
})

/** Saves a cache for `userId` that holds one queued write, the way an earlier visit would have. */
async function seedQueuedWrite(
  userId: string,
  mutationKey: string,
  mutationFn: () => Promise<unknown>,
) {
  const before = createAppQueryClient()
  registerMutation(before, [mutationKey], { mutationFn })
  onlineManager.setOnline(false)
  const variables = vars({ name: 'Milk' })
  void new MutationObserver<unknown, Error, Vars>(before, { mutationKey: [mutationKey] }).mutate(
    variables,
  )
  await vi.waitFor(() => expect(before.getMutationCache().getAll()[0]?.state.isPaused).toBe(true))
  await persistQueryClientSave({
    queryClient: before,
    ...persistOptionsFor(createIdbPersister(userId)),
  })
  onlineManager.setOnline(true)
  return variables
}

describe('defineMutation', () => {
  it('NC-AP-NO-LOST-WRITES: a defined mutation is known to a client made afterwards', async () => {
    const mutationFn = vi.fn(() => Promise.resolve('ok'))
    defineMutation<string, Vars>(['registry-check'], { mutationFn })
    const result = await new MutationObserver<string, Error, Vars>(createAppQueryClient(), {
      mutationKey: ['registry-check'],
    }).mutate(vars())
    expect(result).toBe('ok')
  })
})

describe('AppDataProvider', () => {
  it('F-AP-01: gives the page a query client', async () => {
    renderSignedIn()
    expect(await screen.findByTestId('pending')).toHaveTextContent('0/0')
    expect(await liveClient()).toBeDefined()
  })

  it('NC-AP-NO-LOST-WRITES: a write queued before a reload is run once the saved cache is restored', async () => {
    const mutationFn = vi.fn(() => Promise.resolve('saved'))
    defineMutation(['restored-write'], { mutationFn })
    const variables = await seedQueuedWrite(USER, 'restored-write', mutationFn)
    renderSignedIn()
    await vi.waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1))
    expect(mutationFn.mock.calls.at(0)?.at(0)).toEqual(variables)
  })

  it('NC-AP-NO-LOST-WRITES: a queued write this build cannot run is kept and counted, not run or dropped', async () => {
    await seedQueuedWrite(USER, 'unknown-to-this-build', () => new Promise(() => {}))
    renderSignedIn() // no defineMutation for that key
    await vi.waitFor(() => expect(screen.getByTestId('unresolved')).toHaveTextContent('1'))
    const saved = await savedBlob(USER)
    expect(saved?.clientState.mutations).toHaveLength(1)
  })

  it('F-AP-01: shows how many writes are waiting while offline', async () => {
    renderSignedIn()
    await screen.findByTestId('pending')
    const live = await liveClient()
    await act(async () => {}) // let the provider wire TanStack\'s online state first
    registerMutation(live, ['count-me'], { mutationFn: () => Promise.resolve(1) })
    act(() => onlineManager.setOnline(false))
    act(() => {
      void new MutationObserver<number, Error, Vars>(live, { mutationKey: ['count-me'] }).mutate(
        vars(),
      )
    })
    await vi.waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('1/0'))
  })

  it('NC-AP-NO-LOST-WRITES: a write is saved before it is sent (write-ahead), not on a timer', async () => {
    renderSignedIn()
    await screen.findByTestId('pending')
    const live = await liveClient()
    await vi.waitFor(async () => {
      // wait until the restore finished: before that nothing may be saved
      await act(async () => {})
    })
    let savedBeforeSend = false
    registerMutation(live, ['wal'], {
      mutationFn: async () => {
        savedBeforeSend = ((await savedBlob(USER))?.clientState.mutations.length ?? 0) === 1
        return 'ok'
      },
    })
    await vi.waitFor(async () => {
      await new MutationObserver<string, Error, Vars>(live, { mutationKey: ['wal'] }).mutate(vars())
      expect(savedBeforeSend).toBe(true)
    })
  })

  it('F-AP-01: saves at once when the app is hidden', async () => {
    renderSignedIn()
    await screen.findByTestId('pending')
    const live = await liveClient()
    await live.prefetchQuery({ queryKey: ['flush-me'], queryFn: () => Promise.resolve('data') })
    await vi.waitFor(
      async () => {
        hidePage() // the flush starts only once the saved cache has been restored, so keep hiding
        const keys = (await savedBlob(USER))?.clientState.queries.map((q) => q.queryKey[0])
        expect(keys).toContain('flush-me')
      },
      { timeout: 500 },
    )
  })

  it('NC-AP-NO-LOST-WRITES: a saved queue that cannot be read is left alone: nothing is saved over it', async () => {
    const variables = await seedQueuedWrite(USER, 'unreadable', () => new Promise(() => {}))
    idb.failReads = true
    renderSignedIn()
    await screen.findByTestId('pending')
    await vi.waitFor(() =>
      expect(screen.getByTestId('persistence')).toHaveTextContent('unavailable'),
    )
    const live = await liveClient()
    await live.prefetchQuery({ queryKey: ['new-data'], queryFn: () => Promise.resolve(1) })
    hidePage()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    idb.failReads = false
    const saved = await savedBlob(USER)
    expect(saved?.clientState.mutations.map((m) => (m.state.variables as Vars).requestId)).toEqual([
      variables.requestId,
    ])
    expect(saved?.clientState.queries.map((q) => q.queryKey[0])).not.toContain('new-data')
  })

  it('NC-AP-NO-LOST-WRITES: a window that is not the leader neither saves nor runs queued writes', async () => {
    const mutationFn = vi.fn(() => Promise.resolve('ok'))
    defineMutation(['leader-check'], { mutationFn })
    const variables = await seedQueuedWrite(USER, 'leader-check', mutationFn)
    // Another window holds the lock and never lets go.
    vi.stubGlobal('navigator', {
      ...navigator,
      locks: { request: () => new Promise<void>(() => {}) },
    })
    renderSignedIn()
    await screen.findByTestId('pending')
    const live = await liveClient()
    await live.prefetchQuery({ queryKey: ['not-mine-to-save'], queryFn: () => Promise.resolve(1) })
    hidePage()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(mutationFn).not.toHaveBeenCalled()
    const saved = await savedBlob(USER)
    expect(saved?.clientState.queries.map((q) => q.queryKey[0])).not.toContain('not-mine-to-save')
    expect(saved?.clientState.mutations.map((m) => (m.state.variables as Vars).requestId)).toEqual([
      variables.requestId,
    ])
  })

  it("NC-AU-NO-TOKEN-STORAGE-LEAK: a different signed-in user starts with an empty cache, and the first user's is untouched", async () => {
    const mine = createAppQueryClient()
    await mine.prefetchQuery({
      queryKey: ['private'],
      queryFn: () => Promise.resolve('only for test-user'),
    })
    await persistQueryClientSave({
      queryClient: mine,
      ...persistOptionsFor(createIdbPersister(USER)),
    })

    const value = (id: string): SessionValue =>
      ({
        ready: true,
        status: 'SIGNED_IN',
        session: null,
        user: { id },
        expired: false,
        configError: null,
      }) as unknown as SessionValue
    const view = (id: string) => (
      <SessionContext value={value(id)}>
        <ToastProvider>
          <MemoryRouter>
            <Routes>
              <Route element={<AppDataProvider />}>
                <Route path="/" element={<Probe />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </SessionContext>
    )
    const { rerender } = render(view(USER))
    const first = await liveClient()
    await vi.waitFor(() => expect(first.getQueryData(['private'])).toBe('only for test-user'))
    client = undefined
    rerender(view('other-user'))
    const second = await liveClient()
    expect(second).not.toBe(first)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect(second.getQueryData(['private'])).toBeUndefined()
    const stillThere = await savedBlob(USER)
    expect(stillThere?.clientState.queries.map((q) => q.queryKey[0])).toContain('private')
  })
})
