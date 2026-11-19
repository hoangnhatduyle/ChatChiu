// 7.0.28e / 7.0.30f: `today` follows the clock past midnight, so expiry chips and the meals week are not stale.
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { useToday } from './use-today'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('useToday', () => {
  it('changes when the local date changes, with no user action', () => {
    vi.setSystemTime(new Date(2026, 10, 18, 23, 59, 30))
    const { result } = renderHook(() => useToday())
    expect(result.current).toBe('2026-11-18')
    act(() => void vi.advanceTimersByTime(45_000))
    expect(result.current).toBe('2026-11-19')
  })

  it('checks again when the page becomes visible (a sleeping tablet misses its timer)', () => {
    vi.setSystemTime(new Date(2026, 10, 18, 12, 0, 0))
    const { result } = renderHook(() => useToday())
    vi.setSystemTime(new Date(2026, 10, 20, 8, 0, 0))
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    expect(result.current).toBe('2026-11-20')
  })
})
