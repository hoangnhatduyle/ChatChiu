import { describe, expect, it } from 'vitest'
import { RUN_OUT_WINDOW_DAYS, averageDailyUse, predictRunOutDate } from './run-out.js'

const today = '2026-11-16'
const at = (date: string, amountUsed: number) => ({ recordedAt: `${date}T08:00:00Z`, amountUsed })

describe('run-out prediction (F-KB-10, F-ST-06)', () => {
  it('uses a 30-day window', () => {
    expect(RUN_OUT_WINDOW_DAYS).toBe(30)
  })

  it('averages use per day from the first entry in the window to today', () => {
    // 3 units used over the 10 days 2026-11-07..2026-11-16
    const usage = [at('2026-11-07', 1), at('2026-11-10', 1), at('2026-11-15', 1)]
    expect(averageDailyUse(usage, today)).toBeCloseTo(0.3, 10)
  })

  it('ignores entries older than 30 days and returns null without history', () => {
    expect(averageDailyUse([at('2026-10-01', 5)], today)).toBeNull()
    expect(averageDailyUse([], today)).toBeNull()
  })

  it('caps the span at 30 days and counts a same-day entry as one day', () => {
    expect(averageDailyUse([at('2026-10-18', 3)], today)).toBeCloseTo(0.1, 10)
    expect(averageDailyUse([at(today, 2)], today)).toBe(2)
  })

  it('dates each use in her timezone, not UTC', () => {
    // 2026-11-15T18:00Z is 01:00 on 2026-11-16 in Ho Chi Minh City: a same-day use.
    const usage = [{ recordedAt: '2026-11-15T18:00:00Z', amountUsed: 2 }]
    expect(averageDailyUse(usage, today, 'Asia/Ho_Chi_Minh')).toBe(2)
    expect(averageDailyUse(usage, today)).toBe(1)
  })

  it('predicts the run-out date as today + ceil(remaining / rate)', () => {
    expect(predictRunOutDate(1, 0.3, today)).toBe('2026-11-20')
    expect(predictRunOutDate(0, 0.3, today)).toBe(today)
  })

  it('cannot predict without a positive rate', () => {
    expect(predictRunOutDate(1, null, today)).toBeNull()
    expect(predictRunOutDate(1, 0, today)).toBeNull()
  })
})
