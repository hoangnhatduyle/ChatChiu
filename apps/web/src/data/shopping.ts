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
export const clearPurchased = defineWrite<
  { ids: number[] },
  unknown,
  { rows: ShoppingItem[]; order: number[] }
>({
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
    return { rows: all.filter((r) => gone.has(r.id)), order: all.map((r) => r.id) }
  },
  rollback: (client, { rows, order }) => {
    const back = new Set(rows.map((r) => r.id))
    // Back in the places they had (rows added since keep to the end): `order` is the list before the clear.
    const place = (id: number) => {
      const at = order.indexOf(id)
      return at === -1 ? order.length : at
    }
    const merged = [...store.read(client).filter((r) => !back.has(r.id)), ...rows]
    store.write(
      client,
      merged
        .map((r, i) => ({ r, i }))
        .sort((a, b) => place(a.r.id) - place(b.r.id) || a.i - b.i)
        .map(({ r }) => r),
    )
  },
})

export const useShoppingQuery = () =>
  useApiQuery<ShoppingItem[]>(queryKeys.shopping, '/api/shopping-list')
