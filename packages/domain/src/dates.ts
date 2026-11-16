// Timezone-safe date helpers. Ported from OLD/src/app/utils/date.utils.ts, plus
// calendar-day maths on YYYY-MM-DD strings and "today in her timezone"
// (CS-DAY-MATHS). Calendar maths runs in UTC so DST never shifts a day.

const MS_PER_DAY = 86_400_000

/** Date → YYYY-MM-DD from its local components (no timezone conversion). */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** YYYY-MM-DD → Date at local midnight. */
export function parseLocalDate(dateString: string): Date {
  const [year = 0, month = 1, day = 1] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Local date N days from now (negative for the past). */
export function daysFromNow(days: number, now: Date = new Date()): string {
  const date = new Date(now)
  date.setDate(date.getDate() + days)
  return toLocalDateString(date)
}

export function todayLocalDateString(now: Date = new Date()): string {
  return toLocalDateString(now)
}

function toUtcDay(dateString: string): number {
  const [year = 0, month = 1, day = 1] = dateString.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / MS_PER_DAY
}

function fromUtcDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10)
}

/** Whole calendar days from start to end (positive when end is later). */
export function daysBetween(startDate: string, endDate: string): number {
  return toUtcDay(endDate) - toUtcDay(startDate)
}

export function addDays(dateString: string, days: number): string {
  return fromUtcDay(toUtcDay(dateString) + days)
}

export function isPastDate(dateString: string, today: string = todayLocalDateString()): boolean {
  return daysBetween(today, dateString) < 0
}

export function isTodayOrFuture(
  dateString: string,
  today: string = todayLocalDateString(),
): boolean {
  return !isPastDate(dateString, today)
}

function partsInTimeZone(timeZone: string, instant: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  return Object.fromEntries(parts.map((p) => [p.type, p.value]))
}

/** The calendar date at this instant in an IANA timezone (YYYY-MM-DD). */
export function todayInTimeZone(timeZone: string, instant: Date = new Date()): string {
  const p = partsInTimeZone(timeZone, instant)
  return `${p.year}-${p.month}-${p.day}`
}

/** The local hour (0–23) at this instant in an IANA timezone. */
export function localHourInTimeZone(timeZone: string, instant: Date = new Date()): number {
  return Number(partsInTimeZone(timeZone, instant).hour)
}
