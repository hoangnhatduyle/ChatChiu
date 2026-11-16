import { describe, expect, it } from 'vitest'
import { boardFilter, countByStatus, filterItems, groupItems } from './filter.js'

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

describe('board chips (F-KB-12: All · Use soon · Running low · Used up)', () => {
  it('filters by chip', () => {
    expect(boardFilter(items, 'all', today)).toHaveLength(4)
    expect(boardFilter(items, 'use-soon', today).map((i) => i.id)).toEqual([2, 4])
    expect(boardFilter(items, 'running-low', today).map((i) => i.id)).toEqual([2])
    expect(boardFilter(items, 'used-up', today).map((i) => i.id)).toEqual([3])
  })

  it('an unknown chip (e.g. from a URL) shows everything instead of undefined', () => {
    expect(boardFilter(items, 'bogus' as 'all', today)).toHaveLength(4)
  })
})
