// The write pattern, once (SPEC-AP-001 F-AP-04, AR-WRITE-PATTERN; SPEC-KB-001 board_usage_change,
// SPEC-QP-001 commit_now_action): the cache is updated first, synchronously; the server's row replaces
// it on success; a failure rolls it back and is kept for Retry; offline the write is queued and, after a
// reload, sent once with the same idempotency key. Uses a tiny fake "todos" resource.
import 'fake-indexeddb/auto'
import { onlineManager, QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from '@tanstack/react-query-persist-client'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, vi } from 'vitest'
import { ApiClientError, networkError } from '../core/errors'
import { createIdbPersister, deletePersistedCache, resetPersistenceStatus } from './persistence'
import { createAppQueryClient, persistOptionsFor, resumeQueuedWrites } from './query-client'
import {
  defineWrite,
  dismissFailedWrite,
  retryFailedWrite,
  startWrite,
  useFailedWrites,
  useWrite,
} from './write'

type Todo = { id: number; title: string; done: boolean }
const KEY = ['todos']
const read = (client: QueryClient) => client.getQueryData<Todo[]>(KEY) ?? []

const serverCalls: Array<{ op: string; input: unknown; requestId: string }> = []
const behaviour = { fail: null as unknown, failTimes: 0 }
function fakeServer<T>(op: string, input: unknown, requestId: string, result: T): Promise<T> {
  serverCalls.push({ op, input, requestId })
  if (behaviour.fail && behaviour.failTimes > 0) {
    behaviour.failTimes -= 1
    return Promise.reject(behaviour.fail)
  }
  return Promise.resolve(result)
}

// Complete: optimistic row with a temporary id, replaced by the server's row.
const addTodo = defineWrite<{ title: string; tempId: number }, Todo, { tempId: number }>({
  key: 'test/add-todo',
  label: 'Add a to-do',
  request: (input, requestId) =>
    fakeServer('add', input, requestId, {
      id: 100 + serverCalls.length,
      title: input.title,
      done: false,
    }),
  apply: (client, { title, tempId }) => {
    client.setQueryData<Todo[]>(KEY, (old = []) => [...old, { id: tempId, title, done: false }])
    return { tempId }
  },
  reconcile: (client, saved, { tempId }) =>
    client.setQueryData<Todo[]>(KEY, (old = []) => old.map((t) => (t.id === tempId ? saved : t))),
  rollback: (client, { tempId }) =>
    client.setQueryData<Todo[]>(KEY, (old = []) => old.filter((t) => t.id !== tempId)),
})

const toggleTodo = defineWrite<{ id: number }, Todo, { id: number; was: boolean }>({
  key: 'test/toggle-todo',
  label: 'Tick a to-do',
  scope: ({ id }) => `todo:${id}`,
  request: ({ id }, requestId) =>
    fakeServer('toggle', { id }, requestId, { id, title: 't', done: true }),
  apply: (client, { id }) => {
    let was = false
    client.setQueryData<Todo[]>(KEY, (old = []) =>
      old.map((t) => {
        if (t.id !== id) return t
        was = t.done
        return { ...t, done: !t.done }
      }),
    )
    return { id, was }
  },
  rollback: (client, { id, was }) =>
    client.setQueryData<Todo[]>(KEY, (old = []) =>
      old.map((t) => (t.id === id ? { ...t, done: was } : t)),
    ),
})

let client: QueryClient
beforeEach(() => {
  serverCalls.length = 0
  behaviour.fail = null
  behaviour.failTimes = 0
  onlineManager.setOnline(true)
  resetPersistenceStatus()
  client = createAppQueryClient()
  client.mount()
})
afterEach(async () => {
  client.unmount()
  onlineManager.setOnline(true)
  vi.useRealTimers()
  await deletePersistedCache('w1')
})

describe('the write pattern', () => {
  it('F-AP-04: updates the cache first, synchronously, before anything is sent (d5533bc0)', () => {
    client.setQueryData<Todo[]>(KEY, [])
    startWrite(client, addTodo, { title: 'Milk', tempId: -1 })
    // no await: the cache already shows the change
    expect(read(client)).toEqual([{ id: -1, title: 'Milk', done: false }])
    expect(serverCalls).toHaveLength(0)
  })

  it('F-AP-04: on success the server row replaces the optimistic one (no list refetch)', async () => {
    client.setQueryData<Todo[]>(KEY, [])
    const refetch = vi.spyOn(client, 'invalidateQueries')
    const handle = startWrite(client, addTodo, { title: 'Milk', tempId: -1 })
    const result = await handle.result
    expect(result).toMatchObject({ status: 'saved', data: { title: 'Milk' } })
    expect(read(client)).toHaveLength(1)
    expect(read(client)[0]?.id).toBeGreaterThan(0)
    expect(refetch).not.toHaveBeenCalled()
  })

  it('F-AP-04: sends one idempotency key per write, and a different one for the next write', async () => {
    client.setQueryData<Todo[]>(KEY, [])
    await startWrite(client, addTodo, { title: 'A', tempId: -1 }).result
    await startWrite(client, addTodo, { title: 'B', tempId: -2 }).result
    expect(serverCalls[0]?.requestId).toMatch(/^[A-Za-z0-9_-]{1,100}$/)
    expect(serverCalls[0]?.requestId).not.toBe(serverCalls[1]?.requestId)
  })

  it('F-AP-04: a failure the server decided rolls the cache back, and the write is kept for Retry', async () => {
    client.setQueryData<Todo[]>(KEY, [])
    behaviour.fail = new ApiClientError({ status: 400, code: 'BAD_REQUEST', message: 'nope' })
    behaviour.failTimes = 1
    const result = await startWrite(client, addTodo, { title: 'Milk', tempId: -1 }).result
    expect(result).toMatchObject({ status: 'failed' })
    expect(read(client)).toEqual([]) // rolled back
    expect(serverCalls).toHaveLength(1) // not retried: the server said no

    const { result: failed } = renderHook(() => useFailedWrites(), { wrapper: wrap(client) })
    expect(failed.current).toHaveLength(1)
    expect(failed.current[0]).toMatchObject({ label: 'Add a to-do' })
  })

  it('F-AP-04: Retry applies the change again and sends it with the same idempotency key', async () => {
    client.setQueryData<Todo[]>(KEY, [])
    behaviour.fail = new ApiClientError({ status: 400, code: 'BAD_REQUEST', message: 'nope' })
    behaviour.failTimes = 1
    await startWrite(client, addTodo, { title: 'Milk', tempId: -1 }).result
    const { result: failed } = renderHook(() => useFailedWrites(), { wrapper: wrap(client) })
    const id = failed.current[0]?.id as string
    const retry = retryFailedWrite(client, id)
    expect(read(client)).toHaveLength(1) // shown again at once
    await expect(retry?.result).resolves.toMatchObject({ status: 'saved' })
    expect(serverCalls).toHaveLength(2)
    expect(serverCalls[1]?.requestId).toBe(serverCalls[0]?.requestId)
    expect(
      renderHook(() => useFailedWrites(), { wrapper: wrap(client) }).result.current,
    ).toHaveLength(0)
  })

  it('F-AP-04: Discard removes a failed write (the cache was already rolled back)', async () => {
    client.setQueryData<Todo[]>(KEY, [])
    behaviour.fail = new ApiClientError({ status: 400, code: 'BAD_REQUEST', message: 'nope' })
    behaviour.failTimes = 1
    await startWrite(client, addTodo, { title: 'Milk', tempId: -1 }).result
    const { result: failed } = renderHook(() => useFailedWrites(), { wrapper: wrap(client) })
    dismissFailedWrite(client, failed.current[0]?.id as string)
    expect(
      renderHook(() => useFailedWrites(), { wrapper: wrap(client) }).result.current,
    ).toHaveLength(0)
    expect(read(client)).toEqual([])
  })

  it('F-AP-04: a transient failure is retried quietly: no rollback, and the write still lands', async () => {
    vi.useFakeTimers()
    client.setQueryData<Todo[]>(KEY, [])
    behaviour.fail = networkError()
    behaviour.failTimes = 1
    const handle = startWrite(client, addTodo, { title: 'Milk', tempId: -1 })
    await vi.advanceTimersByTimeAsync(0)
    expect(read(client)).toHaveLength(1) // still shown while it retries
    await vi.advanceTimersByTimeAsync(5000)
    await expect(handle.result).resolves.toMatchObject({ status: 'saved' })
    expect(serverCalls).toHaveLength(2)
    expect(serverCalls[1]?.requestId).toBe(serverCalls[0]?.requestId)
  })

  it('F-AP-04: writes to the same resource are sent one at a time, in order', async () => {
    client.setQueryData<Todo[]>(KEY, [{ id: 7, title: 't', done: false }])
    const order: string[] = []
    const slow = defineWrite<{ id: number; step: string }, null, null>({
      key: 'test/ordered',
      label: 'Ordered',
      scope: ({ id }) => `todo:${id}`,
      request: async ({ step }) => {
        order.push(`start ${step}`)
        await new Promise((resolve) => setTimeout(resolve, step === 'one' ? 20 : 1))
        order.push(`end ${step}`)
        return null
      },
    })
    const c = createAppQueryClient()
    c.mount()
    await Promise.all(
      ['one', 'two', 'three'].map((step) => startWrite(c, slow, { id: 7, step }).result),
    )
    expect(order).toEqual([
      'start one',
      'end one',
      'start two',
      'end two',
      'start three',
      'end three',
    ])
    c.unmount()
  })
})

describe('offline', () => {
  it('NC-AP-NO-LOST-WRITES: a write made offline shows at once, waits, and after a reload is sent once with the same key', async () => {
    const persister = createIdbPersister('w1')
    client.setQueryData<Todo[]>(KEY, [])
    onlineManager.setOnline(false)
    startWrite(client, addTodo, { title: 'Milk', tempId: -1 })
    expect(read(client)).toHaveLength(1)
    await vi.waitFor(() => expect(client.getMutationCache().getAll()[0]?.state.isPaused).toBe(true))
    expect(serverCalls).toHaveLength(0)
    await persistQueryClientSave({ queryClient: client, ...persistOptionsFor(persister) })
    const requestId = (
      client.getMutationCache().getAll()[0]?.state.variables as { requestId: string }
    ).requestId

    client.getMutationCache().clear() // this window is gone after the reload
    // reload: a new client restores the cache (showing the optimistic row) and the queue
    const reloaded = createAppQueryClient()
    await persistQueryClientRestore({ queryClient: reloaded, ...persistOptionsFor(persister) })
    expect(read(reloaded)).toEqual([{ id: -1, title: 'Milk', done: false }])
    onlineManager.setOnline(true)
    resumeQueuedWrites(reloaded)
    await vi.waitFor(() => expect(serverCalls).toHaveLength(1))
    expect(serverCalls[0]?.requestId).toBe(requestId)
    // reconcile ran from the restored defaults: the temporary row became the server's
    await vi.waitFor(() => expect(read(reloaded)[0]?.id).toBeGreaterThan(0))
    expect(read(reloaded)).toHaveLength(1)
  })

  it('NC-AP-NO-LOST-WRITES: a queued write that the server rejects after a reload is rolled back too', async () => {
    const persister = createIdbPersister('w1')
    client.setQueryData<Todo[]>(KEY, [])
    onlineManager.setOnline(false)
    startWrite(client, addTodo, { title: 'Milk', tempId: -1 })
    await vi.waitFor(() => expect(client.getMutationCache().getAll()[0]?.state.isPaused).toBe(true))
    await persistQueryClientSave({ queryClient: client, ...persistOptionsFor(persister) })

    const reloaded = createAppQueryClient()
    await persistQueryClientRestore({ queryClient: reloaded, ...persistOptionsFor(persister) })
    behaviour.fail = new ApiClientError({ status: 400, code: 'BAD_REQUEST', message: 'nope' })
    behaviour.failTimes = 1
    onlineManager.setOnline(true)
    resumeQueuedWrites(reloaded)
    await vi.waitFor(() => expect(read(reloaded)).toEqual([]))
  })

  it('SPEC-KB-001 QUEUED_OFFLINE -> UNDONE: a write still waiting can be cancelled: rolled back, never sent', async () => {
    client.setQueryData<Todo[]>(KEY, [])
    onlineManager.setOnline(false)
    const handle = startWrite(client, addTodo, { title: 'Milk', tempId: -1 })
    await vi.waitFor(() => expect(client.getMutationCache().getAll()[0]?.state.isPaused).toBe(true))
    expect(handle.cancel()).toBe(true)
    expect(read(client)).toEqual([])
    await expect(handle.result).resolves.toEqual({ status: 'cancelled' })
    onlineManager.setOnline(true)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(serverCalls).toHaveLength(0)
    expect(client.getMutationCache().getAll()).toHaveLength(0)
  })

  it('a write already on its way cannot be cancelled (the caller sends the reverse change instead)', async () => {
    client.setQueryData<Todo[]>(KEY, [])
    let hungCalled = false
    const hung = defineWrite<{ n: number }, null, null>({
      key: 'test/hung',
      label: 'Hung',
      request: () => {
        hungCalled = true
        return new Promise(() => {})
      },
    })
    const c = createAppQueryClient()
    c.mount()
    const handle = startWrite(c, hung, { n: 1 })
    await vi.waitFor(() => expect(hungCalled).toBe(true))
    expect(handle.cancel()).toBe(false)
    c.unmount()
  })
})

describe('useWrite', () => {
  it("returns a function that starts the write on the provider's client", async () => {
    client.setQueryData<Todo[]>(KEY, [])
    const { result } = renderHook(() => useWrite(addTodo), { wrapper: wrap(client) })
    let handle: ReturnType<typeof result.current> | undefined
    act(() => {
      handle = result.current({ title: 'Eggs', tempId: -5 })
    })
    expect(read(client)).toHaveLength(1)
    await expect(handle?.result).resolves.toMatchObject({ status: 'saved' })
  })
})

describe('toggle (an update with an undo patch)', () => {
  it('F-AP-04: a failed toggle puts the previous value back, not a guess', async () => {
    client.setQueryData<Todo[]>(KEY, [{ id: 7, title: 't', done: true }])
    behaviour.fail = new ApiClientError({ status: 404, code: 'NOT_FOUND', message: 'gone' })
    behaviour.failTimes = 1
    const result = await startWrite(client, toggleTodo, { id: 7 }).result
    expect(result).toMatchObject({ status: 'failed' })
    expect(read(client)[0]?.done).toBe(true)
  })
})

function wrap(c: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={c}>{children}</QueryClientProvider>
  )
}
