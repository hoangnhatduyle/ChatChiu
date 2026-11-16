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
export type BoardChip = 'all' | 'use-soon' | 'running-low' | 'used-up'

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
  name: (a, b) => a.name.localeCompare(b.name),
  quantity: (a, b) => getRemainingQuantity(a) - getRemainingQuantity(b),
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

/** Board chips: Use soon = expiring today through +3 days; Running low excludes used-up items. */
export function boardFilter<T extends FilterableItem>(
  items: readonly T[],
  chip: BoardChip,
  today: string,
): T[] {
  switch (chip) {
    case 'all':
      return [...items]
    case 'use-soon':
      return items.filter((i) => {
        const s = expiryStatus(i.expirationDate, today)
        return s === 'today' || s === 'soon'
      })
    case 'running-low':
      return items.filter((i) => !isUsedUp(i) && isLowStock(i))
    case 'used-up':
      return items.filter((i) => isUsedUp(i))
    default:
      // An unknown chip (e.g. a hand-edited URL) shows everything.
      return [...items]
  }
}
