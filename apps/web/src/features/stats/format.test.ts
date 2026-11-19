// 7.0.31f: a malformed date or month from the server is shown as it is, never as "NaN undefined NaN".
import { dateLabel, dayLabel, monthLabel } from './format'

describe('stats labels', () => {
  it('format a well-formed value', () => {
    expect(dateLabel('2026-11-10')).toBe('10 Nov 2026')
    expect(dayLabel('2026-11-22')).toBe('Sun 22 Nov')
    expect(monthLabel('2026-10')).toBe('Oct 2026')
  })

  it('show a malformed value unchanged instead of garbage', () => {
    expect(dateLabel('soon')).toBe('soon')
    expect(dayLabel('2026-13-40')).toBe('2026-13-40')
    expect(monthLabel('')).toBe('')
    expect(monthLabel('2026-99')).toBe('2026-99')
  })
})
