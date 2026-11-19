import { describe, expect, it } from 'vitest'
import { addDays } from './dates.js'
import {
  BOARD_TILES,
  boardTileFilter,
  compareByUrgency,
  countByStatus,
  filterItems,
  groupItems,
} from './filter.js'

const today = '2026-11-16'
const base = { quantity: 1, initialQuantity: 1, currentQuantity: 1, lowStockThreshold: 20 }
const items = [
  {
    ...base,
    id: 1,
    name: 'Oat milk',
    notes: null,
    barcode: null,
    categoryId: 10,
    locationId: 1,
    expirationDate: '2026-11-15',
  },
  {
    ...base,
    id: 2,
    name: 'Bread',
    notes: 'oat loaf',
    barcode: null,
    categoryId: 11,
    locationId: 2,
    expirationDate: '2026-11-18',
    currentQuantity: 0.1,
  },
  {
    ...base,
    id: 3,
    name: 'Rice',
    notes: null,
    barcode: '0oat99',
    categoryId: 10,
    locationId: null,
    expirationDate: '2027-06-01',
    currentQuantity: 0,
  },
  {
    ...base,
    id: 4,
    name: 'apples',
    notes: null,
    barcode: null,
    categoryId: 10,
    locationId: 1,
    expirationDate: '2026-11-18',
    currentQuantity: 0.5,
  },
]

describe('inventory filters (ported applyFilters, F-IN-01…03, F-IN-07)', () => {
  it('F-IN-01: search matches name and notes, not the barcode', () => {
    expect(filterItems(items, { q: 'OAT' }, today).map((i) => i.id)).toEqual([1, 2])
  })

  it('F-IN-02: category + location + expiring (within 3 days)', () => {
    const result = filterItems(items, { categoryId: 10, locationId: 1, status: 'expiring' }, today)
    expect(result.map((i) => i.id)).toEqual([4])
  })

  it('status expired / fresh', () => {
    expect(filterItems(items, { status: 'expired' }, today).map((i) => i.id)).toEqual([1])
    expect(filterItems(items, { status: 'fresh' }, today).map((i) => i.id)).toEqual([3])
  })

  it('F-IN-03: sort by expiry (then name), name, quantity left and recently added', () => {
    expect(filterItems(items, { sort: 'expiry' }, today).map((i) => i.id)).toEqual([1, 4, 2, 3])
    expect(filterItems(items, { sort: 'name' }, today).map((i) => i.id)).toEqual([4, 2, 1, 3])
    expect(filterItems(items, { sort: 'quantity' }, today).map((i) => i.id)).toEqual([3, 2, 4, 1])
    expect(filterItems(items, { sort: 'recent' }, today).map((i) => i.id)).toEqual([4, 3, 2, 1])
  })

  it('ties in name or quantity sort fall back to the id, whatever order the list arrives in', () => {
    const twins = [
      { ...items[0]!, id: 9, name: 'Twin' },
      { ...items[0]!, id: 3, name: 'Twin' },
      { ...items[0]!, id: 5, name: 'Twin' },
    ]
    for (const sort of ['name', 'quantity'] as const) {
      expect(filterItems(twins, { sort }, today).map((i) => i.id)).toEqual([3, 5, 9])
      expect(filterItems([...twins].reverse(), { sort }, today).map((i) => i.id)).toEqual([3, 5, 9])
    }
  })

  it('does not mutate its input', () => {
    const copy = [...items]
    filterItems(items, { sort: 'name' }, today)
    expect(items).toEqual(copy)
  })

  it('F-IN-07: counts expired and expiring', () => {
    expect(countByStatus(items, today)).toEqual({ expired: 1, expiring: 2, fresh: 1 })
  })

  it('F-IN-04: groups by category or location, keeping no-location items', () => {
    expect(groupItems(items, 'none')).toEqual([{ key: null, items }])
    const byLocation = groupItems(items, 'location')
    expect(byLocation.map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([
      [1, [1, 4]],
      [2, [2]],
      [null, [3]],
    ])
    expect(groupItems(items, 'category').map((g) => g.key)).toEqual([10, 11])
  })
})

describe('board tiles (F-KB-12: Expired · Use today · Running low · Fresh)', () => {
  // today = 2026-11-16: 1 expired yesterday, 2 is 2 days out and low, 3 is used up, 4 is 2 days out.
  const ids = (tile: Parameters<typeof boardTileFilter>[1]) =>
    boardTileFilter(items, tile, today).map((i) => i.id)

  it('Expired is already past its date; Use today is today through 3 days; Running low is low and not used up', () => {
    expect(ids('expired')).toEqual([1])
    expect(ids('today')).toEqual([2, 4])
    expect(ids('low')).toEqual([2])
  })

  it('Fresh is the rest: not expired, not in the 3 days, not running low', () => {
    expect(ids('fresh')).toEqual([3])
  })

  it('boundaries: -1 is expired, 0 and 3 are Use today, 4 is fresh', () => {
    const day = (n: number, extra = {}) => ({
      ...base,
      id: 50 + n,
      name: `d${n}`,
      notes: null,
      categoryId: 10,
      locationId: 1,
      expirationDate: addDays(today, n),
      ...extra,
    })
    const edge = [day(-1), day(0), day(3), day(4)]
    const pick = (tile: Parameters<typeof boardTileFilter>[1]) =>
      boardTileFilter(edge, tile, today).map((i) => i.name)
    expect(pick('expired')).toEqual(['d-1'])
    expect(pick('today')).toEqual(['d0', 'd3'])
    expect(pick('fresh')).toEqual(['d4'])
  })

  it('a low item can also be expired or in the 3 days (the tiles may overlap)', () => {
    const lowExpired = { ...items[0]!, currentQuantity: 0.1 }
    expect(boardTileFilter([lowExpired], 'expired', today)).toHaveLength(1)
    expect(boardTileFilter([lowExpired], 'low', today)).toHaveLength(1)
    expect(boardTileFilter([lowExpired], 'fresh', today)).toHaveLength(0)
  })

  it('a low item far from its date is Running low, not Fresh; a used-up one far from its date is Fresh', () => {
    const lowFar = { ...items[0]!, expirationDate: '2027-06-01', currentQuantity: 0.1 }
    const usedUpFar = { ...items[0]!, id: 9, expirationDate: '2027-06-01', currentQuantity: 0 }
    expect(boardTileFilter([lowFar], 'fresh', today)).toHaveLength(0)
    expect(boardTileFilter([lowFar], 'low', today)).toHaveLength(1)
    expect(boardTileFilter([usedUpFar], 'low', today)).toHaveLength(0)
    expect(boardTileFilter([usedUpFar], 'fresh', today)).toHaveLength(1)
  })

  it('the four tiles together cover every item', () => {
    for (const set of [items, [{ ...items[0]!, currentQuantity: 0.1 }]]) {
      const covered = new Set(
        BOARD_TILES.flatMap((tile) => boardTileFilter(set, tile, today).map((i) => i.id)),
      )
      expect(covered.size).toBe(set.length)
    }
  })

  it('an unknown tile (e.g. from a URL) shows everything instead of nothing', () => {
    expect(boardTileFilter(items, 'bogus' as 'fresh', today)).toHaveLength(4)
  })
})

describe('urgency order (F-KB-02: expired, then use today, then low, then soonest)', () => {
  const mk = (id: number, days: number, extra = {}) => ({
    ...base,
    id,
    name: `n${id}`,
    notes: null,
    categoryId: 10,
    locationId: 1,
    expirationDate: addDays(today, days),
    ...extra,
  })
  it('orders by rank, then expiry, then name', () => {
    const list = [
      mk(1, 90),
      mk(2, 40, { currentQuantity: 0.1 }),
      mk(3, 2),
      mk(4, -5),
      mk(5, 0),
      mk(6, 30),
      mk(7, -1, { currentQuantity: 0.1 }),
    ]
    const sorted = [...list].sort(compareByUrgency(today)).map((i) => i.id)
    // expired (-5, -1), use today (0, 2), low (40), the rest soonest first (30, 90)
    expect(sorted).toEqual([4, 7, 5, 3, 2, 6, 1])
  })
})
