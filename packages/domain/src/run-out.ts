// Run-out prediction from usage history, no AI (F-KB-10, F-ST-06). The SQL
// item_consumption() in migration 0014 computes the same rate.
import { addDays, daysBetween, todayInTimeZone } from './dates.js'

export const RUN_OUT_WINDOW_DAYS = 30
/** Beyond this many days a run-out date is not a useful prediction (same cap in SQL). */
export const RUN_OUT_MAX_DAYS = 36_500

export interface UsagePoint {
  amountUsed: number
  /** ISO timestamp; its calendar date in `timeZone` is used. */
  recordedAt: string
}

/**
 * Average daily use over the last 30 days: the amount used in the window divided
 * by the days from the first in-window entry to today (inclusive, at most 30).
 * Each use is dated in her timezone, the same zone `today` comes from.
 * Null when there is no usage in the window.
 */
export function averageDailyUse(
  usage: readonly UsagePoint[],
  today: string,
  timeZone = 'UTC',
): number | null {
  const inWindow = usage
    .map((u) => ({
      amount: u.amountUsed,
      age: daysBetween(todayInTimeZone(timeZone, new Date(u.recordedAt)), today),
    }))
    .filter((u) => u.age >= 0 && u.age < RUN_OUT_WINDOW_DAYS)
  if (inWindow.length === 0) return null
  const span = Math.max(...inWindow.map((u) => u.age)) + 1
  const total = inWindow.reduce((sum, u) => sum + u.amount, 0)
  return total / span
}

/** today + ceil(remaining / rate); null when the rate is unknown or zero, or beyond RUN_OUT_MAX_DAYS. */
export function predictRunOutDate(
  remaining: number,
  avgDailyUse: number | null,
  today: string,
): string | null {
  if (avgDailyUse == null || avgDailyUse <= 0) return null
  if (remaining <= 0) return today
  // Rounded to 9 decimals before ceil, exactly as consumption_stats() does in SQL,
  // so float noise never adds a day the numeric maths would not.
  const daysLeft = Math.round((remaining / avgDailyUse) * 1e9) / 1e9
  if (daysLeft > RUN_OUT_MAX_DAYS) return null
  return addDays(today, Math.ceil(daysLeft))
}
