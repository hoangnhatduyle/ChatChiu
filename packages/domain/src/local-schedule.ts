// The reminders the Fire tablet schedules on the device itself (architecture.md §6.2, SPEC-NT-001 outcome B):
// no Google push there, so the app plans one grouped expiry reminder per local day, at her notify hour in her time
// zone, for the days ahead. One per day, same wording as the server's push (reminder-text.ts).
import { addDays, todayInTimeZone } from './dates.js'
import { daysLeft } from './expiry.js'
import { expiryReminder } from './reminder-text.js'

export type ScheduleItem = {
  id: number
  name: string
  expirationDate: string | null
  notificationEnabled: boolean | null
  notificationDaysBefore: number | null
}
export type SchedulePrefs = { timezone: string; notifyHour: number; expiryAlerts: boolean }
export type LocalReminder = {
  /** The local date as a number (20261118): one reminder per day, so the date is a unique, stable id. */
  id: number
  /** The instant it fires, ISO. */
  at: string
  title: string
  body: string
  url: string
  tag: string
}

/** How many days ahead the schedule is filled; it is rebuilt every time the app syncs. */
export const LOCAL_HORIZON_DAYS = 30
const DEFAULT_DAYS_BEFORE = 3

/** Minutes the zone is ahead of UTC at this instant. */
function offsetMinutes(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'))
  return (asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000
}

/** The instant of `hour`:00 on a local date in a zone, following clock changes (CS-DAY-MATHS). */
export function zonedInstant(localDate: string, hour: number, timeZone: string): Date {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number]
  const wall = Date.UTC(y, m - 1, d, hour)
  const guess = (offset: number) => wall - offset * 60_000
  const first = guess(offsetMinutes(timeZone, new Date(wall)))
  const second = guess(offsetMinutes(timeZone, new Date(first)))
  // Not stable: the wall time falls in the hour a spring clock change skips. Use the later reading, i.e. the first
  // instant after the gap (an hour later on the clock), never an hour early.
  if (guess(offsetMinutes(timeZone, new Date(second))) !== second)
    return new Date(Math.max(first, second))
  return new Date(second)
}

export function planLocalReminders(
  items: readonly ScheduleItem[],
  prefs: SchedulePrefs,
  now: Date,
  horizonDays: number = LOCAL_HORIZON_DAYS,
): LocalReminder[] {
  if (!prefs.expiryAlerts) return []
  const today = todayInTimeZone(prefs.timezone, now)
  const plan: LocalReminder[] = []
  for (let ahead = 0; ahead < horizonDays; ahead++) {
    const day = addDays(today, ahead)
    const at = zonedInstant(day, prefs.notifyHour, prefs.timezone)
    if (at.getTime() <= now.getTime()) continue
    const due = items.filter((i) => {
      if (i.notificationEnabled === false || i.expirationDate == null) return false
      const left = daysLeft(i.expirationDate, day)
      return left >= 0 && left <= (i.notificationDaysBefore ?? DEFAULT_DAYS_BEFORE)
    })
    if (due.length === 0) continue
    plan.push({
      id: Number(day.replaceAll('-', '')),
      at: at.toISOString(),
      ...expiryReminder(
        due.map((i) => i.name),
        day,
      ),
    })
  }
  return plan
}
