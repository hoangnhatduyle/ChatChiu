// Shopping list (step 4.4): one list query; add, edit, tick and delete are optimistic writes.
import type { ShoppingItem, ShoppingItemCreate, ShoppingItemUpdate } from '@chatchiu/contracts'
import { api } from '../core/api-client'
import { queryKeys, useApiQuery } from './query'
import { defineResource, queryListStore } from './resource'
import { defineWrite } from './write'

const store = queryListStore<ShoppingItem>(queryKeys.shopping)

export const shoppingWrites = defineResource<ShoppingItem, ShoppingItemCreate, ShoppingItemUpdate>({
  name: 'shopping',
  noun: 'a shopping item',
  path: '/api/shopping-list',
  store,
  draft: (body, id) => ({
    id,
    userId: '',
    name: body.name,
    quantity: body.quantity ?? null,
    notes: body.notes ?? null,
    categoryId: body.categoryId ?? null,
    isPurchased: false,
    createdAt: new Date().toISOString(),
  }),
})

/** Removes ticked items in one call (up to CLEAR_PURCHASED_MAX). */
export const clearPurchased = defineWrite<{ ids: number[] }, unknown, { rows: ShoppingItem[] }>({
  key: 'shopping/clear-purchased',
  refetchOnFailure: queryKeys.shopping,
  label: 'Clear bought items',
  scope: () => 'shopping:clear',
  request: ({ ids }, requestId, options) =>
    api.post(
      '/api/shopping-list/clear-purchased',
      { ids },
      { idempotencyKey: requestId, keepalive: options?.keepalive },
    ),
  apply: (client, { ids }) => {
    const gone = new Set(ids)
    const all = store.read(client)
    store.write(
      client,
      all.filter((r) => !gone.has(r.id)),
    )
    return { rows: all.filter((r) => gone.has(r.id)) }
  },
  rollback: (client, { rows }) => {
    const back = new Set(rows.map((r) => r.id))
    store.write(client, [...store.read(client).filter((r) => !back.has(r.id)), ...rows])
  },
})

export const useShoppingQuery = () =>
  useApiQuery<ShoppingItem[]>(queryKeys.shopping, '/api/shopping-list')
