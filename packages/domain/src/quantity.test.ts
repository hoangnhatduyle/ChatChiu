import { describe, expect, it } from 'vitest'
import {
  USAGE_STEP_PERCENT,
  getFullQuantity,
  getRemainingQuantity,
  isUsedUp,
  percentLeft,
  quantityAtPercent,
  roundQuantity,
  snapPercent,
} from './quantity.js'

// Cases ported from OLD/src/app/utils/quantity.utils.spec.ts (roadmap 2.2).
describe('getRemainingQuantity (ported)', () => {
  it('returns the tracked current quantity, not the stored quantity', () => {
    expect(getRemainingQuantity({ quantity: 1, currentQuantity: 0.24 })).toBe(0.24)
  })

  it('returns 0 when the item is used up', () => {
    expect(getRemainingQuantity({ quantity: 0.62, currentQuantity: 0 })).toBe(0)
  })

  it('falls back to quantity when usage is not tracked', () => {
    expect(getRemainingQuantity({ quantity: 3 })).toBe(3)
    expect(getRemainingQuantity({ quantity: 3, currentQuantity: undefined })).toBe(3)
  })

  it('treats a database null like a missing value', () => {
    expect(getRemainingQuantity({ quantity: 3, currentQuantity: null })).toBe(3)
  })
})

describe('percent left', () => {
  it('F-KB-05: 0.6 of 1 L is 60%', () => {
    expect(percentLeft({ quantity: 1, initialQuantity: 1, currentQuantity: 0.6 })).toBe(60)
  })

  it('AC-DATA-05: null initial/current quantity reads as quantity, so 2 of 2 is 100%', () => {
    const oldRow = { quantity: 2, initialQuantity: null, currentQuantity: null }
    expect(getFullQuantity(oldRow)).toBe(2)
    expect(getRemainingQuantity(oldRow)).toBe(2)
    expect(percentLeft(oldRow)).toBe(100)
  })

  it('clamps to 0–100 and treats a zero full amount as 0%', () => {
    expect(percentLeft({ quantity: 1, initialQuantity: 1, currentQuantity: 2 })).toBe(100)
    expect(percentLeft({ quantity: 0, initialQuantity: 0, currentQuantity: 0 })).toBe(0)
    expect(percentLeft({ quantity: 1, initialQuantity: 1, currentQuantity: -1 })).toBe(0)
  })

  it('isUsedUp is true only at or below zero', () => {
    expect(isUsedUp({ quantity: 1, currentQuantity: 0 })).toBe(true)
    expect(isUsedUp({ quantity: 1, currentQuantity: 0.01 })).toBe(false)
  })
})

describe('usage slider maths (CS-NUMBERED-CONSTANTS)', () => {
  it('F-KB-04: snaps to 5% steps within 0–100', () => {
    expect(USAGE_STEP_PERCENT).toBe(5)
    expect(snapPercent(37)).toBe(35)
    expect(snapPercent(38)).toBe(40)
    expect(snapPercent(-4)).toBe(0)
    expect(snapPercent(104)).toBe(100)
  })

  it('quantityAtPercent converts a slider value back to an amount without float noise', () => {
    expect(quantityAtPercent({ quantity: 1, initialQuantity: 1 }, 35)).toBe(0.35)
    expect(quantityAtPercent({ quantity: 250, initialQuantity: 250 }, 15)).toBe(37.5)
    expect(roundQuantity(0.1 + 0.2)).toBe(0.3)
  })
})
