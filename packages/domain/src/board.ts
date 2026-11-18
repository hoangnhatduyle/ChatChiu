// Kitchen board logic (SPEC-KB-001): which column each item is in, the order inside a column, the
// amount text and the chip counts. Pure; the filters and the expiry/low-stock rules it builds on live
// in filter.ts, expiry.ts and low-stock.ts (AR-ONE-DEFINITION).
import {
  boardFilter,
  compareByExpiryThenName,
  type BoardChip,
  type FilterableItem,
} from './filter.js'
import {
  getFullQuantity,
  getRemainingQuantity,
  roundQuantity,
  type QuantityFields,
} from './quantity.js'

export interface BoardItem extends FilterableItem {
  unit: string
}

export interface BoardLocation {
  id: number
  name: string
  subLocation: string | null
}

export interface BoardColumn<T extends FilterableItem> {
  /** The location id, or null for the "No location" column. */
  key: number | null
  name: string
  items: T[]
}

export const NO_LOCATION_NAME = 'No location'
const PIECE_UNIT = 'piece'
const PIECE_LABEL = 'pcs'

/** "Fridge - Top shelf", or just "Pantry" (F-KB-01). */
export function locationLabel(location: Pick<BoardLocation, 'name' | 'subLocation'>): string {
  return location.subLocation ? `${location.name} - ${location.subLocation}` : location.name
}

/**
 * One column per location, in the order given, each sorted soonest expiry first then by name (F-KB-02).
 * Items with no location, or one that no longer exists, go to a last "No location" column that exists
 * only when needed, so no item is ever missing from the board (NC-KB-NO-HIDDEN-ITEMS).
 */
export function boardColumns<T extends FilterableItem>(
  items: readonly T[],
  locations: readonly BoardLocation[],
): BoardColumn<T>[] {
  const known = new Set(locations.map((l) => l.id))
  const columns: BoardColumn<T>[] = locations.map((location) => ({
    key: location.id,
    name: locationLabel(location),
    items: items.filter((i) => i.locationId === location.id).sort(compareByExpiryThenName),
  }))
  const orphans = items
    .filter((i) => i.locationId === null || !known.has(i.locationId))
    .sort(compareByExpiryThenName)
  return orphans.length > 0
    ? [...columns, { key: null, name: NO_LOCATION_NAME, items: orphans }]
    : columns
}

const fmt = (value: number): string => String(roundQuantity(value))

/** "0.6 of 1 L" (F-KB-05): what is left of the full amount. */
export function quantityLabel(
  item: Pick<QuantityFields, 'quantity' | 'initialQuantity' | 'currentQuantity'> & { unit: string },
): string {
  const unit = item.unit === PIECE_UNIT ? PIECE_LABEL : item.unit
  return `${fmt(getRemainingQuantity(item))} of ${fmt(getFullQuantity(item))} ${unit}`
}

const CHIPS: readonly BoardChip[] = ['all', 'use-soon', 'running-low', 'used-up']

/** How many items each header chip would show (F-KB-12). */
export function boardChipCounts<T extends FilterableItem>(
  items: readonly T[],
  today: string,
): Record<BoardChip, number> {
  const counts: Record<BoardChip, number> = {
    all: 0,
    'use-soon': 0,
    'running-low': 0,
    'used-up': 0,
  }
  for (const chip of CHIPS) counts[chip] = boardFilter(items, chip, today).length
  return counts
}

export { CHIPS as BOARD_CHIPS }
