// Every data hook, against a mocked API client: the change shows at once, the server's row replaces it
// (no list refetch), a refusal rolls it back, and a write made offline is sent once after a reload.
// (SPEC-AP-001 F-AP-04, NC-AP-NO-LOST-WRITES; SPEC-DATA-001 item_lifecycle; AC-API-06/07/13/14.)
import 'fake-indexeddb/auto'
import type {
  Bootstrap,
  InventoryItem,
  MealPlan,
  Preferences,
  ShoppingItem,
  WasteEntry,
} from '@chatchiu/contracts'
import { onlineManager, type QueryClient } from '@tanstack/react-query'
import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from '@tanstack/react-query-persist-client'
import { afterEach, beforeEach, vi } from 'vitest'
import { ApiClientError, networkError } from '../core/errors'
import { createIdbPersister, deletePersistedCache, resetPersistenceStatus } from './persistence'
import { createAppQueryClient, persistOptionsFor, resumeQueuedWrites } from './query-client'
import { queryKeys } from './query'
import './register'
import * as ai from './ai'
import * as inventory from './inventory'
import * as meals from './meals'
import * as preferences from './preferences'
import * as recipes from './recipes'
import * as shopping from './shopping'
import * as waste from './waste'
import { newTempId } from './resource'
import { retryFailedWrite, startWrite } from './write'

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))
vi.mock('../core/api-client', () => ({ api }))

const refusal = () => new ApiClientError({ status: 400, code: 'BAD_REQUEST', message: 'nope' })
const item = (id: number, extra: Partial<InventoryItem> = {}): InventoryItem => ({
  id,
  userId: 'u',
  name: `item ${id}`,
  categoryId: 1,
  quantity: 4,
  unit: 'pcs',
  purchaseDate: null,
  expirationDate: '2030-01-01',
  locationId: 1,
  price: null,
  notes: null,
  notificationEnabled: true,
  notificationDaysBefore: 3,
  barcode: null,
  initialQuantity: 4,
  currentQuantity: 4,
  usageNotes: null,
  lowStockThreshold: null,
  lastNotifiedAt: null,
  createdAt: '2030-01-01',
  updatedAt: '2030-01-01',
  ...extra,
})
const bootstrap = (items: InventoryItem[]): Bootstrap => ({
  items,
  locations: [
    {
      id: 1,
      userId: 'u',
      name: 'Fridge',
      subLocation: null,
      icon: null,
      color: null,
      createdAt: 'x',
    },
  ],
  categories: [{ id: 1, name: 'Dairy', icon: null, color: null, userId: 'u', isSystem: false }],
  summary: {} as Bootstrap['summary'],
})
const items = (c: QueryClient) => c.getQueryData<Bootstrap>(queryKeys.bootstrap)?.items ?? []

let client: QueryClient
beforeEach(() => {
  vi.resetAllMocks()
  onlineManager.setOnline(true)
  resetPersistenceStatus()
  client = createAppQueryClient()
  client.mount()
})
afterEach(async () => {
  client.unmount()
  onlineManager.setOnline(true)
  await deletePersistedCache('d1')
})

describe('inventory', () => {
  beforeEach(() => client.setQueryData(queryKeys.bootstrap, bootstrap([item(1), item(2)])))

  it('F-AP-04: a new item shows at once with a temporary id, then becomes the server row', async () => {
    api.post.mockResolvedValue(item(77, { name: 'Milk' }))
    const handle = startWrite(client, inventory.itemWrites.create, {
      tempId: newTempId(),
      body: {
        name: 'Milk',
        categoryId: 1,
        quantity: 1,
        unit: 'l',
        expirationDate: '2030-02-02',
      } as never,
    })
    expect(items(client).map((i) => i.name)).toEqual(['item 1', 'item 2', 'Milk'])
    expect(items(client)[2]?.id).toBeLessThan(0)
    await handle.result
    expect(items(client).map((i) => i.id)).toEqual([1, 2, 77])
    expect(api.post).toHaveBeenCalledWith('/api/inventory', expect.anything(), {
      idempotencyKey: handle.requestId,
    })
  })

  it('a refetch that dropped the temporary row, or a realtime event that added the saved one first, never loses or doubles the row', async () => {
    api.post.mockResolvedValue(item(77, { name: 'Milk' }))
    const body = {
      name: 'Milk',
      categoryId: 1,
      quantity: 1,
      unit: 'l',
      expirationDate: '2030-02-02',
    } as never
    const dropped = startWrite(client, inventory.itemWrites.create, { tempId: -1, body })
    client.setQueryData(queryKeys.bootstrap, bootstrap([item(1), item(2)])) // a stale refetch lands
    await dropped.result
    expect(items(client).map((i) => i.id)).toEqual([1, 2, 77])
    client.setQueryData(queryKeys.bootstrap, bootstrap([item(1), item(2)]))
    const raced = startWrite(client, inventory.itemWrites.create, { tempId: -2, body })
    client.setQueryData(queryKeys.bootstrap, bootstrap([item(1), item(2), item(-2), item(77)])) // the event added 77 first
    await raced.result
    expect(items(client).map((i) => i.id)).toEqual([1, 2, 77])
  })

  it('F-AP-04: a refused item create takes the temporary row back out', async () => {
    api.post.mockRejectedValue(refusal())
    const result = await startWrite(client, inventory.itemWrites.create, {
      tempId: -9,
      body: {
        name: 'Milk',
        categoryId: 1,
        quantity: 1,
        unit: 'l',
        expirationDate: '2030-02-02',
      } as never,
    }).result
    expect(result.status).toBe('failed')
    expect(items(client).map((i) => i.id)).toEqual([1, 2])
  })

  it('F-AP-04: editing shows at once; a refusal restores only the fields it changed', async () => {
    api.patch.mockRejectedValue(refusal())
    const handle = startWrite(client, inventory.itemWrites.update, {
      id: 1,
      patch: { name: 'Oat milk' },
    })
    expect(items(client)[0]?.name).toBe('Oat milk')
    client.setQueryData<Bootstrap>(queryKeys.bootstrap, (b) =>
      b ? { ...b, items: b.items.map((i) => (i.id === 1 ? { ...i, notes: 'later edit' } : i)) } : b,
    )
    await handle.result
    expect(items(client)[0]).toMatchObject({ name: 'item 1', notes: 'later edit' })
  })

  it('d5533bc0: logging a use lowers the amount synchronously; the server item replaces it', async () => {
    api.post.mockResolvedValue({
      id: 5,
      crossedLowStock: false,
      item: item(1, { currentQuantity: 1.5 }),
    })
    const handle = startWrite(client, inventory.logUsage, {
      itemId: 1,
      amountUsed: 2.5,
      currentQuantity: 1.5,
    })
    expect(items(client)[0]?.currentQuantity).toBe(1.5)
    await handle.result
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory/1/usage',
      { amountUsed: 2.5, currentQuantity: 1.5 },
      expect.anything(),
    )
  })

  it('F-AP-04: a refused use puts the previous amount back', async () => {
    api.post.mockRejectedValue(refusal())
    await startWrite(client, inventory.logUsage, { itemId: 1, amountUsed: 3, currentQuantity: 1 })
      .result
    expect(items(client)[0]?.currentQuantity).toBe(4)
  })

  it('SPEC-DATA-001 usage undo: shows the old amount at once and takes the server item; a 409 rolls it back', async () => {
    client.setQueryData(queryKeys.bootstrap, bootstrap([item(1, { currentQuantity: 1 })]))
    api.post.mockRejectedValueOnce(
      new ApiClientError({ status: 409, code: 'CONFLICT', message: 'changed' }),
    )
    const handle = startWrite(client, inventory.undoUsage, { itemId: 1, usageId: 5, restoreTo: 4 })
    expect(items(client)[0]?.currentQuantity).toBe(4)
    expect((await handle.result).status).toBe('failed')
    expect(items(client)[0]?.currentQuantity).toBe(1)
  })

  it('F-AP-04: restock refills the item at once and takes the server item', async () => {
    client.setQueryData(queryKeys.bootstrap, bootstrap([item(1, { currentQuantity: 0.5 })]))
    api.post.mockResolvedValue(item(1, { quantity: 6, currentQuantity: 6, initialQuantity: 6 }))
    const handle = startWrite(client, inventory.restock, { id: 1, quantity: 6 })
    expect(items(client)[0]).toMatchObject({ quantity: 6, currentQuantity: 6 })
    await handle.result
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory/1/restock',
      { quantity: 6 },
      expect.anything(),
    )
  })

  it('F-AP-04: delete removes the row at once; a refusal puts it back in the same place', async () => {
    api.delete.mockRejectedValue(refusal())
    const handle = startWrite(client, inventory.itemWrites.remove, { id: 1 })
    expect(items(client).map((i) => i.id)).toEqual([2])
    await handle.result
    expect(items(client).map((i) => i.id)).toEqual([1, 2])
  })

  it('F-AP-04: deleting an item that is already gone counts as done (a replay), not a rollback', async () => {
    api.delete.mockRejectedValue(
      new ApiClientError({ status: 404, code: 'NOT_FOUND', message: 'gone' }),
    )
    const result = await startWrite(client, inventory.itemWrites.remove, { id: 1 }).result
    expect(result.status).toBe('saved')
    expect(items(client).map((i) => i.id)).toEqual([2])
  })

  it('F-AP-04: bulk delete sends the ids in a DELETE body and rolls back as a group', async () => {
    api.delete.mockRejectedValue(refusal())
    const handle = startWrite(client, inventory.bulkDelete, { ids: [1, 2] })
    expect(items(client)).toEqual([])
    await handle.result
    expect(
      items(client)
        .map((i) => i.id)
        .sort(),
    ).toEqual([1, 2])
    expect(api.delete).toHaveBeenCalledWith('/api/inventory/bulk', {
      idempotencyKey: handle.requestId,
      body: { ids: [1, 2] },
    })
  })

  it('F-AP-04: bulk create shows every row, then swaps in the server rows', async () => {
    api.post.mockResolvedValue([item(10), item(11)])
    const body = { items: [{ name: 'a' }, { name: 'b' }] } as never
    const handle = startWrite(client, inventory.bulkCreate, { tempIds: [-1, -2], body })
    expect(items(client)).toHaveLength(4)
    await handle.result
    expect(items(client).map((i) => i.id)).toEqual([1, 2, 10, 11])
  })

  it('locations and categories: create, rename and delete follow the same pattern', async () => {
    api.post.mockResolvedValue({
      id: 9,
      userId: 'u',
      name: 'Pantry',
      subLocation: null,
      icon: null,
      color: null,
      createdAt: 'x',
    })
    await startWrite(client, inventory.locationWrites.create, {
      tempId: -1,
      body: { name: 'Pantry' },
    }).result
    expect(client.getQueryData<Bootstrap>(queryKeys.bootstrap)?.locations.map((l) => l.id)).toEqual(
      [1, 9],
    )
    api.patch.mockRejectedValue(refusal())
    await startWrite(client, inventory.categoryWrites.update, { id: 1, patch: { name: 'Milk' } })
      .result
    expect(client.getQueryData<Bootstrap>(queryKeys.bootstrap)?.categories[0]?.name).toBe('Dairy')
    api.delete.mockRejectedValue(
      new ApiClientError({ status: 409, code: 'CONFLICT', message: 'in use' }),
    )
    await startWrite(client, inventory.categoryWrites.remove, { id: 1 }).result
    expect(client.getQueryData<Bootstrap>(queryKeys.bootstrap)?.categories).toHaveLength(1)
  })

  it('F-SE-01: a new location shows its icon and colour at once, before the server answers', () => {
    api.post.mockReturnValue(new Promise(() => undefined))
    startWrite(client, inventory.locationWrites.create, {
      tempId: -3,
      body: { name: 'Larder', icon: 'jar', color: 'mint' },
    })
    const drafted = client
      .getQueryData<Bootstrap>(queryKeys.bootstrap)
      ?.locations.find((l) => l.id === -3)
    expect([drafted?.icon, drafted?.color]).toEqual(['jar', 'mint'])
  })

  it('a write on a row that is still being created fails at once and changes nothing', async () => {
    client.setQueryData(queryKeys.bootstrap, bootstrap([item(-5), item(2)]))
    for (const handle of [
      startWrite(client, inventory.itemWrites.remove, { id: -5 }),
      startWrite(client, inventory.itemWrites.update, { id: -5, patch: { name: 'x' } }),
      startWrite(client, inventory.logUsage, { itemId: -5, amountUsed: 1, currentQuantity: 1 }),
      startWrite(client, waste.wasteFromItem, { itemId: -5 }),
    ]) {
      expect((await handle.result).status).toBe('failed')
    }
    expect(items(client).map((i) => i.id)).toEqual([-5, 2])
    expect(api.delete).not.toHaveBeenCalled()
    expect(api.patch).not.toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('a bulk delete that answers 404 is a failure (the route, not the rows), and rolls back', async () => {
    client.setQueryData(queryKeys.bootstrap, bootstrap([item(1)]))
    api.delete.mockRejectedValue(
      new ApiClientError({ status: 404, code: 'NOT_FOUND', message: 'x' }),
    )
    expect((await startWrite(client, inventory.bulkDelete, { ids: [1] }).result).status).toBe(
      'failed',
    )
    expect(items(client)).toHaveLength(1)
  })

  it('cancelling right after starting still rolls back and never sends', async () => {
    client.setQueryData(queryKeys.bootstrap, bootstrap([item(1)]))
    onlineManager.setOnline(false)
    const handle = startWrite(client, inventory.itemWrites.remove, { id: 1 })
    expect(handle.cancel()).toBe(true)
    expect(items(client).map((i) => i.id)).toEqual([1])
    onlineManager.setOnline(true)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('a refused write is kept across a reload so it can still be retried', async () => {
    const persister = createIdbPersister('d1')
    client.setQueryData(queryKeys.bootstrap, bootstrap([item(1)]))
    api.patch.mockRejectedValue(refusal())
    await startWrite(client, inventory.itemWrites.update, { id: 1, patch: { name: 'x' } }).result
    await persistQueryClientSave({ queryClient: client, ...persistOptionsFor(persister) })
    const reloaded = createAppQueryClient()
    await persistQueryClientRestore({ queryClient: reloaded, ...persistOptionsFor(persister) })
    const failed = reloaded.getMutationCache().getAll()
    expect(failed).toHaveLength(1)
    expect(failed[0]?.state.status).toBe('error')
    api.patch.mockResolvedValue(item(1, { name: 'x' }))
    const retry = retryFailedWrite(reloaded, String(failed[0]?.mutationId))
    expect((await retry?.result)?.status).toBe('saved')
  })

  it('a write to a bootstrap that is not loaded yet changes nothing and does not throw', async () => {
    client.clear()
    api.patch.mockResolvedValue(item(1))
    await expect(
      startWrite(client, inventory.itemWrites.update, { id: 1, patch: { name: 'x' } }).result,
    ).resolves.toMatchObject({ status: 'saved' })
    expect(client.getQueryData(queryKeys.bootstrap)).toBeUndefined()
  })
})

describe('waste', () => {
  it('SPEC-DATA-001: marking an item wasted removes it from the board at once, and a refusal brings it back', async () => {
    client.setQueryData(queryKeys.bootstrap, bootstrap([item(1), item(2)]))
    api.post.mockRejectedValue(refusal())
    const handle = startWrite(client, waste.wasteFromItem, { itemId: 1 })
    expect(items(client).map((i) => i.id)).toEqual([2])
    await handle.result
    expect(items(client).map((i) => i.id)).toEqual([1, 2])
  })

  it('SPEC-DATA-001: on success the log row is added to a loaded log without a refetch', async () => {
    client.setQueryData(queryKeys.bootstrap, bootstrap([item(1)]))
    client.setQueryData<WasteEntry[]>(queryKeys.waste, [])
    const entry = {
      id: 3,
      userId: 'u',
      itemName: 'item 1',
      categoryId: 1,
      quantity: 4,
      unit: 'pcs',
      price: null,
      wastedDate: '2030-01-01',
    }
    api.post.mockResolvedValue(entry)
    await startWrite(client, waste.wasteFromItem, { itemId: 1 }).result
    expect(client.getQueryData<WasteEntry[]>(queryKeys.waste)).toEqual([entry])
    expect(items(client)).toEqual([])
  })

  it('a waste entry can be added and deleted like any row', async () => {
    client.setQueryData<WasteEntry[]>(queryKeys.waste, [])
    api.post.mockResolvedValue({ id: 8 })
    await startWrite(client, waste.wasteWrites.create, {
      tempId: -1,
      body: { itemName: 'Bread', quantity: 1, unit: 'pcs' } as never,
    }).result
    expect(client.getQueryData<WasteEntry[]>(queryKeys.waste)?.map((w) => w.id)).toEqual([8])
    api.delete.mockResolvedValue({ deleted: true })
    await startWrite(client, waste.wasteWrites.remove, { id: 8 }).result
    expect(client.getQueryData<WasteEntry[]>(queryKeys.waste)).toEqual([])
  })
})

describe('shopping, recipes, meals, preferences', () => {
  it('shopping: ticking an item shows at once and rolls back on a refusal; clear-purchased restores the group', async () => {
    const row = (id: number, isPurchased: boolean): ShoppingItem => ({
      id,
      userId: 'u',
      name: 'm',
      quantity: null,
      notes: null,
      categoryId: null,
      isPurchased,
      createdAt: 'x',
    })
    client.setQueryData<ShoppingItem[]>(queryKeys.shopping, [row(1, false), row(2, true)])
    api.patch.mockRejectedValue(refusal())
    const tick = startWrite(client, shopping.shoppingWrites.update, {
      id: 1,
      patch: { isPurchased: true },
    })
    expect(client.getQueryData<ShoppingItem[]>(queryKeys.shopping)?.[0]?.isPurchased).toBe(true)
    await tick.result
    expect(client.getQueryData<ShoppingItem[]>(queryKeys.shopping)?.[0]?.isPurchased).toBe(false)
    api.post.mockRejectedValue(refusal())
    const clear = startWrite(client, shopping.clearPurchased, { ids: [2] })
    expect(client.getQueryData<ShoppingItem[]>(queryKeys.shopping)?.map((r) => r.id)).toEqual([1])
    await clear.result
    expect(
      client
        .getQueryData<ShoppingItem[]>(queryKeys.shopping)
        ?.map((r) => r.id)
        .sort(),
    ).toEqual([1, 2])
  })

  it('recipes: create replaces the temporary row with the server row', async () => {
    client.setQueryData(queryKeys.recipes, [])
    api.post.mockResolvedValue({ id: 4, name: 'Soup' })
    const handle = startWrite(client, recipes.recipeWrites.create, {
      tempId: -1,
      body: { name: 'Soup', ingredients: 'water' } as never,
    })
    expect(client.getQueryData<{ id: number }[]>(queryKeys.recipes)?.[0]?.id).toBeLessThan(0)
    await handle.result
    expect(client.getQueryData<{ id: number }[]>(queryKeys.recipes)?.[0]?.id).toBe(4)
  })

  it('AC-API-13: a meal in a taken slot (409) is rolled back out of every range that showed it', async () => {
    const plan = (id: number, planDate: string): MealPlan => ({
      id,
      userId: 'u',
      planDate,
      mealType: 'dinner',
      mealName: 'x',
      recipeId: null,
      isFavorite: false,
      notes: null,
      createdAt: 'x',
      updatedAt: 'x',
    })
    client.setQueryData(queryKeys.meals('2030-01-01', '2030-01-07'), [plan(1, '2030-01-02')])
    client.setQueryData(queryKeys.meals('2030-02-01', '2030-02-07'), [])
    api.post.mockRejectedValue(
      new ApiClientError({
        status: 409,
        code: 'CONFLICT',
        message: 'taken',
        details: { existingId: 1 },
      }),
    )
    const handle = startWrite(client, meals.mealWrites.create, {
      tempId: -1,
      body: { planDate: '2030-01-03', mealType: 'dinner', mealName: 'Pasta' } as never,
    })
    expect(
      client.getQueryData<MealPlan[]>(queryKeys.meals('2030-01-01', '2030-01-07')),
    ).toHaveLength(2)
    expect(
      client.getQueryData<MealPlan[]>(queryKeys.meals('2030-02-01', '2030-02-07')),
    ).toHaveLength(0)
    await handle.result
    expect(
      client
        .getQueryData<MealPlan[]>(queryKeys.meals('2030-01-01', '2030-01-07'))
        ?.map((m) => m.id),
    ).toEqual([1])
  })

  it('AC-API-17: a preferences change shows at once (the theme) and rolls back on a refusal', async () => {
    const prefs: Preferences = {
      timezone: 'UTC',
      notifyHour: 9,
      expiryAlerts: true,
      lowStockAlerts: true,
      theme: 'light',
    }
    client.setQueryData(queryKeys.preferences, prefs)
    api.patch.mockRejectedValue(refusal())
    const handle = startWrite(client, preferences.updatePreferences, { theme: 'dark' })
    expect(client.getQueryData<Preferences>(queryKeys.preferences)?.theme).toBe('dark')
    await handle.result
    expect(client.getQueryData<Preferences>(queryKeys.preferences)?.theme).toBe('light')
  })
})

describe('ai', () => {
  it('AI calls are never queued: offline they fail at once, nothing is saved, and they are not listed as failed writes', async () => {
    onlineManager.setOnline(false)
    api.post.mockRejectedValue(networkError())
    const result = await startWrite(client, ai.receiptScan, { imagePath: 'u/receipts/a.jpg' })
      .result
    expect(result.status).toBe('failed')
    expect(api.post).toHaveBeenCalledTimes(1) // tried once, not retried, not held for later
    const persister = createIdbPersister('d1')
    await persistQueryClientSave({ queryClient: client, ...persistOptionsFor(persister) })
    const reloaded = createAppQueryClient()
    await persistQueryClientRestore({ queryClient: reloaded, ...persistOptionsFor(persister) })
    expect(reloaded.getMutationCache().getAll()).toHaveLength(0)
  })

  it('a receipt scan online returns what the server read and leaves the cache alone', async () => {
    api.post.mockResolvedValue({ items: [{ name: 'Milk' }] })
    const result = await startWrite(client, ai.receiptScan, { imagePath: 'u/receipts/a.jpg' })
      .result
    expect(result).toEqual({ status: 'saved', data: { items: [{ name: 'Milk' }] } })
  })
})

describe('offline queue with the real definitions', () => {
  it('NC-AP-NO-LOST-WRITES: a use logged offline survives a reload and is sent once, with the same key', async () => {
    const persister = createIdbPersister('d1')
    client.setQueryData(queryKeys.bootstrap, bootstrap([item(1)]))
    onlineManager.setOnline(false)
    const handle = startWrite(client, inventory.logUsage, {
      itemId: 1,
      amountUsed: 1,
      currentQuantity: 3,
    })
    await vi.waitFor(() => expect(client.getMutationCache().getAll()[0]?.state.isPaused).toBe(true))
    await persistQueryClientSave({ queryClient: client, ...persistOptionsFor(persister) })
    client.getMutationCache().clear()

    const reloaded = createAppQueryClient()
    await persistQueryClientRestore({ queryClient: reloaded, ...persistOptionsFor(persister) })
    expect(items(reloaded)[0]?.currentQuantity).toBe(3)
    api.post.mockResolvedValue({
      id: 5,
      crossedLowStock: false,
      item: item(1, { currentQuantity: 3, updatedAt: 'server' }),
    })
    onlineManager.setOnline(true)
    resumeQueuedWrites(reloaded)
    await vi.waitFor(() => expect(items(reloaded)[0]?.updatedAt).toBe('server'))
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith('/api/inventory/1/usage', expect.anything(), {
      idempotencyKey: handle.requestId,
    })
  })
})
