// Quantities. Ported from OLD/src/app/utils/quantity.utils.ts and extended with
// the full-amount fallback (AR-SAME-SEMANTICS): a missing initial/current
// quantity is read as `quantity`, without rewriting the row.

export interface QuantityFields {
  quantity: number
  initialQuantity?: number | null
  currentQuantity?: number | null
}

/** The slider moves in 5 % steps (CS-NUMBERED-CONSTANTS). */
export const USAGE_STEP_PERCENT = 5
/** A pointer move shorter than this is a tap, not a drag (CS-NUMBERED-CONSTANTS). */
export const TAP_GUARD_PX = 4

/** Amount still left: current_quantity, else quantity. */
export function getRemainingQuantity(
  item: Pick<QuantityFields, 'quantity' | 'currentQuantity'>,
): number {
  return item.currentQuantity ?? item.quantity
}

/** The full amount: initial_quantity, else quantity. */
export function getFullQuantity(
  item: Pick<QuantityFields, 'quantity' | 'initialQuantity'>,
): number {
  return item.initialQuantity ?? item.quantity
}

/** Percent left, 0–100. A zero full amount reads as 0 %. */
export function percentLeft(item: QuantityFields): number {
  return percentOf(getRemainingQuantity(item), getFullQuantity(item))
}

export function percentOf(remaining: number, full: number): number {
  if (full <= 0) return 0
  // Rounded to 6 decimals so 0.07 of 1 is exactly 7 % (as Postgres numeric computes it).
  const pct = Math.round((remaining / full) * 100 * 1e6) / 1e6
  return Math.min(100, Math.max(0, pct))
}

export function isUsedUp(item: Pick<QuantityFields, 'quantity' | 'currentQuantity'>): boolean {
  return getRemainingQuantity(item) <= 0
}

/** Round away binary-float noise (0.1 + 0.2 → 0.3); quantities keep 6 decimals. */
export function roundQuantity(value: number): number {
  return Math.round(value * 1e6) / 1e6 + 0 // + 0 turns -0 into 0
}

export function snapPercent(percent: number): number {
  const snapped = Math.round(percent / USAGE_STEP_PERCENT) * USAGE_STEP_PERCENT
  return Math.min(100, Math.max(0, snapped))
}

/** The amount that a slider position represents. */
export function quantityAtPercent(
  item: Pick<QuantityFields, 'quantity' | 'initialQuantity'>,
  percent: number,
): number {
  return roundQuantity((getFullQuantity(item) * percent) / 100)
}
