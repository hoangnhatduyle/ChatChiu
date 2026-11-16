import { describe, expect, it } from 'vitest'
import {
  EXPIRY_CHIPS,
  USE_SOON_DAYS,
  addExpiryOffset,
  daysLeft,
  defaultShelfLifeDays,
  expiryFilterStatus,
  expiryStatus,
  isExpiryBeforePurchase,
} from './expiry.js'

const today = '2026-11-16'

describe('expiry status', () => {
  it('F-KB-03: expired, today, in 2 days and in 3 months', () => {
    expect(expiryStatus('2026-11-15', today)).toBe('expired')
    expect(expiryStatus('2026-11-16', today)).toBe('today')
    expect(expiryStatus('2026-11-18', today)).toBe('soon')
    expect(expiryStatus('2027-02-16', today)).toBe('ok')
    expect(daysLeft('2026-11-18', today)).toBe(2)
    expect(daysLeft('2026-11-15', today)).toBe(-1)
  })

  it('use soon is a fixed 3-day window (Q7 default)', () => {
    expect(USE_SOON_DAYS).toBe(3)
    expect(expiryStatus('2026-11-19', today)).toBe('soon')
    expect(expiryStatus('2026-11-20', today)).toBe('ok')
  })

  it('F-IN-02: inventory filter status: expired, expiring (within 3 days incl. today), fresh', () => {
    expect(expiryFilterStatus('2026-11-15', today)).toBe('expired')
    expect(expiryFilterStatus('2026-11-16', today)).toBe('expiring')
    expect(expiryFilterStatus('2026-11-19', today)).toBe('expiring')
    expect(expiryFilterStatus('2026-11-20', today)).toBe('fresh')
  })
})

describe('expiry offsets (CS-DAY-MATHS: month = 30 d, year = 365 d)', () => {
  it('F-IF-06: 2026-01-01 + 1 month = 2026-01-31, + 1 year = 2027-01-01', () => {
    expect(addExpiryOffset('2026-01-01', 1, 'month')).toBe('2026-01-31')
    expect(addExpiryOffset('2026-01-01', 1, 'year')).toBe('2027-01-01')
    expect(addExpiryOffset('2026-01-01', 2, 'week')).toBe('2026-01-15')
    expect(addExpiryOffset('2026-01-01', 3, 'day')).toBe('2026-01-04')
  })

  it('F-IF-06: chips 3d · 1w · 2w · 1m · 3m · 6m · 1y', () => {
    expect(EXPIRY_CHIPS.map((c) => c.label)).toEqual(['3d', '1w', '2w', '1m', '3m', '6m', '1y'])
    const oneYear = EXPIRY_CHIPS.find((c) => c.label === '1y')
    expect(oneYear && addExpiryOffset('2026-01-01', oneYear.amount, oneYear.unit)).toBe(
      '2027-01-01',
    )
  })

  it('F-IF-07: an expiry before the purchase date is flagged', () => {
    expect(isExpiryBeforePurchase('2026-01-10', '2026-01-09')).toBe(true)
    expect(isExpiryBeforePurchase('2026-01-10', '2026-01-10')).toBe(false)
    expect(isExpiryBeforePurchase(null, '2026-01-01')).toBe(false)
  })
})

describe('category shelf-life defaults (F-RS-05, ported from the old receipt service)', () => {
  it('Dairy defaults to 14 days, case-insensitively; unknown or missing → 30', () => {
    expect(defaultShelfLifeDays('Dairy')).toBe(14)
    expect(defaultShelfLifeDays('meat')).toBe(3)
    expect(defaultShelfLifeDays('Pantry')).toBe(365)
    expect(defaultShelfLifeDays('Spices')).toBe(30)
    expect(defaultShelfLifeDays(null)).toBe(30)
  })

  it('AI text that names an Object property still falls back to 30', () => {
    expect(defaultShelfLifeDays('constructor')).toBe(30)
    expect(defaultShelfLifeDays('__proto__')).toBe(30)
  })
})
