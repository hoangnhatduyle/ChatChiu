import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysBetween,
  daysFromNow,
  isPastDate,
  isTodayOrFuture,
  localHourInTimeZone,
  parseLocalDate,
  toLocalDateString,
  todayInTimeZone,
  todayLocalDateString,
} from './dates.js'

// Cases ported from OLD/src/app/utils/date.utils.spec.ts (roadmap 2.2).
describe('date.utils (ported)', () => {
  describe('toLocalDateString', () => {
    it('should convert Date to YYYY-MM-DD format without timezone conversion', () => {
      expect(toLocalDateString(new Date(2026, 2, 14))).toBe('2026-03-14')
    })
    it('should pad month and day with zeros', () => {
      expect(toLocalDateString(new Date(2026, 0, 5))).toBe('2026-01-05')
    })
  })

  describe('parseLocalDate', () => {
    it('should parse YYYY-MM-DD string to Date', () => {
      const result = parseLocalDate('2026-03-14')
      expect(result.getFullYear()).toBe(2026)
      expect(result.getMonth()).toBe(2)
      expect(result.getDate()).toBe(14)
    })
    it('should handle month and day with leading zeros', () => {
      const result = parseLocalDate('2026-01-05')
      expect(result.getMonth()).toBe(0)
      expect(result.getDate()).toBe(5)
    })
  })

  describe('daysFromNow', () => {
    it('should calculate future dates', () => {
      const expected = new Date()
      expected.setDate(expected.getDate() + 7)
      expect(daysFromNow(7)).toBe(toLocalDateString(expected))
    })
    it('should handle negative days (past dates)', () => {
      const expected = new Date()
      expected.setDate(expected.getDate() - 7)
      expect(daysFromNow(-7)).toBe(toLocalDateString(expected))
    })
  })

  describe('todayLocalDateString', () => {
    it('should return today in YYYY-MM-DD format', () => {
      expect(todayLocalDateString()).toBe(toLocalDateString(new Date()))
    })
  })

  describe('daysBetween', () => {
    it('should calculate days between two dates', () => {
      expect(daysBetween('2026-03-07', '2026-03-14')).toBe(7)
    })
    it('should return negative days for past dates', () => {
      expect(daysBetween('2026-03-21', '2026-03-14')).toBeLessThan(0)
    })
    it('should return 0 for same dates', () => {
      expect(daysBetween('2026-03-14', '2026-03-14')).toBe(0)
    })
  })

  describe('isPastDate', () => {
    it('should return true for past dates', () => {
      expect(isPastDate(daysFromNow(-1))).toBe(true)
    })
    it('should return false for today or future dates', () => {
      expect(isPastDate(todayLocalDateString())).toBe(false)
    })
  })

  describe('isTodayOrFuture', () => {
    it('should return true for today', () => {
      expect(isTodayOrFuture(todayLocalDateString())).toBe(true)
    })
    it('should return true for future dates', () => {
      expect(isTodayOrFuture(daysFromNow(7))).toBe(true)
    })
    it('should return false for past dates', () => {
      expect(isTodayOrFuture(daysFromNow(-1))).toBe(false)
    })
  })
})

describe('injected now / today (no real clock)', () => {
  it('daysFromNow, isPastDate and isTodayOrFuture use the given now/today', () => {
    expect(daysFromNow(1, new Date(2026, 2, 7, 23, 30))).toBe('2026-03-08')
    expect(daysFromNow(-1, new Date(2026, 0, 1, 0, 5))).toBe('2025-12-31')
    expect(todayLocalDateString(new Date(2026, 10, 16, 12))).toBe('2026-11-16')
    expect(isPastDate('2026-11-15', '2026-11-16')).toBe(true)
    expect(isTodayOrFuture('2026-11-16', '2026-11-16')).toBe(true)
  })

  it('todayInTimeZone at midnight on a DST change day', () => {
    // 2026-11-01 04:30Z is 00:30 in New York on the day clocks fall back
    expect(todayInTimeZone('America/New_York', new Date('2026-11-01T04:30:00Z'))).toBe('2026-11-01')
    expect(localHourInTimeZone('America/New_York', new Date('2026-11-01T04:30:00Z'))).toBe(0)
  })
})

describe('date helpers for "today" in a given place (CS-DAY-MATHS)', () => {
  it('addDays crosses month, year and DST boundaries by calendar day', () => {
    expect(addDays('2026-01-01', 30)).toBe('2026-01-31')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('daysBetween is exact across a DST change', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2)
  })

  it('todayInTimeZone uses the zone, not UTC', () => {
    const instant = new Date('2026-11-16T23:30:00Z')
    expect(todayInTimeZone('UTC', instant)).toBe('2026-11-16')
    expect(todayInTimeZone('Asia/Ho_Chi_Minh', instant)).toBe('2026-11-17')
    expect(todayInTimeZone('America/Los_Angeles', instant)).toBe('2026-11-16')
  })

  it('localHourInTimeZone returns 0–23 in the zone', () => {
    const instant = new Date('2026-11-16T02:00:00Z')
    expect(localHourInTimeZone('UTC', instant)).toBe(2)
    expect(localHourInTimeZone('Asia/Ho_Chi_Minh', instant)).toBe(9)
    expect(localHourInTimeZone('America/New_York', new Date('2026-11-16T05:00:00Z'))).toBe(0)
  })
})
