// SPEC-KB-001 board logic: columns per location, ordering, the amount text and the chip counts.
import { describe, expect, it } from 'vitest'
import {
  boardChipCounts,
  boardColumns,
  locationLabel,
  quantityLabel,
  type BoardItem,
} from './board.js'

const TODAY = '2030-06-10'
const item = (id: number, extra: Partial<BoardItem> = {}): BoardItem => ({
  id,
  name: `item ${id}`,
  categoryId: 1,
  locationId: 1,
  quantity: 1,
  unit: 'L',
  initialQuantity: 1,
  currentQuantity: 1,
  expirationDate: '2030-07-01',
  lowStockThreshold: null,
  notes: null,
  ...extra,
})
const fridge = { id: 1, name: 'Fridge', subLocation: 'Top shelf' }
const pantry = { id: 2, name: 'Pantry', subLocation: null }

describe('locationLabel', () => {
  it('F-KB-01: a sub-location reads "Fridge - Top shelf", a plain location just its name', () => {
    expect(locationLabel(fridge)).toBe('Fridge - Top shelf')
    expect(locationLabel(pantry)).toBe('Pantry')
  })
})

describe('boardColumns', () => {
  it('F-KB-01: one column per location, in the order given, each with its items', () => {
    const columns = boardColumns([item(1), item(2, { locationId: 2 })], [fridge, pantry])
    expect(columns.map((c) => [c.key, c.name, c.items.map((i) => i.id)])).toEqual([
      [1, 'Fridge - Top shelf', [1]],
      [2, 'Pantry', [2]],
    ])
  })

  it('F-KB-01: a location with no items still has its column (so its + works)', () => {
    expect(boardColumns([], [fridge, pantry]).map((c) => c.items.length)).toEqual([0, 0])
  })

  it('NC-KB-NO-HIDDEN-ITEMS: items with no location, or a deleted one, land in a last "No location" column', () => {
    const columns = boardColumns(
      [item(1), item(2, { locationId: null }), item(3, { locationId: 99 })],
      [fridge],
    )
    expect(columns.map((c) => c.name)).toEqual(['Fridge - Top shelf', 'No location'])
    expect(columns[1]?.key).toBeNull()
    expect(columns[1]?.items.map((i) => i.id).sort()).toEqual([2, 3])
  })

  it('F-KB-01: no "No location" column when every item has a location', () => {
    expect(boardColumns([item(1)], [fridge]).map((c) => c.name)).toEqual(['Fridge - Top shelf'])
  })

  it('NC-KB-NO-HIDDEN-ITEMS: every item appears exactly once', () => {
    const all = [
      item(1),
      item(2, { locationId: 2 }),
      item(3, { locationId: null }),
      item(4, { locationId: 7 }),
    ]
    const ids = boardColumns(all, [fridge, pantry]).flatMap((c) => c.items.map((i) => i.id))
    expect(ids.sort()).toEqual([1, 2, 3, 4])
  })

  it('F-KB-02: soonest expiry first, then by name', () => {
    const columns = boardColumns(
      [
        item(1, { name: 'b', expirationDate: '2030-07-02' }),
        item(2, { name: 'z', expirationDate: '2030-07-01' }),
        item(3, { name: 'a', expirationDate: '2030-07-02' }),
      ],
      [fridge],
    )
    expect(columns[0]?.items.map((i) => i.name)).toEqual(['z', 'a', 'b'])
  })

  it('never changes the list it was given', () => {
    const items = [item(2, { expirationDate: '2030-08-01' }), item(1)]
    boardColumns(items, [fridge])
    expect(items.map((i) => i.id)).toEqual([2, 1])
  })
})

describe('quantityLabel', () => {
  it('F-KB-05: 0.6 of 1 L reads "0.6 of 1 L"', () => {
    expect(
      quantityLabel({ quantity: 1, initialQuantity: 1, currentQuantity: 0.6, unit: 'L' }),
    ).toBe('0.6 of 1 L')
  })
  it('F-KB-05: falls back to quantity when the amounts are missing, and writes pieces as pcs', () => {
    expect(
      quantityLabel({ quantity: 4, initialQuantity: null, currentQuantity: null, unit: 'piece' }),
    ).toBe('4 of 4 pcs')
  })
})

describe('boardChipCounts', () => {
  it('F-KB-12: counts for All, Use soon, Running low and Used up', () => {
    const items = [
      item(1, { expirationDate: TODAY }),
      item(2, { expirationDate: '2030-06-12' }),
      item(3, { currentQuantity: 0.15 }),
      item(4, { currentQuantity: 0 }),
    ]
    expect(boardChipCounts(items, TODAY)).toEqual({
      all: 4,
      'use-soon': 2,
      'running-low': 1,
      'used-up': 1,
    })
  })
})
