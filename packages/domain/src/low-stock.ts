// The one definition of low stock (CS-PERCENT-LOW-STOCK, NC-DATA-ONE-LOW-STOCK-RULE):
// percent of the full amount <= low_stock_threshold. dashboard_summary_v2 and
// log_item_usage mirror it in SQL, with tests that check both agree.
import { getFullQuantity, percentOf, percentLeft, type QuantityFields } from './quantity.js'

export const DEFAULT_LOW_STOCK_THRESHOLD = 20
export const CRITICAL_PERCENT = 10

export type LowStockLevel = 'normal' | 'warning' | 'critical'

export interface LowStockFields extends QuantityFields {
  lowStockThreshold?: number | null
}

export function thresholdOf(item: Pick<LowStockFields, 'lowStockThreshold'>): number {
  return item.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD
}

export function isLowStock(item: LowStockFields): boolean {
  return percentLeft(item) <= thresholdOf(item)
}

/** Critical (<= 10 %) is always a subset of low stock. */
export function lowStockLevel(item: LowStockFields): LowStockLevel {
  const pct = percentLeft(item)
  if (pct > thresholdOf(item)) return 'normal'
  return pct <= CRITICAL_PERCENT ? 'critical' : 'warning'
}

/** True when a change from `before` to `after` takes the item across its threshold. */
export function crossedLowStock(
  item: Pick<LowStockFields, 'quantity' | 'initialQuantity' | 'lowStockThreshold'>,
  before: number,
  after: number,
): boolean {
  const full = getFullQuantity(item)
  const threshold = thresholdOf(item)
  return percentOf(before, full) > threshold && percentOf(after, full) <= threshold
}
