// Quick-action panel logic (SPEC-QP-001): the arithmetic behind the quick buttons and exact amounts,
// the shopping-list entry and its de-duplication, the value of what is wasted, and the run-out
// sentence. Pure; the rules it builds on live in quantity.ts, low-stock.ts, price.ts and run-out.ts.
import { daysBetween } from './dates.js'
import { isLowStock, type LowStockFields } from './low-stock.js'
import { wasteValue } from './price.js'
import {
  getFullQuantity,
  getRemainingQuantity,
  isUsedUp,
  percentLeft,
  roundQuantity,
  type QuantityFields,
} from './quantity.js'
import { averageDailyUse, predictRunOutDate, type UsagePoint } from './run-out.js'

/** The quick used buttons (F-QP-02): points of the full amount to take off. */
export const QUICK_USED = [
  { id: 'tenth', label: 'Used 10%', points: 10 },
  { id: 'quarter', label: 'Used 25%', points: 25 },
  { id: 'half', label: 'Used half', points: 50 },
  { id: 'all', label: 'Used it all', points: 100 },
] as const

/** Percent left after a quick button: points of the full amount, never below 0. */
export function percentAfterUsed(currentPercent: number, points: number): number {
  return Math.max(0, currentPercent - points)
}

type Amounts = Pick<QuantityFields, 'quantity' | 'initialQuantity' | 'currentQuantity'>

/** "Used ___": what is left after using `used` (F-QP-03), never below 0. */
export function amountAfterUsed(item: Amounts, used: number): number {
  return Math.max(0, roundQuantity(getRemainingQuantity(item) - used))
}

/** "Left ___": the amount she says is left, kept between 0 and the full amount (F-QP-03). */
export function amountFromLeft(item: Amounts, left: number): number {
  return Math.min(getFullQuantity(item), Math.max(0, roundQuantity(left)))
}

export type ShoppingEntryItem = LowStockFields & {
  name: string
  unit: string
  categoryId: number
}

export type ShoppingEntry = {
  name: string
  quantity: string
  notes: string
  categoryId: number
}

/** The shopping-list row for an item (F-QP-04, F-SL-07): its full amount, and why it is wanted. */
export function shoppingEntry(item: ShoppingEntryItem): ShoppingEntry {
  const percent = Math.round(percentLeft(item))
  const notes = isUsedUp(item)
    ? 'Used up'
    : isLowStock(item)
      ? `Low stock (${percent}% left)`
      : `${percent}% left`
  return {
    name: item.name,
    quantity: `${roundQuantity(getFullQuantity(item))} ${item.unit}`,
    notes,
    categoryId: item.categoryId,
  }
}

const normalise = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase()

/** True when an unpurchased row with this name is already listed (NC-QP-NO-DUPLICATE-SHOPPING). */
export function isOnShoppingList(
  list: ReadonlyArray<{ name: string; isPurchased: boolean }>,
  name: string,
): boolean {
  const wanted = normalise(name)
  return list.some((row) => !row.isPurchased && normalise(row.name) === wanted)
}

/** Value of what is left if it is thrown away (F-QP-05), by the one waste-value rule in price.ts. Null without a price. */
export function wastedValueOfItem(item: Amounts & { price: number | null }): number | null {
  if (item.price == null) return null
  return wasteValue({ price: item.price, quantity: getRemainingQuantity(item) })
}

/** "~4 days left at your pace" from the usage history, or null when there is nothing to predict. */
export function runOutText(
  remaining: number,
  usage: readonly UsagePoint[],
  today: string,
  timeZone = 'UTC',
): string | null {
  if (remaining <= 0) return null
  const date = predictRunOutDate(remaining, averageDailyUse(usage, today, timeZone), today)
  if (date === null) return null
  const days = Math.max(1, daysBetween(today, date))
  return `~${days} ${days === 1 ? 'day' : 'days'} left at your pace`
}
