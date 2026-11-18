// Waste log (step 4.4). Marking an item as wasted moves it: the item leaves the board and a log row
// appears, in one write (the server does both atomically, SPEC-DATA-001 item_lifecycle).
import type { InventoryItem, WasteCreate, WasteEntry, WasteFromItem } from '@chatchiu/contracts'
import { api } from '../core/api-client'
import { bootstrapStore } from './inventory'
import { queryKeys, useApiQuery } from './query'
import { defineResource, queryListStore, tempGuard } from './resource'
import { defineWrite } from './write'

const wasteStore = queryListStore<WasteEntry>(queryKeys.waste)
const itemsStore = bootstrapStore('items')

export const wasteWrites = defineResource<WasteEntry, WasteCreate, Partial<WasteCreate>>({
  name: 'waste',
  noun: 'a waste entry',
  path: '/api/waste',
  store: wasteStore,
  // The totals, charts and most-wasted lists are computed by the server from the log.
  onSaved: (client) => void client.invalidateQueries({ queryKey: queryKeys.statsAll }),
  draft: (body, id) => ({
    id,
    userId: '',
    itemName: body.itemName,
    categoryId: body.categoryId ?? null,
    quantity: body.quantity,
    unit: body.unit,
    price: body.price ?? null,
    wastedDate: body.wastedDate ?? new Date().toISOString().slice(0, 10),
  }),
})

type FromItemUndo = { item: InventoryItem | null; index: number }
export const wasteFromItem = defineWrite<WasteFromItem, WasteEntry, FromItemUndo>({
  key: 'waste/from-item',
  refetchOnFailure: queryKeys.bootstrap,
  guard: ({ itemId }) => tempGuard(itemId),
  label: 'Mark as wasted',
  scope: ({ itemId }) => `inventory:${itemId}`,
  request: (input, requestId, options) =>
    api.post<WasteEntry>('/api/waste/from-item', input, {
      idempotencyKey: requestId,
      keepalive: options?.keepalive,
    }),
  apply: (client, { itemId }) => {
    const items = itemsStore.read(client)
    const index = items.findIndex((i) => i.id === itemId)
    const item = items[index] ?? null
    if (item)
      itemsStore.write(
        client,
        items.filter((i) => i.id !== itemId),
      )
    return { item, index }
  },
  reconcile: (client, entry) => {
    void client.invalidateQueries({ queryKey: queryKeys.statsAll })
    // Only add to the log if it was loaded: otherwise the next read fetches it.
    if (client.getQueryData(queryKeys.waste) !== undefined) {
      wasteStore.write(client, [entry, ...wasteStore.read(client)])
    }
  },
  rollback: (client, { item, index }) => {
    if (!item) return
    const rest = itemsStore.read(client).filter((i) => i.id !== item.id)
    itemsStore.write(client, [...rest.slice(0, index), item, ...rest.slice(index)])
  },
})

export const useWasteQuery = () => useApiQuery<WasteEntry[]>(queryKeys.waste, '/api/waste')
