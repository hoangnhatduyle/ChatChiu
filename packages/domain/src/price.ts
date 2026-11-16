// Per-unit price (CS-PER-UNIT-PRICE): price is stored per unit; every value is
// price × a quantity, never the raw price.
import { getRemainingQuantity, type QuantityFields } from './quantity.js'

export function roundMoney(value: number): number {
  // EPSILON so half-cents round up (1.005 → 1.01); + 0 turns -0 into 0.
  return Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100 + 0
}

/** Total paid → per-unit price. Null without a price or a positive amount. */
export function perUnitPrice(total: number | null | undefined, quantity: number): number | null {
  if (total == null || quantity <= 0) return null
  return total / quantity
}

/** Per-unit price → total for the edit form. */
export function totalPrice(unitPrice: number | null | undefined, quantity: number): number | null {
  if (unitPrice == null) return null
  return roundMoney(unitPrice * quantity)
}

/** Value of what is left: price × current quantity (F-ST-05). */
export function stockValue(
  item: Pick<QuantityFields, 'quantity' | 'currentQuantity'> & { price?: number | null },
): number {
  return roundMoney((item.price ?? 0) * getRemainingQuantity(item))
}

/** Value lost: price × wasted quantity (F-ST-03). */
export function wasteValue(entry: { price?: number | null; quantity: number }): number {
  return roundMoney((entry.price ?? 0) * entry.quantity)
}
