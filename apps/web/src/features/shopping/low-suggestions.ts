// "Running low" suggestions for the shopping list (F-SL-09): what the kitchen says is low, minus what is already
// on the list. The figures come from the stats overview (with run-out dates) or, before it has loaded or while
// offline, from the bootstrap summary the board already has. Pure, so the rule is tested without a screen.
import type { LowStockRow, RunOutRow } from '@chatchiu/contracts'
import { isOnShoppingList, shoppingEntry, type ShoppingEntry } from '@chatchiu/domain'

/** The most suggestions shown at once. */
export const MAX_SUGGESTIONS = 6

export type LowSuggestion = LowStockRow & Partial<Pick<RunOutRow, 'runOutDate'>>

/** The low-stock rows not yet on the list (an unpurchased row with the same name counts as on it), lowest first. */
export function lowSuggestions(
  rows: readonly LowSuggestion[] | undefined,
  list: ReadonlyArray<{ name: string; isPurchased: boolean }>,
): LowSuggestion[] {
  return (rows ?? [])
    .filter((row) => !isOnShoppingList(list, row.name))
    .sort((a, b) => a.percentLeft - b.percentLeft || a.name.localeCompare(b.name))
    .slice(0, MAX_SUGGESTIONS)
}

/** The list row for a suggestion: the same name, full amount, category and "Low stock (20% left)" note as the panel's. */
export function suggestionEntry(row: LowSuggestion): ShoppingEntry {
  return shoppingEntry({
    name: row.name,
    unit: row.unit,
    categoryId: row.categoryId,
    quantity: row.initialQuantity,
    initialQuantity: row.initialQuantity,
    currentQuantity: row.currentQuantity,
    lowStockThreshold: row.lowStockThreshold,
  })
}
