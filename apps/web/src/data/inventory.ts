// Inventory: the board's data (step 4.4). Items, locations and categories come from one bootstrap
// call (AC-API-06) and live in one cache entry; every write below changes that entry first, then the
// server's row replaces it. The bootstrap `summary` is not recomputed here: it is refreshed with the
// next read (staleTime), never by a refetch after a write.
import type {
  Bootstrap,
  BulkCreate,
  InventoryItem,
  InventoryItemCreate,
  InventoryItemUpdate,
  Restock,
  UsageEntry,
  UsageLog,
  UsageLogResult,
} from '@chatchiu/contracts'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { api } from '../core/api-client'
import { queryKeys, useApiQuery } from './query'
import { defineResource, deleteRow, tempGuard, type ListStore } from './resource'
import { defineWrite } from './write'

export function bootstrapStore<K extends 'items' | 'locations' | 'categories'>(
  field: K,
): ListStore<Bootstrap[K][number]> {
  return {
    queryKey: queryKeys.bootstrap,
    read: (client) => client.getQueryData<Bootstrap>(queryKeys.bootstrap)?.[field] ?? [],
    write: (client, rows) => {
      void client.cancelQueries({ queryKey: queryKeys.bootstrap }, { revert: false })
      client.setQueryData<Bootstrap>(queryKeys.bootstrap, (old) =>
        old ? { ...old, [field]: rows } : old,
      )
    },
  }
}

const itemsStore = bootstrapStore('items')
const patchItem = (client: QueryClient, id: number, patch: Partial<InventoryItem>) =>
  itemsStore.write(
    client,
    itemsStore.read(client).map((i) => (i.id === id ? { ...i, ...patch } : i)),
  )
const replaceItem = (client: QueryClient, saved: InventoryItem) =>
  itemsStore.write(
    client,
    itemsStore.read(client).map((i) => (i.id === saved.id ? saved : i)),
  )

/** The row to show before the server answers; the server fills in the rest. */
function draftItem(body: InventoryItemCreate, tempId: number): InventoryItem {
  const now = new Date().toISOString()
  return {
    id: tempId,
    userId: '',
    name: body.name,
    categoryId: body.categoryId,
    quantity: body.quantity,
    unit: body.unit,
    purchaseDate: body.purchaseDate ?? null,
    expirationDate: body.expirationDate,
    locationId: body.locationId ?? null,
    price: body.price ?? null,
    notes: body.notes ?? null,
    notificationEnabled: body.notificationEnabled ?? true,
    notificationDaysBefore: body.notificationDaysBefore ?? 3,
    barcode: body.barcode ?? null,
    initialQuantity: body.initialQuantity ?? body.quantity,
    currentQuantity: body.currentQuantity ?? body.quantity,
    usageNotes: null,
    lowStockThreshold: body.lowStockThreshold ?? null,
    lastNotifiedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

export const itemWrites = defineResource<InventoryItem, InventoryItemCreate, InventoryItemUpdate>({
  name: 'inventory',
  noun: 'an item',
  path: '/api/inventory',
  store: itemsStore,
  draft: draftItem,
})

export const locationWrites = defineResource<
  Bootstrap['locations'][number],
  { name: string; subLocation?: string | null },
  { name?: string; subLocation?: string | null }
>({
  name: 'locations',
  noun: 'a location',
  path: '/api/locations',
  store: bootstrapStore('locations'),
  draft: (body, id) => ({
    id,
    userId: '',
    name: body.name,
    subLocation: body.subLocation ?? null,
    createdAt: new Date().toISOString(),
  }),
})

export const categoryWrites = defineResource<
  Bootstrap['categories'][number],
  { name: string; icon?: string | null; color?: string | null },
  { name?: string; icon?: string | null; color?: string | null }
>({
  name: 'categories',
  noun: 'a category',
  path: '/api/categories',
  store: bootstrapStore('categories'),
  draft: (body, id) => ({
    id,
    name: body.name,
    icon: body.icon ?? null,
    color: body.color ?? null,
    userId: '',
    isSystem: false,
  }),
})

type UsageInput = { itemId: number } & UsageLog
type UsageUndo = { itemId: number; before: Pick<InventoryItem, 'currentQuantity'> | null }

/** Logs a use: the amount left drops at once; the server's item (and usage row) replaces it. */
export const logUsage = defineWrite<UsageInput, UsageLogResult, UsageUndo>({
  key: 'inventory/log-usage',
  refetchOnFailure: queryKeys.bootstrap,
  guard: ({ itemId }) => tempGuard(itemId),
  label: 'Log usage',
  scope: ({ itemId }) => `inventory:${itemId}`,
  request: ({ itemId, ...body }, requestId) =>
    api.post<UsageLogResult>(`/api/inventory/${itemId}/usage`, body, { idempotencyKey: requestId }),
  apply: (client, { itemId, currentQuantity }) => {
    const item = itemsStore.read(client).find((i) => i.id === itemId)
    if (!item) return { itemId, before: null }
    patchItem(client, itemId, { currentQuantity })
    return { itemId, before: { currentQuantity: item.currentQuantity } }
  },
  reconcile: (client, result) => replaceItem(client, result.item),
  rollback: (client, { itemId, before }) => {
    if (before) patchItem(client, itemId, before)
  },
})

type UndoUsageInput = { itemId: number; usageId: number; restoreTo: number | null }
/**
 * Reverses a logged use (the usage row is deleted and the amount restored, SPEC-DATA-001). `restoreTo`
 * is the amount before the use, so the board shows it at once; the server's item then replaces it.
 */
export const undoUsage = defineWrite<UndoUsageInput, InventoryItem, UsageUndo>({
  key: 'inventory/undo-usage',
  refetchOnFailure: queryKeys.bootstrap,
  guard: ({ itemId }) => tempGuard(itemId),
  label: 'Undo usage',
  scope: ({ itemId }) => `inventory:${itemId}`,
  request: ({ itemId, usageId }, requestId) =>
    api.post<InventoryItem>(
      `/api/inventory/${itemId}/usage-undo`,
      { usageId },
      { idempotencyKey: requestId },
    ),
  apply: (client, { itemId, restoreTo }) => {
    const item = itemsStore.read(client).find((i) => i.id === itemId)
    if (!item || restoreTo === null) return { itemId, before: null }
    patchItem(client, itemId, { currentQuantity: restoreTo })
    return { itemId, before: { currentQuantity: item.currentQuantity } }
  },
  reconcile: (client, item) => replaceItem(client, item),
  rollback: (client, { itemId, before }) => {
    if (before) patchItem(client, itemId, before)
  },
})

type RestockInput = { id: number } & Restock
export const restock = defineWrite<
  RestockInput,
  InventoryItem,
  { id: number; before: Partial<InventoryItem> | null }
>({
  key: 'inventory/restock',
  refetchOnFailure: queryKeys.bootstrap,
  guard: ({ id }) => tempGuard(id),
  label: 'Restock',
  scope: ({ id }) => `inventory:${id}`,
  request: ({ id, ...body }, requestId) =>
    api.post<InventoryItem>(`/api/inventory/${id}/restock`, body, { idempotencyKey: requestId }),
  apply: (client, { id, quantity, expirationDate }) => {
    const item = itemsStore.read(client).find((i) => i.id === id)
    if (!item) return { id, before: null }
    const before = {
      quantity: item.quantity,
      currentQuantity: item.currentQuantity,
      initialQuantity: item.initialQuantity,
      expirationDate: item.expirationDate,
    }
    patchItem(client, id, {
      quantity,
      currentQuantity: quantity,
      initialQuantity: quantity,
      ...(expirationDate ? { expirationDate } : {}),
    })
    return { id, before }
  },
  reconcile: (client, item) => replaceItem(client, item),
  rollback: (client, { id, before }) => {
    if (before) patchItem(client, id, before)
  },
})

export const bulkDelete = defineWrite<{ ids: number[] }, unknown, { rows: InventoryItem[] }>({
  key: 'inventory/bulk-delete',
  refetchOnFailure: queryKeys.bootstrap,
  guard: ({ ids }) => tempGuard(...ids),
  label: 'Delete items',
  scope: () => 'inventory:bulk',
  request: ({ ids }, requestId, options) =>
    deleteRow('/api/inventory/bulk', requestId, { ids }, options),
  apply: (client, { ids }) => {
    const gone = new Set(ids)
    const all = itemsStore.read(client)
    itemsStore.write(
      client,
      all.filter((i) => !gone.has(i.id)),
    )
    return { rows: all.filter((i) => gone.has(i.id)) }
  },
  rollback: (client, { rows }) => {
    const back = new Set(rows.map((r) => r.id))
    itemsStore.write(client, [...itemsStore.read(client).filter((i) => !back.has(i.id)), ...rows])
  },
})

export const bulkCreate = defineWrite<
  { tempIds: number[]; body: BulkCreate },
  InventoryItem[],
  { tempIds: number[] }
>({
  key: 'inventory/bulk-create',
  refetchOnFailure: queryKeys.bootstrap,
  label: 'Add items',
  scope: () => 'inventory:bulk',
  request: ({ body }, requestId) =>
    api.post<InventoryItem[]>('/api/inventory/bulk', body, { idempotencyKey: requestId }),
  apply: (client, { tempIds, body }) => {
    itemsStore.write(client, [
      ...itemsStore.read(client),
      ...body.items.map((item, i) => draftItem(item, tempIds[i] ?? -(i + 1))),
    ])
    return { tempIds }
  },
  reconcile: (client, saved, { tempIds }) => {
    const temp = new Set(tempIds)
    itemsStore.write(client, [...itemsStore.read(client).filter((i) => !temp.has(i.id)), ...saved])
  },
  rollback: (client, { tempIds }) => {
    const temp = new Set(tempIds)
    itemsStore.write(
      client,
      itemsStore.read(client).filter((i) => !temp.has(i.id)),
    )
  },
})

export const useBootstrapQuery = () => useApiQuery<Bootstrap>(queryKeys.bootstrap, '/api/bootstrap')

/** One item, read from the bootstrap (no request of its own). */
export function useItemQuery(id: number): InventoryItem | undefined {
  return useBootstrapQuery().data?.items.find((i) => i.id === id)
}

export function useUsageHistoryQuery(itemId: number) {
  return useQuery<UsageEntry[]>({
    queryKey: queryKeys.usage(itemId),
    queryFn: ({ signal }) => api.get<UsageEntry[]>(`/api/inventory/${itemId}/usage`, { signal }),
  })
}
