// The two undo kinds wired to real writes (step 4.5; SPEC-QP-001; SPEC-DATA-001 forbidden transitions):
// commit-now-and-reverse, and hold-until-close with a keepalive flush.
import 'fake-indexeddb/auto'
import type { Bootstrap, InventoryItem } from '@chatchiu/contracts'
import { onlineManager, type QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, vi } from 'vitest'
import { ApiClientError } from '../core/errors'
import { createToastStore, type ToastStore } from '../core/toast-store'
import { createUndoManager, type UndoManager } from '../core/undo'
import * as inventory from './inventory'
import { createAppQueryClient } from './query-client'
import { queryKeys } from './query'
import './register'
import { commitWrite, holdWrite } from './undoable'
import * as waste from './waste'
import { defineWrite, dismissFailedWrite, retryFailedWrite, startWrite } from './write'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('../core/api-client', () => ({ api }))

const item = (id: number, currentQuantity = 4): InventoryItem =>
  ({ id, name: `item ${id}`, quantity: 4, currentQuantity, unit: 'pcs' }) as InventoryItem
const boot = (items: InventoryItem[]): Bootstrap =>
  ({ items, locations: [], categories: [], summary: {} }) as unknown as Bootstrap
const items = (c: QueryClient) => c.getQueryData<Bootstrap>(queryKeys.bootstrap)?.items ?? []
const press = (store: ToastStore, label: string) =>
  store
    .getItems()
    .at(-1)
    ?.actions?.find((a) => a.label === label)
    ?.onPress()
const closeAll = (store: ToastStore) => store.getItems().forEach((i) => store.dismiss(i.id))

let client: QueryClient
let store: ToastStore
let undo: UndoManager
let win: EventTarget
let doc: EventTarget & { visibilityState: DocumentVisibilityState }
const shown: string[] = []
const show = (message: string) => shown.push(message)

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.resetAllMocks()
  shown.length = 0
  onlineManager.setOnline(true)
  client = createAppQueryClient()
  client.mount()
  client.setQueryData(queryKeys.bootstrap, boot([item(1), item(2)]))
  store = createToastStore()
  win = new EventTarget()
  doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState })
  undo = createUndoManager({ toasts: store, windowTarget: win, documentTarget: doc })
  undo.start()
})
afterEach(() => {
  undo.dispose()
  client.unmount()
  onlineManager.setOnline(true)
  vi.useRealTimers()
})

describe('commit now, reverse on Undo', () => {
  const usage = { itemId: 1, amountUsed: 1, currentQuantity: 3 }
  const reverse = {
    build: (saved: { id: number }) => ({
      // restoreTo is the amount before the use
      run: () =>
        startWrite(client, inventory.undoUsage, { itemId: 1, usageId: saved.id, restoreTo: 4 }),
    }),
  }

  it('F-QP-01: the use is saved at once, Undo sends usage-undo with the usage row id', async () => {
    api.post.mockResolvedValueOnce({ id: 55, item: item(1, 3) })
    api.post.mockResolvedValueOnce(item(1, 4))
    const handle = commitWrite(client, undo, inventory.logUsage, usage, {
      message: 'Used 1',
      reverse,
    })
    expect(items(client)[0]?.currentQuantity).toBe(3)
    await handle.result
    press(store, 'Undo')
    await vi.waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    expect(api.post).toHaveBeenLastCalledWith(
      '/api/inventory/1/usage-undo',
      { usageId: 55 },
      expect.anything(),
    )
    await vi.waitFor(() => expect(items(client)[0]?.currentQuantity).toBe(4))
  })

  it('silent-failure review: a refused first write retracts the Undo toast (nothing to undo, nothing to offer)', async () => {
    api.post.mockRejectedValueOnce(
      new ApiClientError({ status: 400, code: 'BAD_REQUEST', message: 'nope' }),
    )
    const handle = commitWrite(client, undo, inventory.logUsage, usage, {
      message: 'Used 1',
      reverse,
      extraActions: [{ label: 'Remove', onPress: vi.fn() }],
    })
    await handle.result
    await vi.advanceTimersByTimeAsync(10)
    expect(store.getItems().some((t) => t.message === 'Used 1')).toBe(false)
    expect(undo.canUndoLast()).toBe(false)
  })

  it('board review: onUndo runs when Undo is pressed, before the reverse is sent', async () => {
    api.post.mockResolvedValueOnce({ id: 55, item: item(1, 3) })
    api.post.mockResolvedValueOnce(item(1, 4))
    const onUndo = vi.fn()
    const handle = commitWrite(client, undo, inventory.logUsage, usage, {
      message: 'Used 1',
      reverse,
      onUndo,
    })
    await handle.result
    press(store, 'Undo')
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('SPEC-KB-001 QUEUED_OFFLINE -> UNDONE: Undo of a use made offline cancels it: nothing is ever sent', async () => {
    onlineManager.setOnline(false)
    commitWrite(client, undo, inventory.logUsage, usage, { message: 'Used 1', reverse })
    await vi.waitFor(() => expect(client.getMutationCache().getAll()[0]?.state.isPaused).toBe(true))
    press(store, 'Undo')
    await vi.waitFor(() => expect(items(client)[0]?.currentQuantity).toBe(4))
    onlineManager.setOnline(true)
    await vi.advanceTimersByTimeAsync(50)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('7.0.26a/b: a refused reverse says "Couldn\'t undo" with the reason; Ctrl+Z does not say "Undone"; no failed write is left to Retry', async () => {
    api.post.mockResolvedValueOnce({ id: 55, item: item(1, 3) })
    api.post.mockRejectedValueOnce(
      new ApiClientError({
        status: 409,
        code: 'CONFLICT',
        message: 'This usage can no longer be undone because the item changed since',
      }),
    )
    const handle = commitWrite(client, undo, inventory.logUsage, usage, {
      message: 'Used 1',
      reverse,
    })
    await handle.result
    closeAll(store)
    const done = await undo.undoLast()
    expect(done).toBe(false)
    const messages = store.getItems().map((t) => t.message)
    expect(messages.some((m) => m.startsWith('Undone'))).toBe(false)
    expect(messages.some((m) => m.includes("Couldn't undo") && m.includes('changed since'))).toBe(
      true,
    )
    expect(
      client
        .getMutationCache()
        .getAll()
        .filter((m) => m.state.status === 'error'),
    ).toHaveLength(0)
    expect(undo.canUndoLast()).toBe(true) // the change is still there: Retry or Ctrl+Z may try again
  })

  it('7.0.26e: the toast says the change is only waiting while the write is queued offline', async () => {
    onlineManager.setOnline(false)
    commitWrite(client, undo, inventory.logUsage, usage, { message: 'Used 1', reverse })
    const message = store.getItems().at(-1)?.message ?? ''
    expect(message).toMatch(/^Used 1/)
    expect(message).toMatch(/back online/)
  })

  it('Ctrl+Z path: undoLast works after the toast is gone', async () => {
    api.post.mockResolvedValueOnce({ id: 55, item: item(1, 3) })
    api.post.mockResolvedValueOnce(item(1, 4))
    const handle = commitWrite(client, undo, inventory.logUsage, usage, {
      message: 'Used 1',
      reverse,
    })
    await handle.result
    closeAll(store)
    await undo.undoLast()
    expect(api.post).toHaveBeenCalledTimes(2)
  })
})

describe('review fixes', () => {
  it('a held write whose undo context is undefined is applied once, not again when it is sent', async () => {
    const applies = vi.fn()
    const noUndo = defineWrite<{ n: number }, null, undefined>({
      key: 'test/no-undo',
      label: 'No undo',
      request: () => Promise.resolve(null),
      apply: () => {
        applies()
        return undefined
      },
    })
    holdWrite(client, undo, show, noUndo, { n: 1 }, 'x')
    closeAll(store)
    await vi.advanceTimersByTimeAsync(20)
    expect(applies).toHaveBeenCalledTimes(1)
  })

  it('a keepalive send does not wait for the write-ahead save (the page may be gone first)', async () => {
    let releaseSave: () => void = () => undefined
    const slow = createAppQueryClient({
      beforeSend: () => new Promise<void>((r) => (releaseSave = r)),
    })
    slow.mount()
    slow.setQueryData(queryKeys.bootstrap, boot([item(1)]))
    api.delete.mockResolvedValue({ deleted: true })
    const u = createUndoManager({
      toasts: createToastStore(),
      windowTarget: new EventTarget(),
      documentTarget: Object.assign(new EventTarget(), {
        visibilityState: 'visible' as DocumentVisibilityState,
      }),
    })
    holdWrite(slow, u, show, inventory.itemWrites.remove, { id: 1 }, 'x')
    u.flush()
    await vi.waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1))
    releaseSave()
    slow.unmount()
  })

  it('a held retry reuses one idempotency key', async () => {
    api.delete.mockRejectedValueOnce(
      new ApiClientError({ status: 400, code: 'BAD_REQUEST', message: 'x' }),
    )
    api.delete.mockResolvedValue({ deleted: true })
    holdWrite(client, undo, show, inventory.itemWrites.remove, { id: 1 }, 'x')
    closeAll(store)
    await vi.waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1))
    const failed = client
      .getMutationCache()
      .getAll()
      .find((m) => m.state.status === 'error')
    retryFailedWrite(client, String(failed?.mutationId))
    await vi.waitFor(() => expect(api.delete).toHaveBeenCalledTimes(2))
    const keys = api.delete.mock.calls.map(
      (c) => (c[1] as { idempotencyKey: string }).idempotencyKey,
    )
    expect(keys[0]).toBe(keys[1])
  })

  it('undoing a use whose first write was refused discards it, so its Retry cannot bring the use back', async () => {
    api.post.mockRejectedValueOnce(
      new ApiClientError({ status: 400, code: 'BAD_REQUEST', message: 'x' }),
    )
    const handle = commitWrite(
      client,
      undo,
      inventory.logUsage,
      { itemId: 1, amountUsed: 1, currentQuantity: 3 },
      {
        message: 'Used 1',
        reverse: {
          build: () => ({
            run: () =>
              startWrite(client, inventory.undoUsage, { itemId: 1, usageId: 1, restoreTo: 4 }),
          }),
        },
      },
    )
    // Undo is pressed while the write is still in flight; only then is there a toast to undo from.
    const undone = undo.undoLast()
    await handle.result
    await undone
    expect(
      client
        .getMutationCache()
        .getAll()
        .filter((m) => m.state.status === 'error'),
    ).toHaveLength(0)
  })
})

describe('hold until the toast closes', () => {
  it('NC-QP-NO-EARLY-SEND: a deleted item disappears at once, and the server hears nothing for 5 s', async () => {
    holdWrite(client, undo, show, inventory.itemWrites.remove, { id: 1 }, 'Deleted item 1')
    expect(items(client).map((i) => i.id)).toEqual([2])
    await vi.advanceTimersByTimeAsync(0)
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('SPEC-QP-001 HIDDEN_LOCALLY -> SENDING: closing the toast sends the delete once, not keepalive', async () => {
    api.delete.mockResolvedValue({ deleted: true })
    holdWrite(client, undo, show, inventory.itemWrites.remove, { id: 1 }, 'Deleted')
    closeAll(store)
    await vi.waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1))
    expect(api.delete.mock.calls[0]?.[1]).toMatchObject({ keepalive: false })
    expect(items(client).map((i) => i.id)).toEqual([2])
  })

  it('NC-DATA-HIDDEN-UNTOUCHED / FORBID UNDONE -> SENDING: Undo brings the row back and the server is never called', async () => {
    holdWrite(client, undo, show, inventory.itemWrites.remove, { id: 1 }, 'Deleted')
    press(store, 'Undo')
    closeAll(store)
    await vi.advanceTimersByTimeAsync(50)
    expect(items(client).map((i) => i.id)).toEqual([1, 2])
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('NC-QP-NO-LOST-ACTION: hiding the page sends a held waste move at once, with keepalive', async () => {
    api.post.mockResolvedValue({ id: 9 })
    holdWrite(client, undo, show, waste.wasteFromItem, { itemId: 1 }, 'Moved to waste')
    expect(items(client).map((i) => i.id)).toEqual([2])
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post).toHaveBeenCalledWith(
      '/api/waste/from-item',
      { itemId: 1 },
      expect.objectContaining({ keepalive: true }),
    )
  })

  it('a held change on a row that is still being created is refused, says so, and hides nothing', () => {
    client.setQueryData(queryKeys.bootstrap, boot([item(-5)]))
    expect(
      holdWrite(client, undo, show, inventory.itemWrites.remove, { id: -5 }, 'Deleted'),
    ).toBeNull()
    expect(shown[0]).toMatch(/still being saved/)
    expect(items(client)).toHaveLength(1)
    expect(store.getItems()).toHaveLength(0)
  })

  it('a refused held delete brings the row back and the failure can be retried', async () => {
    api.delete.mockRejectedValueOnce(
      new ApiClientError({ status: 400, code: 'BAD_REQUEST', message: 'no' }),
    )
    holdWrite(client, undo, show, inventory.itemWrites.remove, { id: 1 }, 'Deleted')
    closeAll(store)
    await vi.waitFor(() => expect(items(client).map((i) => i.id)).toEqual([1, 2]))
    const failed = client
      .getMutationCache()
      .getAll()
      .find((m) => m.state.status === 'error')
    expect(failed).toBeDefined()
    api.delete.mockResolvedValue({ deleted: true })
    retryFailedWrite(client, String(failed?.mutationId))
    expect(items(client).map((i) => i.id)).toEqual([2])
    await vi.waitFor(() => expect(api.delete).toHaveBeenCalledTimes(2))
    dismissFailedWrite(client, String(failed?.mutationId))
  })
})
