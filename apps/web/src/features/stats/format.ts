// Plain-English money and dates for the stats page. Money is shown in dollars (open-questions Q6); dates
// are built by hand, not with Intl, so the words are the same on every device.
const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
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
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

// `|| 0` turns -0 into 0, so a rounded-away loss never reads "-$0.00".
export const money = (value: number): string => MONEY.format(Math.round(value * 100) / 100 || 0)

const parts = (date: string) => ({
  year: Number(date.slice(0, 4)),
  month: Number(date.slice(5, 7)) - 1,
  day: Number(date.slice(8, 10)),
  weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
})

/** "10 Nov 2026" from YYYY-MM-DD. */
export function dateLabel(date: string): string {
  const p = parts(date)
  return `${p.day} ${MONTHS[p.month]} ${p.year}`
}

/** "Sun 22 Nov" from YYYY-MM-DD. */
export function dayLabel(date: string): string {
  const p = parts(date)
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month]}`
}

/** "Oct 2026" from YYYY-MM. */
export function monthLabel(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
}

/** An amount with at most two decimals and no trailing zeros: 0.25, 3, 1.5. */
export const amount = (value: number): string => String(Number(value.toFixed(2)))
