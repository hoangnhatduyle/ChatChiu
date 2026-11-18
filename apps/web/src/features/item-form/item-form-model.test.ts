// The item form's pure rules (SPEC-IF-001): validation, the create body, the edit patch, suggestions.
import type { InventoryItem } from '@chatchiu/contracts'
import { describe, expect, it } from 'vitest'
import {
  createBody,
  formValuesFromItem,
  newFormValues,
  suggestNames,
  updatePatch,
  validate,
} from './item-form-model'

const item = (extra: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 5,
  userId: 'u',
  name: 'Milk',
  categoryId: 1,
  quantity: 10,
  unit: 'L',
  purchaseDate: '2030-01-01',
  expirationDate: '2030-02-01',
  locationId: 1,
  price: 0.4,
  notes: null,
  notificationEnabled: true,
  notificationDaysBefore: 3,
  barcode: null,
  initialQuantity: 10,
  currentQuantity: 4,
  usageNotes: null,
  lowStockThreshold: null,
  lastNotifiedAt: null,
  createdAt: 'x',
  updatedAt: 'x',
  ...extra,
})

const valid = () => ({
  ...newFormValues({ today: '2030-01-01', locationId: 1 }),
  name: 'Butter',
  categoryId: 1,
  expirationDate: '2030-01-31',
})

describe('validate', () => {
  it('a complete new item has no problems', () => {
    expect(validate(valid(), 'add')).toEqual({})
  })

  it('reports each missing field at its own key', () => {
    const errors = validate(
      { ...valid(), name: ' ', categoryId: null, locationId: null, expirationDate: null },
      'add',
    )
    expect(Object.keys(errors).sort()).toEqual(['category', 'expiry', 'location', 'name'])
  })

  it('refuses quantity 0, text, and above the limit', () => {
    for (const quantity of ['0', 'abc', '', '-1', '1e12']) {
      expect(validate({ ...valid(), quantity }, 'add').quantity).toBeDefined()
    }
    expect(validate({ ...valid(), quantity: '2,5' }, 'add').quantity).toBeUndefined()
  })

  it('a unit outside the list is refused, unless the item already had it', () => {
    expect(validate({ ...valid(), unit: 'bucket' }, 'add').unit).toBeDefined()
    const old = formValuesFromItem(item({ unit: 'bucket' }))
    expect(validate(old, 'edit', item({ unit: 'bucket' })).unit).toBeUndefined()
  })

  it('days before must be a whole number from 0 to 365 and the threshold 0 to 100', () => {
    expect(validate({ ...valid(), daysBefore: '2.5' }, 'add').daysBefore).toBeDefined()
    expect(validate({ ...valid(), daysBefore: '366' }, 'add').daysBefore).toBeDefined()
    expect(validate({ ...valid(), lowStock: '101' }, 'add').lowStock).toBeDefined()
    expect(validate({ ...valid(), daysBefore: '0', lowStock: '0' }, 'add')).toEqual({})
  })

  it('edit: left now may not exceed the full amount', () => {
    const values = { ...formValuesFromItem(item()), leftNow: '11' }
    expect(validate(values, 'edit').leftNow).toMatch(/more than the full amount/)
  })
})

describe('createBody', () => {
  it('stores the price per unit and starts full (NC-IF-PER-UNIT)', () => {
    const body = createBody({ ...valid(), quantity: '10', totalPrice: '4.00' })
    expect(body.price).toBeCloseTo(0.4, 9)
    expect(body.initialQuantity).toBe(10)
    expect(body.currentQuantity).toBe(10)
  })

  it('no total means no price; empty notes mean null', () => {
    const body = createBody({ ...valid(), totalPrice: '', notes: '  ' })
    expect(body.price).toBeNull()
    expect(body.notes).toBeNull()
  })
})

describe('updatePatch (NC-IF-NO-SILENT-QTY)', () => {
  it('shows the total again: price x full amount', () => {
    expect(formValuesFromItem(item()).totalPrice).toBe('4.00')
  })

  it('an untouched form is an empty patch', () => {
    expect(updatePatch(formValuesFromItem(item()), item())).toEqual({})
  })

  it('a new full amount re-divides the same total and never sends the amount left', () => {
    const patch = updatePatch({ ...formValuesFromItem(item()), fullAmount: '20' }, item())
    expect(patch).toMatchObject({ initialQuantity: 20, quantity: 20 })
    expect(patch.price).toBeCloseTo(0.2, 9)
    expect(patch).not.toHaveProperty('currentQuantity')
  })

  it('a new amount left sends only that', () => {
    const patch = updatePatch({ ...formValuesFromItem(item()), leftNow: '7' }, item())
    expect(patch).toEqual({ currentQuantity: 7 })
  })

  it('clearing the notes or the total sends null', () => {
    const before = item({ notes: 'x' })
    const patch = updatePatch({ ...formValuesFromItem(before), notes: '', totalPrice: '' }, before)
    expect(patch).toEqual({ notes: null, price: null })
  })

  it('a missing threshold reads as 20: leaving 20 sends nothing, 30 sends 30', () => {
    const values = formValuesFromItem(item())
    expect(values.lowStock).toBe('20')
    expect(updatePatch({ ...values, lowStock: '30' }, item())).toEqual({ lowStockThreshold: 30 })
  })
})

describe('suggestNames', () => {
  const names = ['Milk', 'Mint', 'milk ', 'Almond milk', 'Rice']
  it('needs two letters, lists distinct matches, starting-with first, never the typed name', () => {
    expect(suggestNames('M', names)).toEqual([])
    expect(suggestNames('mi', names)).toEqual(['Milk', 'Mint', 'Almond milk'])
    expect(suggestNames('milk', names)).toEqual(['Almond milk'])
  })
})

describe('review fixes', () => {
  it('a null amount left is said out loud when the full amount changes', () => {
    const open = item({ currentQuantity: null })
    const patch = updatePatch(
      { ...formValuesFromItem(open), fullAmount: '20', leftNow: '10' },
      open,
    )
    expect(patch).toMatchObject({ initialQuantity: 20, currentQuantity: 10 })
  })

  it('an untouched total scales the stored price exactly (no drift through the rounded text)', () => {
    const odd = item({ quantity: 3, initialQuantity: 3, currentQuantity: 3, price: 1.234 })
    const patch = updatePatch({ ...formValuesFromItem(odd), fullAmount: '6', leftNow: '3' }, odd)
    expect(patch.price).toBeCloseTo(0.617, 9)
  })

  it('retyping the same total as "4" is not a price change', () => {
    const third = item({ quantity: 3, initialQuantity: 3, currentQuantity: 3, price: 4 / 3 })
    const values = { ...formValuesFromItem(third), totalPrice: '4' }
    expect(updatePatch(values, third)).toEqual({})
  })
})
