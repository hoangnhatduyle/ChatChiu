import { describe, expect, it } from 'vitest'
import { perUnitPrice, roundMoney, stockValue, totalPrice, wasteValue } from './price.js'

describe('per-unit price (CS-PER-UNIT-PRICE)', () => {
  it('AC-DATA-03: 10 eggs for 4.00 store 0.40 each and an edit shows 4.00', () => {
    expect(perUnitPrice(4, 10)).toBe(0.4)
    expect(totalPrice(0.4, 10)).toBe(4)
  })

  it('perUnitPrice is null without a positive amount or a price', () => {
    expect(perUnitPrice(4, 0)).toBeNull()
    expect(perUnitPrice(null, 2)).toBeNull()
    expect(totalPrice(null, 2)).toBeNull()
  })

  it('F-ST-05: stock value is price × current (6 eggs left at 0.40 = 2.40)', () => {
    expect(stockValue({ price: 0.4, quantity: 10, currentQuantity: 6 })).toBe(2.4)
    expect(stockValue({ price: null, quantity: 10, currentQuantity: 6 })).toBe(0)
  })

  it('F-ST-03: waste value is price × wasted quantity (6 × 0.40 + 1 × 3.00 = 5.40)', () => {
    const total = wasteValue({ price: 0.4, quantity: 6 }) + wasteValue({ price: 3, quantity: 1 })
    expect(roundMoney(total)).toBe(5.4)
    expect(wasteValue({ price: null, quantity: 1 })).toBe(0)
  })

  it('roundMoney rounds half-cents up and never returns -0', () => {
    expect(roundMoney(1.005)).toBe(1.01)
    expect(Object.is(roundMoney(-0.001), 0)).toBe(true)
  })

  it('keeps the unrounded per-unit price so the total round-trips (10 for 3 units)', () => {
    const unit = perUnitPrice(10, 3)
    expect(unit).toBeCloseTo(3.3333333, 6)
    expect(totalPrice(unit, 3)).toBe(10)
  })
})
