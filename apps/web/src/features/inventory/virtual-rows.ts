// The rows of the virtual list (F-IN-04, F-IN-06): group headers and items flattened into one list, so
// one virtualizer positions both and only a window of rows is in the page.
import type { InventoryItem } from '@chatchiu/contracts'

export type ListRow =
  | { kind: 'header'; key: string; label: string; count: number }
  /** `position` counts items only (headers are not items), for "3 of 300" announcements. */
  | { kind: 'item'; key: string; item: InventoryItem; position: number }

export const HEADER_HEIGHT = 44
export const CARD_HEIGHT = 128
export const TABLE_ROW_HEIGHT = 60

export function flattenGroups(
  groups: ReadonlyArray<{ key: number | null; items: InventoryItem[] }>,
  grouped: boolean,
  labelOf: (key: number | null) => string,
): ListRow[] {
  const rows: ListRow[] = []
  let position = 0
  for (const group of groups) {
    if (grouped) {
      rows.push({
        kind: 'header',
        key: `header-${group.key ?? 'none'}`,
        label: labelOf(group.key),
        count: group.items.length,
      })
    }
    for (const item of group.items) {
      position += 1
      rows.push({ kind: 'item', key: `item-${item.id}`, item, position })
    }
  }
  return rows
}
