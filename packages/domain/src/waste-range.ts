// Waste time ranges (F-ST-02), defined once for the API's overview and the web's waste log
// (AR-ONE-DEFINITION): a range starts N local days back, today included; "all" has no start.
import { addDays, todayInTimeZone } from './dates.js'

export type WasteRange = 'week' | 'month' | 'year' | 'all'

const RANGE_DAYS: Record<WasteRange, number | null> = { week: 7, month: 30, year: 365, all: null }

/** First local date inside the range (inclusive); null = no lower bound. */
export function rangeStart(range: WasteRange, today: string): string | null {
  const days = RANGE_DAYS[range]
  return days === null ? null : addDays(today, -(days - 1))
}

/** Entries inside the range (dated in her timezone) and, optionally, one category. */
export function filterWasteEntries<E extends { wastedDate: string; categoryId: number | null }>(
  entries: readonly E[],
  opts: { range: WasteRange; categoryId?: number | null; today: string; timezone: string },
): E[] {
  const start = rangeStart(opts.range, opts.today)
  return entries.filter(
    (e) =>
      (opts.categoryId == null || e.categoryId === opts.categoryId) &&
      (start === null || todayInTimeZone(opts.timezone, new Date(e.wastedDate)) >= start),
  )
}
