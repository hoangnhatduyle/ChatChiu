// F-KB-16: a change made on another device reaches the cache, without undoing what this device is doing.
import 'fake-indexeddb/auto'
import type { Bootstrap, InventoryItem, MealPlan, ShoppingItem } from '@chatchiu/contracts'
import { onlineManager, type QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, vi } from 'vitest'
import type { RealtimeChange } from '../core/realtime'
import * as inventory from './inventory'
import { createAppQueryClient } from './query-client'
import { queryKeys } from './query'
import './register'
import { applyRealtimeChange, resyncFromServer } from './realtime-sync'
import { startWrite } from './write'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('../core/api-client', () => ({ api }))

const item = (id: number, name = `item ${id}`): InventoryItem =>
  ({ id, name, currentQuantity: 4 }) as InventoryItem
const boot = (items: InventoryItem[]): Bootstrap =>
  ({ items, locations: [], categories: [], summary: {} }) as unknown as Bootstrap
const names = (c: QueryClient) =>
  c.getQueryData<Bootstrap>(queryKeys.bootstrap)?.items.map((i) => `${i.id}:${i.name}`)
const change = (
  table: RealtimeChange['table'],
  type: RealtimeChange['type'],
  row: Record<string, unknown>,
) => ({ table, type, row }) as RealtimeChange

let client: QueryClient
beforeEach(() => {
  vi.resetAllMocks()
  onlineManager.setOnline(true)
  client = createAppQueryClient()
  client.mount()
  client.setQueryData(queryKeys.bootstrap, boot([item(1), item(2)]))
})
afterEach(() => client.unmount())

describe('applyRealtimeChange', () => {
  it('F-KB-16: an update from another device changes the row in place (merged, so unsent columns stay)', () => {
    applyRealtimeChange(client, change('inventory_items', 'UPDATE', { id: 1, currentQuantity: 1 }))
    const row = client.getQueryData<Bootstrap>(queryKeys.bootstrap)?.items[0]
    expect(row).toMatchObject({ id: 1, name: 'item 1', currentQuantity: 1 })
  })

  it('F-KB-16: an insert adds the row, and an insert of one we already have replaces it (no duplicate)', () => {
    applyRealtimeChange(
      client,
      change('inventory_items', 'INSERT', {
        id: 3,
        name: 'new',
        categoryId: 1,
        unit: 'l',
        expirationDate: '2030-01-01',
      }),
    )
    applyRealtimeChange(
      client,
      change('inventory_items', 'INSERT', {
        id: 3,
        name: 'new again',
        categoryId: 1,
        unit: 'l',
        expirationDate: '2030-01-01',
      }),
    )
    expect(names(client)).toEqual(['1:item 1', '2:item 2', '3:new again'])
  })

  it('F-KB-16: a delete removes the row', () => {
    applyRealtimeChange(client, change('inventory_items', 'DELETE', { id: 2 }))
    expect(names(client)).toEqual(['1:item 1'])
  })

  it('an update for a row we do not have is ignored (it may be hidden by a held delete that can still be undone)', () => {
    applyRealtimeChange(client, change('inventory_items', 'UPDATE', { id: 9, name: 'ghost' }))
    expect(names(client)).toEqual(['1:item 1', '2:item 2'])
  })

  it('columns that are not part of the cached row (user_id and the like) never reach the cache', () => {
    applyRealtimeChange(
      client,
      change('inventory_items', 'INSERT', {
        id: 3,
        name: 'n',
        categoryId: 1,
        unit: 'l',
        expirationDate: '2030-01-01',
        userId: 'u',
        secretColumn: 1,
      }),
    )
    const row = client.getQueryData<Bootstrap>(queryKeys.bootstrap)?.items.find((i) => i.id === 3)
    expect(row).toBeDefined()
    expect(row).not.toHaveProperty('userId')
    expect(row).not.toHaveProperty('secretColumn')
  })

  it('an INSERT that lacks the columns a row needs is not shown from the event: the list is refetched', () => {
    const spy = vi.spyOn(client, 'invalidateQueries')
    applyRealtimeChange(client, change('inventory_items', 'INSERT', { id: 4, name: 'half' }))
    expect(names(client)).toEqual(['1:item 1', '2:item 2'])
    expect(spy).toHaveBeenCalledWith({ queryKey: ['bootstrap'] })
  })

  it('a row this device is changing right now is left alone: the answer to the write is the truth', async () => {
    onlineManager.setOnline(false) // keep the write pending
    api.patch.mockResolvedValue(item(1))
    startWrite(client, inventory.itemWrites.update, { id: 1, patch: { name: 'mine' } })
    applyRealtimeChange(
      client,
      change('inventory_items', 'UPDATE', { id: 1, name: 'theirs (older)' }),
    )
    expect(names(client)?.[0]).toBe('1:mine')
    applyRealtimeChange(client, change('inventory_items', 'UPDATE', { id: 2, name: 'other row' }))
    expect(names(client)?.[1]).toBe('2:other row')
    onlineManager.setOnline(true)
    await vi.waitFor(() => expect(api.patch).toHaveBeenCalled())
  })

  it('an insert while our own create is still pending is not added twice: the list is refetched instead', () => {
    onlineManager.setOnline(false)
    const spy = vi.spyOn(client, 'invalidateQueries')
    startWrite(client, inventory.itemWrites.create, {
      tempId: -1,
      body: {
        name: 'mine',
        categoryId: 1,
        quantity: 1,
        unit: 'l',
        expirationDate: '2030-01-01',
      } as never,
    })
    applyRealtimeChange(
      client,
      change('inventory_items', 'INSERT', {
        id: 50,
        name: 'mine',
        categoryId: 1,
        unit: 'l',
        expirationDate: '2030-01-01',
      }),
    )
    expect(names(client)).toEqual(['1:item 1', '2:item 2', '-1:mine'])
    expect(spy).toHaveBeenCalledWith({ queryKey: ['bootstrap'] })
  })

  it('an event from another device does not cancel the resync refetch that is on its way', async () => {
    let finish: (v: Bootstrap) => void = () => undefined
    const pending = client.fetchQuery({
      queryKey: queryKeys.bootstrap,
      staleTime: 0,
      queryFn: () => new Promise<Bootstrap>((r) => (finish = r)),
    })
    applyRealtimeChange(client, change('inventory_items', 'DELETE', { id: 2 }))
    finish(boot([item(1), item(2), item(3)]))
    await expect(pending).resolves.toBeDefined()
    expect(names(client)).toEqual(['1:item 1', '2:item 2', '3:item 3'])
  })

  it('a meal moved to another week by another device leaves the old week and shows in the new one', () => {
    const plan = (id: number, planDate: string) => ({
      id,
      planDate,
      mealType: 'dinner',
      mealName: 'x',
    })
    const a = queryKeys.meals('2030-01-01', '2030-01-07')
    const b = queryKeys.meals('2030-01-08', '2030-01-14')
    client.setQueryData(a, [plan(1, '2030-01-02')])
    client.setQueryData(b, [])
    applyRealtimeChange(client, change('meal_plans', 'UPDATE', plan(1, '2030-01-09')))
    expect(client.getQueryData(a)).toEqual([])
    expect(client.getQueryData<MealPlan[]>(b)?.map((m) => m.id)).toEqual([1])
  })

  it('shopping_list changes go to the shopping list, only if it is loaded', () => {
    applyRealtimeChange(
      client,
      change('shopping_list', 'INSERT', { id: 1, name: 'milk', isPurchased: false }),
    )
    expect(client.getQueryData(queryKeys.shopping)).toBeUndefined() // not loaded: nothing invented
    client.setQueryData<ShoppingItem[]>(queryKeys.shopping, [])
    applyRealtimeChange(
      client,
      change('shopping_list', 'INSERT', { id: 1, name: 'milk', isPurchased: false }),
    )
    applyRealtimeChange(client, change('shopping_list', 'UPDATE', { id: 1, isPurchased: true }))
    expect(client.getQueryData<ShoppingItem[]>(queryKeys.shopping)).toEqual([
      { id: 1, name: 'milk', isPurchased: true },
    ])
  })

  it('meal_plans changes reach every cached date range that covers them', () => {
    client.setQueryData<MealPlan[]>(queryKeys.meals('2030-01-01', '2030-01-07'), [])
    client.setQueryData<MealPlan[]>(queryKeys.meals('2030-02-01', '2030-02-07'), [])
    applyRealtimeChange(
      client,
      change('meal_plans', 'INSERT', {
        id: 5,
        planDate: '2030-01-03',
        mealType: 'dinner',
        mealName: 'Pasta',
      }),
    )
    expect(
      client.getQueryData<MealPlan[]>(queryKeys.meals('2030-01-01', '2030-01-07')),
    ).toHaveLength(1)
    expect(
      client.getQueryData<MealPlan[]>(queryKeys.meals('2030-02-01', '2030-02-07')),
    ).toHaveLength(0)
  })
})

describe('resyncFromServer', () => {
  it('after a reconnect the board, shopping list and meal plans are fetched again', () => {
    const spy = vi.spyOn(client, 'invalidateQueries')
    resyncFromServer(client)
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([
      ['bootstrap'],
      ['shopping-list'],
      ['meal-plans'],
    ])
  })
})
