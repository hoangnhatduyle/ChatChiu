// Expiry status, days left and expiry maths (F-KB-03, F-IN-02, F-IF-06/07, F-RS-05).
import { addDays, daysBetween } from './dates.js'

/** "Use soon" is a fixed 3-day window (open-questions Q7 default; CS-NUMBERED-CONSTANTS). */
export const USE_SOON_DAYS = 3

/** Board chip status; matches the --status-{expired,today,soon,ok} tokens. */
export type ExpiryStatus = 'expired' | 'today' | 'soon' | 'ok'
/** Inventory list filter status (URL param `status`). */
export type ExpiryFilterStatus = 'expired' | 'expiring' | 'fresh'

export function daysLeft(expirationDate: string, today: string): number {
  return daysBetween(today, expirationDate)
}

export function expiryStatus(expirationDate: string, today: string): ExpiryStatus {
  const days = daysLeft(expirationDate, today)
  if (days < 0) return 'expired'
  if (days === 0) return 'today'
  return days <= USE_SOON_DAYS ? 'soon' : 'ok'
}

/** Ported getItemStatus(): expiring = today through today + 3. */
export function expiryFilterStatus(expirationDate: string, today: string): ExpiryFilterStatus {
  const days = daysLeft(expirationDate, today)
  if (days < 0) return 'expired'
  return days <= USE_SOON_DAYS ? 'expiring' : 'fresh'
}

export type OffsetUnit = 'day' | 'week' | 'month' | 'year'

/** Old-app parity: month = 30 days, year = 365 days (CS-DAY-MATHS). One definition. */
export const DAYS_PER_MONTH = 30
export const DAYS_PER_YEAR = 365
const DAYS_PER: Record<OffsetUnit, number> = {
  day: 1,
  week: 7,
  month: DAYS_PER_MONTH,
  year: DAYS_PER_YEAR,
}

export function addExpiryOffset(fromDate: string, amount: number, unit: OffsetUnit): string {
  return addDays(fromDate, amount * DAYS_PER[unit])
}

export const EXPIRY_CHIPS: ReadonlyArray<{ label: string; amount: number; unit: OffsetUnit }> = [
  { label: '3d', amount: 3, unit: 'day' },
  { label: '1w', amount: 1, unit: 'week' },
  { label: '2w', amount: 2, unit: 'week' },
  { label: '1m', amount: 1, unit: 'month' },
  { label: '3m', amount: 3, unit: 'month' },
  { label: '6m', amount: 6, unit: 'month' },
  { label: '1y', amount: 1, unit: 'year' },
]

export function isExpiryBeforePurchase(
  purchaseDate: string | null | undefined,
  expirationDate: string,
): boolean {
  return purchaseDate != null && daysBetween(purchaseDate, expirationDate) < 0
}

// Ported from OLD/src/app/services/receipt-scan.service.ts DEFAULT_EXPIRY_DAYS.
// Keyed by the AI's category *hint* text, never by a category id (AR-NO-SEED-ASSUMPTIONS).
const DEFAULT_SHELF_LIFE_DAYS: ReadonlyMap<string, number> = new Map(
  Object.entries({
    dairy: 14,
    produce: 7,
    meat: 3,
    seafood: 2,
    frozen: 90,
    pantry: 365,
    beverages: 90,
    snacks: 60,
    condiments: 180,
    bakery: 7,
    fruit: 7,
    other: 30,
  }),
)
const FALLBACK_SHELF_LIFE_DAYS = 30

export function defaultShelfLifeDays(categoryHint: string | null | undefined): number {
  if (!categoryHint) return FALLBACK_SHELF_LIFE_DAYS
  // A Map, so AI text like "constructor" can never hit an Object prototype key.
  return DEFAULT_SHELF_LIFE_DAYS.get(categoryHint.trim().toLowerCase()) ?? FALLBACK_SHELF_LIFE_DAYS
}
