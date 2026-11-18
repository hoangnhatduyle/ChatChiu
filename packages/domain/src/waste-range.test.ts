import { describe, expect, it } from 'vitest'
import { filterWasteEntries, rangeStart } from './waste-range.js'

describe('F-ST-02 time ranges', () => {
  it('starts a week, month and year range 7, 30 and 365 days back, today included', () => {
    expect(rangeStart('week', '2026-11-18')).toBe('2026-11-12')
    expect(rangeStart('month', '2026-11-18')).toBe('2026-10-20')
    expect(rangeStart('year', '2026-11-18')).toBe('2025-11-19')
  })
  it('has no lower bound for all', () => {
    expect(rangeStart('all', '2026-11-18')).toBeNull()
  })
})

describe('F-ST-02 filtering the waste log', () => {
  const entry = (id: number, wastedDate: string, categoryId: number | null) => ({
    id,
    wastedDate,
    categoryId,
  })
  const entries = [
    entry(1, '2026-11-10T09:00:00Z', 1),
    entry(2, '2026-11-12T09:00:00Z', 2),
    entry(3, '2026-09-01T09:00:00Z', 1),
    entry(4, '2026-11-18T23:30:00Z', null),
  ]
  const today = '2026-11-18'

  it('keeps entries inside the range, by her local date', () => {
    const ids = (range: 'week' | 'month' | 'year' | 'all', timezone = 'UTC') =>
      filterWasteEntries(entries, { range, today, timezone }).map((e) => e.id)
    expect(ids('all')).toEqual([1, 2, 3, 4])
    expect(ids('month')).toEqual([1, 2, 4])
    expect(ids('week')).toEqual([2, 4])
    // 23:30 UTC on the 18th is already the 19th in Tokyo: still inside every range that holds today.
    expect(ids('week', 'Asia/Tokyo')).toEqual([2, 4])
  })

  it('filters by one category as well', () => {
    expect(
      filterWasteEntries(entries, { range: 'month', categoryId: 1, today, timezone: 'UTC' }).map(
        (e) => e.id,
      ),
    ).toEqual([1])
  })
})
