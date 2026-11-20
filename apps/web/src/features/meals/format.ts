// Plain-English dates for the meal plan. Built by hand (not Intl) so the words are the same on every device.
import { addDays, type MealSlotType } from '@chatchiu/domain'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const parts = (date: string) => ({
  year: Number(date.slice(0, 4)),
  month: Number(date.slice(5, 7)) - 1,
  day: Number(date.slice(8, 10)),
  weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
})

/** "Wed 18 Nov" */
export function dayLabel(date: string): string {
  const p = parts(date)
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month]}`
}

/** "16 – 22 Nov 2026", or "30 Nov – 6 Dec 2026" across a month. */
export function weekRangeLabel(start: string): string {
  const a = parts(start)
  const b = parts(addDays(start, 6))
  const from = a.month === b.month ? `${a.day}` : `${a.day} ${MONTHS[a.month]}`
  return `${from} – ${b.day} ${MONTHS[b.month]} ${b.year}`
}

/** "Nov" */
export function monthShortLabel(date: string): string {
  return MONTHS[parts(date).month] as string
}

/** "November 2026" */
export function monthLabel(date: string): string {
  const p = parts(date)
  return `${MONTH_NAMES[p.month]} ${p.year}`
}

export const dayOfMonth = (date: string): number => parts(date).day
export const monthKey = (date: string): string => date.slice(0, 7)

export const MEAL_TYPE_LABEL: Record<MealSlotType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
}
