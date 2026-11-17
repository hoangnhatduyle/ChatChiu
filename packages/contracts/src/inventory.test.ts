import { describe, expect, it } from 'vitest'
import {
  BULK_MAX,
  bulkCreate,
  bulkDelete,
  inventoryItemCreate,
  inventoryItemUpdate,
  restock,
  usageLog,
  usageUndo,
} from './inventory.js'

// Fixture ids are arbitrary: contract tests never rely on seeded categories
// or locations (AC-DATA-07, CS-NO-SEEDED-CATEGORIES).
const validItem = {
  name: 'Eggs',
  categoryId: 9001,
  quantity: 10,
  unit: 'piece',
  expirationDate: '2026-12-01',
}

describe('inventoryItemCreate', () => {
  it('applies the create defaults for notifications', () => {
    const parsed = inventoryItemCreate.parse(validItem)
    expect(parsed.notificationEnabled).toBe(true)
    expect(parsed.notificationDaysBefore).toBe(3)
  })

  it.each([
    ['missing name', { ...validItem, name: '' }],
    ['bad expiry format', { ...validItem, expirationDate: '01/12/2026' }],
    ['negative quantity', { ...validItem, quantity: -1 }],
    ['non-positive category', { ...validItem, categoryId: 0 }],
  ])('rejects %s', (_label, body) => {
    expect(inventoryItemCreate.safeParse(body).success).toBe(false)
  })

  it('coerces numeric strings like the old API did', () => {
    const parsed = inventoryItemCreate.parse({ ...validItem, quantity: '2.5', categoryId: '7' })
    expect(parsed.quantity).toBe(2.5)
    expect(parsed.categoryId).toBe(7)
  })
})

describe('inventoryItemUpdate', () => {
  it('AC-API-03: an empty PATCH body parses to {} (no injected notification defaults)', () => {
    expect(inventoryItemUpdate.parse({})).toEqual({})
  })

  it('AC-API-03: a one-field PATCH keeps only that field', () => {
    expect(inventoryItemUpdate.parse({ notes: 'top shelf' })).toEqual({ notes: 'top shelf' })
  })
})

describe('usageLog / usageUndo', () => {
  it('AC-API-07: accepts the old usage body { amountUsed, currentQuantity, notes? }', () => {
    expect(usageLog.parse({ amountUsed: 0.5, currentQuantity: 0.1 })).toEqual({
      amountUsed: 0.5,
      currentQuantity: 0.1,
    })
  })

  it('AC-API-07: rejects a negative remaining amount', () => {
    expect(usageLog.safeParse({ amountUsed: 0.5, currentQuantity: -0.1 }).success).toBe(false)
  })

  it('AC-API-07: usage-undo needs a positive usageId', () => {
    expect(usageUndo.parse({ usageId: '42' })).toEqual({ usageId: 42 })
    expect(usageUndo.safeParse({}).success).toBe(false)
  })
})

describe('restock', () => {
  it('AC-API-08: accepts { quantity, totalPrice } with an optional expiry', () => {
    expect(restock.parse({ quantity: 2, totalPrice: 5 })).toEqual({ quantity: 2, totalPrice: 5 })
    expect(restock.parse({ quantity: 1, expirationDate: '2026-12-24' }).expirationDate).toBe(
      '2026-12-24',
    )
  })

  it('AC-API-08: rejects a zero or missing amount', () => {
    expect(restock.safeParse({ quantity: 0 }).success).toBe(false)
    expect(restock.safeParse({}).success).toBe(false)
  })

  it('AC-API-08: bounds the amount and the total so the maths cannot overflow', () => {
    expect(restock.safeParse({ quantity: 1e10 }).success).toBe(false)
    expect(restock.safeParse({ quantity: 1, totalPrice: 1e10 }).success).toBe(false)
  })

  it('AC-API-08: carries no defaults, so absent fields stay absent', () => {
    expect(restock.parse({ quantity: 3 })).toEqual({ quantity: 3 })
  })
})

describe('bulkCreate', () => {
  it('AC-API-09: accepts N valid items', () => {
    const parsed = bulkCreate.parse({ items: [validItem, { ...validItem, name: 'Milk' }] })
    expect(parsed.items).toHaveLength(2)
  })

  it('AC-API-09: one invalid item rejects the whole request', () => {
    const result = bulkCreate.safeParse({ items: [validItem, { ...validItem, unit: '' }] })
    expect(result.success).toBe(false)
  })

  it('AC-API-09: rejects an empty list and more than BULK_MAX items', () => {
    expect(bulkCreate.safeParse({ items: [] }).success).toBe(false)
    const tooMany = Array.from({ length: BULK_MAX + 1 }, () => validItem)
    expect(bulkCreate.safeParse({ items: tooMany }).success).toBe(false)
  })
})

describe('bulkDelete', () => {
  it('AC-API-10: accepts a list of positive ids', () => {
    expect(bulkDelete.parse({ ids: [3, '4'] })).toEqual({ ids: [3, 4] })
  })

  it('AC-API-10: rejects an empty list or a non-positive id', () => {
    expect(bulkDelete.safeParse({ ids: [] }).success).toBe(false)
    expect(bulkDelete.safeParse({ ids: [1, 0] }).success).toBe(false)
  })
})
