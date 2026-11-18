// SPEC-QP-001 panel logic: quick used buttons, exact amounts, the shopping entry and its
// de-duplication, the value of what is wasted, and the run-out sentence.
import { describe, expect, it } from 'vitest'
import {
  amountAfterUsed,
  amountFromLeft,
  isOnShoppingList,
  percentAfterUsed,
  QUICK_USED,
  runOutText,
  shoppingEntry,
  wastedValueOfItem,
} from './panel.js'

const butter = {
  name: 'Butter',
  unit: 'g',
  quantity: 250,
  initialQuantity: 250,
  currentQuantity: 37.5,
  lowStockThreshold: null,
  categoryId: 4,
  price: null,
}

describe('QUICK_USED / percentAfterUsed', () => {
  it('F-QP-02: from 60% the four buttons go to 50, 35, 10 and 0 (points of the full amount, clamped at 0)', () => {
    expect(QUICK_USED.map((b) => b.label)).toEqual([
      'Used 10%',
      'Used 25%',
      'Used half',
      'Used it all',
    ])
    expect(QUICK_USED.map((b) => percentAfterUsed(60, b.points))).toEqual([50, 35, 10, 0])
  })
  it('F-QP-02: never goes below 0', () => {
    expect(percentAfterUsed(5, 25)).toBe(0)
  })
})

describe('exact amounts', () => {
  const jar = { quantity: 500, initialQuantity: 500, currentQuantity: 300 }
  it('F-QP-03: Used 100 g from 300 g left leaves 200 g', () => {
    expect(amountAfterUsed(jar, 100)).toBe(200)
  })
  it('F-QP-03: Left 150 g sets 150 g', () => {
    expect(amountFromLeft(jar, 150)).toBe(150)
  })
  it('F-QP-03: used more than is left stops at 0; left above the full amount stops at the full amount', () => {
    expect(amountAfterUsed(jar, 900)).toBe(0)
    expect(amountFromLeft(jar, 900)).toBe(500)
  })
  it('F-QP-03: float noise is removed (0.3 - 0.1 is 0.2)', () => {
    expect(amountAfterUsed({ quantity: 1, initialQuantity: 1, currentQuantity: 0.3 }, 0.1)).toBe(
      0.2,
    )
  })
})

describe('shoppingEntry', () => {
  it('F-QP-04: Butter 250 g at 15% becomes "Butter", "250 g", "Low stock (15% left)" with its category', () => {
    expect(shoppingEntry(butter)).toEqual({
      name: 'Butter',
      quantity: '250 g',
      notes: 'Low stock (15% left)',
      categoryId: 4,
    })
  })
  it('F-SL-07: a used-up item says "Used up"', () => {
    expect(shoppingEntry({ ...butter, currentQuantity: 0 }).notes).toBe('Used up')
  })
  it('F-QP-04: an item that is not low just notes how much is left', () => {
    expect(shoppingEntry({ ...butter, currentQuantity: 200 }).notes).toBe('80% left')
  })
})

describe('isOnShoppingList', () => {
  const list = [
    { name: 'butter ', isPurchased: false },
    { name: 'Milk', isPurchased: true },
  ]
  it('NC-QP-NO-DUPLICATE-SHOPPING: matches case- and space-insensitively', () => {
    expect(isOnShoppingList(list, '  BUTTER')).toBe(true)
    expect(isOnShoppingList(list, 'Peanut  butter')).toBe(false)
  })
  it('NC-QP-NO-DUPLICATE-SHOPPING: only unpurchased rows count (a bought one can be listed again)', () => {
    expect(isOnShoppingList(list, 'Milk')).toBe(false)
  })
  it('collapses inner spaces: "Olive   oil" is "olive oil"', () => {
    expect(isOnShoppingList([{ name: 'olive oil', isPurchased: false }], 'Olive   Oil')).toBe(true)
  })
})

describe('wastedValueOfItem', () => {
  it('F-QP-05: per-unit 0.40 and 6 left is 2.40', () => {
    expect(
      wastedValueOfItem({ price: 0.4, quantity: 6, initialQuantity: 6, currentQuantity: 6 }),
    ).toBe(2.4)
  })
  it('F-QP-05: no price means no value', () => {
    expect(
      wastedValueOfItem({ price: null, quantity: 6, initialQuantity: 6, currentQuantity: 6 }),
    ).toBeNull()
  })
})

describe('runOutText', () => {
  const today = '2030-06-10'
  const day = (n: number) => `2030-06-${String(n).padStart(2, '0')}T12:00:00.000Z`
  it('F-QP-08: "~4 days left at your pace" from the average daily use', () => {
    // 2 units used over the last 2 days (1 a day); 4 left -> 4 days
    const usage = [
      { amountUsed: 1, recordedAt: day(9) },
      { amountUsed: 1, recordedAt: day(10) },
    ]
    expect(runOutText(4, usage, today)).toBe('~4 days left at your pace')
  })
  it('F-QP-08: one day reads "~1 day left"', () => {
    expect(runOutText(1, [{ amountUsed: 1, recordedAt: day(10) }], today)).toBe(
      '~1 day left at your pace',
    )
  })
  it('F-QP-08: no usage history means no prediction', () => {
    expect(runOutText(4, [], today)).toBeNull()
  })
  it('F-QP-08: nothing left reads as used up, not as a prediction', () => {
    expect(runOutText(0, [{ amountUsed: 1, recordedAt: day(10) }], today)).toBeNull()
  })
})
