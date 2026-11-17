// Writes changes made on another device into the cache (step 4.6, F-KB-16). core/realtime.ts delivers
// typed changes; nothing here talks to Supabase. Rules, from the way writes work (data/write.ts):
//  - a row this device is changing right now (a write on its scope is pending) is left alone: the
//    server's answer to that write is the truth and will replace it, and an older event must not
//    undo what the user just did;
//  - INSERT adds the row (or replaces it: our own create's event can arrive before its answer);
//  - UPDATE changes a row we have, and ignores one we do not (it may be hidden by a pending delete
//    undo, or not loaded; a missed insert is repaired by the resync after a reconnect);
//  - DELETE removes it.
import type { InventoryItem, MealPlan, ShoppingItem } from '@chatchiu/contracts'
import type { QueryClient } from '@tanstack/react-query'
import type { RealtimeChange, RealtimeTable } from '../core/realtime'
import { bootstrapStore } from './inventory'
import { mealStore } from './meals'
import { queryKeys } from './query'
import { queryListStore, type ListStore, type Row } from './resource'

const itemsStore = bootstrapStore('items')
const shoppingStore = queryListStore<ShoppingItem>(queryKeys.shopping)

/** Which write scope guards each table's rows (the names defineResource and the inventory writes use). */
const SCOPE_PREFIX: Record<RealtimeTable, string> = {
  inventory_items: 'inventory',
  shopping_list: 'shopping',
  meal_plans: 'meals',
}

/** Creates for each table (data/resource.ts and data/inventory.ts write keys). */
const CREATE_KEYS: Record<RealtimeTable, readonly string[]> = {
  inventory_items: ['inventory/create', 'inventory/bulk-create'],
  shopping_list: ['shopping/create'],
  meal_plans: ['meals/create'],
}

function hasPendingCreate(client: QueryClient, table: RealtimeTable): boolean {
  return client
    .getMutationCache()
    .getAll()
    .some(
      (m) =>
        m.state.status === 'pending' &&
        CREATE_KEYS[table].includes(String(m.options.mutationKey?.[1])),
    )
}

function hasPendingWrite(client: QueryClient, table: RealtimeTable, id: number): boolean {
  const scope = `${SCOPE_PREFIX[table]}:${id}`
  return client
    .getMutationCache()
    .getAll()
    .some((m) => m.state.status === 'pending' && m.options.scope?.id === scope)
}

/**
 * The columns each table's cached row has (the contracts' camelCase shape). A change from the socket is
 * the raw database row: anything else (user_id, internal columns) is dropped before it reaches the cache,
 * and so before it is saved to IndexedDB.
 */
const ROW_FIELDS: Record<RealtimeTable, readonly string[]> = {
  inventory_items: [
    'id',
    'name',
    'categoryId',
    'quantity',
    'unit',
    'purchaseDate',
    'expirationDate',
    'locationId',
    'price',
    'notes',
    'notificationEnabled',
    'notificationDaysBefore',
    'barcode',
    'initialQuantity',
    'currentQuantity',
    'usageNotes',
    'lowStockThreshold',
    'lastNotifiedAt',
    'lowStockNotifiedAt',
    'createdAt',
    'updatedAt',
  ] satisfies Array<keyof InventoryItem>,
  shopping_list: [
    'id',
    'name',
    'quantity',
    'notes',
    'categoryId',
    'isPurchased',
    'createdAt',
  ] satisfies Array<keyof ShoppingItem>,
  meal_plans: [
    'id',
    'planDate',
    'mealType',
    'mealName',
    'recipeId',
    'isFavorite',
    'notes',
    'createdAt',
    'updatedAt',
  ] satisfies Array<keyof MealPlan>,
}
/** A new row must carry these, or it is not shown from the event: the list is refetched instead. */
const REQUIRED_FOR_INSERT: Record<RealtimeTable, readonly string[]> = {
  inventory_items: ['name', 'categoryId', 'unit', 'expirationDate'],
  shopping_list: ['name', 'isPurchased'],
  meal_plans: ['planDate', 'mealType', 'mealName'],
}
const LIST_KEY: Record<RealtimeTable, readonly unknown[]> = {
  inventory_items: queryKeys.bootstrap,
  shopping_list: queryKeys.shopping,
  meal_plans: ['meal-plans'],
}

function clean(change: RealtimeChange): Record<string, unknown> {
  const allowed = new Set(ROW_FIELDS[change.table])
  return Object.fromEntries(Object.entries(change.row).filter(([key]) => allowed.has(key)))
}

function apply<T extends Row>(store: ListStore<T>, client: QueryClient, change: RealtimeChange) {
  const rows = store.read(client)
  const exists = rows.some((r) => r.id === change.row.id)
  if (change.type === 'DELETE') {
    if (exists)
      store.write(
        client,
        rows.filter((r) => r.id !== change.row.id),
        { cancelFetch: false },
      )
    return
  }
  const fields = clean(change)
  if (
    change.type === 'INSERT' &&
    !REQUIRED_FOR_INSERT[change.table].every((key) => key in fields)
  ) {
    void client.invalidateQueries({ queryKey: LIST_KEY[change.table] }) // incomplete: ask the server
    return
  }
  const incoming = fields as unknown as T
  // A meal moved into a week we show is new to that week; for the other tables a row we do not have may
  // be hidden by a held delete, or not loaded, and a missed insert is repaired by the resync.
  if (change.type === 'UPDATE' && !exists && change.table !== 'meal_plans') return
  if (
    change.type === 'UPDATE' &&
    !exists &&
    !REQUIRED_FOR_INSERT[change.table].every((key) => key in fields)
  ) {
    return
  }
  store.write(
    client,
    exists
      ? rows.map((r) => (r.id === incoming.id ? { ...r, ...incoming } : r))
      : [...rows, incoming],
    { cancelFetch: false }, // it comes from the server: a fetch on its way is still right
  )
}

export function applyRealtimeChange(client: QueryClient, change: RealtimeChange): void {
  if (hasPendingWrite(client, change.table, change.row.id)) return
  if (change.type === 'INSERT' && hasPendingCreate(client, change.table)) {
    // Probably the echo of our own create, which would show twice until the server answers; if it is
    // another device's row the refetch brings it (the answer to our create then keeps one copy of each).
    void client.invalidateQueries({ queryKey: LIST_KEY[change.table] })
    return
  }
  switch (change.table) {
    case 'inventory_items':
      return apply<InventoryItem>(itemsStore, client, change)
    case 'shopping_list':
      return apply<ShoppingItem>(shoppingStore, client, change)
    case 'meal_plans':
      return apply<MealPlan>(mealStore, client, change)
  }
}

/** After a reconnect: what was missed is fetched again (only the lists that are on screen refetch at once). */
export function resyncFromServer(client: QueryClient): void {
  for (const queryKey of [queryKeys.bootstrap, queryKeys.shopping, ['meal-plans']]) {
    void client.invalidateQueries({ queryKey })
  }
}
