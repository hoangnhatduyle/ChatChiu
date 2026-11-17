// Words for an expiry, one definition for the board chip, the panel and screen readers (F-KB-03).
import { DAYS_PER_MONTH, type OffsetUnit } from './expiry.js'

/** Up to this many days the chip counts days ("45d"); after it, months ("2 mo"). Prototype value. */
export const EXPIRY_CHIP_DAYS_MAX = 45

/** Short chip text from days left: Expired, Today, 2d, 3 mo. */
export function expiryChipLabel(days: number): string {
  if (days < 0) return 'Expired'
  if (days === 0) return 'Today'
  if (days <= EXPIRY_CHIP_DAYS_MAX) return `${days}d`
  return `${Math.round(days / DAYS_PER_MONTH)} mo`
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The same status in words, for screen readers and the panel subtitle. */
export function expiryDescription(days: number): string {
  if (days < 0) return `Expired ${plural(-days, 'day')} ago`
  if (days === 0) return 'Expires today'
  return `Expires in ${plural(days, 'day')}`
}

/** A quick-chip offset in words for screen readers: "In 3 days", "In 1 month" (not "1 m"). */
export function expiryOffsetPhrase(amount: number, unit: OffsetUnit): string {
  return `In ${plural(amount, unit)}`
}
