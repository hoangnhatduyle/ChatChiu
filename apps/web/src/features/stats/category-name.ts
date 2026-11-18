// A waste entry's category name: the one the API joins, then the loaded categories, then "No category".
// Never "Unknown" for an entry that has a category (NC-ST-NO-UNKNOWN-CATEGORY).
import type { Category, WasteEntry } from '@chatchiu/contracts'

export const NO_CATEGORY = 'No category'

export function categoryName(entry: WasteEntry, categories: readonly Category[]): string {
  if (entry.categoryName) return entry.categoryName
  return categories.find((c) => c.id === entry.categoryId)?.name ?? NO_CATEGORY
}
