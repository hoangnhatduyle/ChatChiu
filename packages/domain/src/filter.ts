// Inventory and board filters. Ported from applyFilters() in
// OLD/src/app/components/inventory-list/inventory-list.ts (lines 245–339), with
// the barcode left out of search (D3, F-IN-01) and a name tie-break on expiry
// sort (F-KB-02). Pure: never mutates its input.
import { expiryFilterStatus, expiryStatus, type ExpiryFilterStatus } from './expiry.js'
import { isLowStock, type LowStockFields } from './low-stock.js'
import { getRemainingQuantity, isUsedUp } from './quantity.js'

export interface FilterableItem extends LowStockFields {
  id: number
  name: string
  notes?: string | null
  categoryId: number
  locationId: number | null
  expirationDate: string
}

export type StatusFilter = 'all' | ExpiryFilterStatus
export type SortKey = 'expiry' | 'name' | 'quantity' | 'recent'
export type GroupKey = 'none' | 'category' | 'location'
/** The four tiles on the Kitchen board. They cover every item; Running low may overlap the others. */
export type BoardTile = 'expired' | 'today' | 'low' | 'fresh'
export const BOARD_TILES: readonly BoardTile[] = ['expired', 'today', 'low', 'fresh']

export interface InventoryFilters {
  q?: string
  categoryId?: number | null
  locationId?: number | null
  status?: StatusFilter
  sort?: SortKey
}

function matchesSearch(item: FilterableItem, q: string): boolean {
  const query = q.trim().toLowerCase()
  if (!query) return true
  return (
    item.name.toLowerCase().includes(query) || (item.notes?.toLowerCase().includes(query) ?? false)
  )
}

export function compareByExpiryThenName(a: FilterableItem, b: FilterableItem): number {
  return a.expirationDate.localeCompare(b.expirationDate) || a.name.localeCompare(b.name)
}

const COMPARATORS: Record<SortKey, (a: FilterableItem, b: FilterableItem) => number> = {
  expiry: compareByExpiryThenName,
  // Ties fall back to the id, so the order never depends on how the list happened to arrive.
  name: (a, b) => a.name.localeCompare(b.name) || a.id - b.id,
  quantity: (a, b) => getRemainingQuantity(a) - getRemainingQuantity(b) || a.id - b.id,
  recent: (a, b) => b.id - a.id,
}

export function filterItems<T extends FilterableItem>(
  items: readonly T[],
  filters: InventoryFilters,
  today: string,
): T[] {
  const { q = '', categoryId, locationId, status = 'all', sort } = filters
  const filtered = items.filter(
    (item) =>
      matchesSearch(item, q) &&
      (categoryId == null || item.categoryId === categoryId) &&
      (locationId == null || item.locationId === locationId) &&
      (status === 'all' || expiryFilterStatus(item.expirationDate, today) === status),
  )
  return sort ? filtered.sort(COMPARATORS[sort]) : filtered
}

export function countByStatus(
  items: readonly FilterableItem[],
  today: string,
): Record<ExpiryFilterStatus, number> {
  const counts: Record<ExpiryFilterStatus, number> = { expired: 0, expiring: 0, fresh: 0 }
  for (const item of items) counts[expiryFilterStatus(item.expirationDate, today)] += 1
  return counts
}

/** Groups in order of first appearance; the null group (no location/category) comes last. */
export function groupItems<T extends FilterableItem>(
  items: readonly T[],
  by: GroupKey,
): Array<{ key: number | null; items: T[] }> {
  if (by === 'none') return [{ key: null, items: [...items] }]
  const groups = new Map<number | null, T[]>()
  for (const item of items) {
    const key = by === 'category' ? item.categoryId : item.locationId
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  const entries = [...groups.entries()].map(([key, list]) => ({ key, items: list }))
  return [...entries.filter((g) => g.key !== null), ...entries.filter((g) => g.key === null)]
}

const isExpiredOn = (i: FilterableItem, today: string) =>
  expiryStatus(i.expirationDate, today) === 'expired'
/** Use today = today through USE_SOON_DAYS (3) days from now. */
const isUseTodayOn = (i: FilterableItem, today: string) => {
  const s = expiryStatus(i.expirationDate, today)
  return s === 'today' || s === 'soon'
}
const isRunningLow = (i: FilterableItem) => !isUsedUp(i) && isLowStock(i)

/**
 * Board tiles (F-KB-12): Expired = past its date; Use today = today through 3 days; Running low = low and not
 * used up (it can also be Expired or Use today); Fresh = the rest, so every item is on at least one tile.
 */
export function boardTileFilter<T extends FilterableItem>(
  items: readonly T[],
  tile: BoardTile,
  today: string,
): T[] {
  switch (tile) {
    case 'expired':
      return items.filter((i) => isExpiredOn(i, today))
    case 'today':
      return items.filter((i) => isUseTodayOn(i, today))
    case 'low':
      return items.filter((i) => isRunningLow(i))
    case 'fresh':
      return items.filter(
        (i) => !isExpiredOn(i, today) && !isUseTodayOn(i, today) && !isRunningLow(i),
      )
    default:
      // An unknown tile (e.g. a hand-edited URL) shows everything.
      return [...items]
  }
}

/** Urgency rank: 0 expired, 1 use today, 2 running low, 3 the rest. */
function urgencyRank(i: FilterableItem, today: string): number {
  if (isExpiredOn(i, today)) return 0
  if (isUseTodayOn(i, today)) return 1
  return isRunningLow(i) ? 2 : 3
}

/** Most urgent first (F-KB-02): expired, then use today, then low, then soonest; ties by expiry, then name. */
export function compareByUrgency(today: string): (a: FilterableItem, b: FilterableItem) => number {
  return (a, b) => urgencyRank(a, today) - urgencyRank(b, today) || compareByExpiryThenName(a, b)
}
