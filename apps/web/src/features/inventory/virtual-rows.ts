// The rows of the virtual list (F-IN-04, F-IN-06): group headers and items flattened into one list, so
// one virtualizer positions both and only a window of rows is in the page. With more than one column the items
// of a group are cut into rows of that many cards, so the virtual list still works on whole rows.
import type { InventoryItem } from '@chatchiu/contracts'
import { rowKey } from '../../data/resource'

export type ListEntry = { item: InventoryItem; position: number }

export type ListRow =
  | { kind: 'header'; key: string; groupKey: number | null; label: string; count: number }
  /** `position` counts items only (headers are not items), for "3 of 300" announcements. */
  | { kind: 'item'; key: string; item: InventoryItem; position: number }
  /** A row of 2 or 3 cards side by side (the shelves view on a wide screen). */
  | { kind: 'cards'; key: string; entries: ListEntry[] }

export const HEADER_HEIGHT = 44
export const CARD_HEIGHT = 128
export const TABLE_ROW_HEIGHT = 60
/** The shelves view: a shelf-label header row and a card row, each with its gap included. */
export const SHELF_HEADER_HEIGHT = 76
export const SHELF_CARD_HEIGHT = 156

export function flattenGroups(
  groups: ReadonlyArray<{ key: number | null; items: InventoryItem[] }>,
  grouped: boolean,
  labelOf: (key: number | null) => string,
  columns = 1,
): ListRow[] {
  const rows: ListRow[] = []
  let position = 0
  for (const group of groups) {
    if (grouped) {
      rows.push({
        kind: 'header',
        key: `header-${group.key ?? 'none'}`,
        groupKey: group.key,
        label: labelOf(group.key),
        count: group.items.length,
      })
    }
    const entries = group.items.map((item) => ({ item, position: (position += 1) }))
    if (columns <= 1) {
      for (const { item, position: at } of entries) {
        rows.push({ kind: 'item', key: `item-${rowKey('inventory', item.id)}`, item, position: at })
      }
      continue
    }
    for (let start = 0; start < entries.length; start += columns) {
      const chunk = entries.slice(start, start + columns)
      rows.push({
        kind: 'cards',
        key: `cards-${rowKey('inventory', chunk[0]!.item.id)}`,
        entries: chunk,
      })
    }
  }
  return rows
}
