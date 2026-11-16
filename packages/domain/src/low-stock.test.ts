import { describe, expect, it } from 'vitest'
import {
  CRITICAL_PERCENT,
  DEFAULT_LOW_STOCK_THRESHOLD,
  crossedLowStock,
  isLowStock,
  lowStockLevel,
} from './low-stock.js'

const at = (percent: number, lowStockThreshold: number | null = 20) => ({
  quantity: 100,
  initialQuantity: 100,
  currentQuantity: percent,
  lowStockThreshold,
})

describe('percent-based low stock (CS-PERCENT-LOW-STOCK)', () => {
  it('defaults: threshold 20, critical 10', () => {
    expect(DEFAULT_LOW_STOCK_THRESHOLD).toBe(20)
    expect(CRITICAL_PERCENT).toBe(10)
  })

  it('F-KB-07: 25%/20 normal, 18% warning, 8% critical, 25%/30 warning', () => {
    expect(lowStockLevel(at(25))).toBe('normal')
    expect(lowStockLevel(at(18))).toBe('warning')
    expect(lowStockLevel(at(8))).toBe('critical')
    expect(lowStockLevel(at(25, 30))).toBe('warning')
  })

  it('AC-DATA-04: 0.15 of 1 is low at threshold 20', () => {
    expect(
      isLowStock({ quantity: 1, initialQuantity: 1, currentQuantity: 0.15, lowStockThreshold: 20 }),
    ).toBe(true)
  })

  it('AC-DATA-04: 5 of 100 g is low but 5 of 5 g is not (never an absolute amount)', () => {
    expect(isLowStock({ quantity: 100, initialQuantity: 100, currentQuantity: 5 })).toBe(true)
    expect(isLowStock({ quantity: 5, initialQuantity: 5, currentQuantity: 5 })).toBe(false)
  })

  it('a null threshold uses the default 20, and critical stays inside low', () => {
    expect(lowStockLevel(at(19, null))).toBe('warning')
    expect(lowStockLevel(at(8, 5))).toBe('normal')
    expect(lowStockLevel(at(4, 5))).toBe('critical')
  })

  it('AC-DATA-04: exactly at the threshold is low, despite float noise (0.07 → 7 %, 0.29 → 29 %)', () => {
    const one = { quantity: 1, initialQuantity: 1 }
    expect(isLowStock({ ...one, currentQuantity: 0.07, lowStockThreshold: 7 })).toBe(true)
    expect(isLowStock({ ...one, currentQuantity: 0.29, lowStockThreshold: 29 })).toBe(true)
    expect(isLowStock({ ...one, currentQuantity: 0.2901, lowStockThreshold: 29 })).toBe(false)
    expect(crossedLowStock({ ...one, lowStockThreshold: 7 }, 0.5, 0.07)).toBe(true)
  })

  it('a zero full amount reads as 0 %, so it is low and critical', () => {
    expect(lowStockLevel({ quantity: 0, initialQuantity: null, currentQuantity: null })).toBe(
      'critical',
    )
  })

  it('AC-DATA-08: crossedLowStock is true only when this change crosses the threshold', () => {
    const item = { quantity: 1, initialQuantity: 1, lowStockThreshold: 20 }
    expect(crossedLowStock(item, 0.6, 0.1)).toBe(true)
    expect(crossedLowStock(item, 0.15, 0.1)).toBe(false)
    expect(crossedLowStock(item, 0.6, 0.3)).toBe(false)
    expect(crossedLowStock(item, 0.6, 0.2)).toBe(true)
  })
})
