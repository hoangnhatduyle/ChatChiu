// Shopping list rules (SPEC-SL-001): purchased rows sink to the bottom, grouping by category, the
// pending/purchased counts, and the share text. Pure; the page only shows what these return.

export interface ShoppingLike {
  id: number
  name: string
  quantity: string | null
  isPurchased: boolean
  categoryId: number | null
}

/** Pending rows first, then purchased ones, each part in the order given (F-SL-05). A new array. */
export function sinkPurchased<T extends ShoppingLike>(rows: readonly T[]): T[] {
  return [...rows.filter((r) => !r.isPurchased), ...rows.filter((r) => r.isPurchased)]
}

/**
 * Groups by category in order of first appearance, the "no category" group last; inside each group the
 * purchased rows sink (F-SL-05).
 */
export function groupShoppingByCategory<T extends ShoppingLike>(
  rows: readonly T[],
): Array<{ key: number | null; items: T[] }> {
  const groups = new Map<number | null, T[]>()
  for (const row of rows) {
    const group = groups.get(row.categoryId)
    if (group) group.push(row)
    else groups.set(row.categoryId, [row])
  }
  const entries = [...groups.entries()].map(([key, items]) => ({
    key,
    items: sinkPurchased(items),
  }))
  return [...entries.filter((g) => g.key !== null), ...entries.filter((g) => g.key === null)]
}

export function shoppingCounts(rows: readonly ShoppingLike[]): {
  pending: number
  purchased: number
} {
  const purchased = rows.filter((r) => r.isPurchased).length
  return { pending: rows.length - purchased, purchased }
}

/** Any run of whitespace, newlines and Unicode line separators included, as one space: one item stays on one line. */
const oneLine = (text: string): string => text.replace(/\s+/gu, ' ').trim()

/** "Shopping List:\n- Eggs (10)\n- Milk": the pending items (F-SL-06); null when there is nothing to share. */
export function shoppingShareText(rows: readonly ShoppingLike[]): string | null {
  const pending = rows.filter((r) => !r.isPurchased)
  if (pending.length === 0) return null
  const lines = pending.map((r) => {
    const name = oneLine(r.name)
    const quantity = oneLine(r.quantity ?? '')
    return quantity ? `- ${name} (${quantity})` : `- ${name}`
  })
  return `Shopping List:\n${lines.join('\n')}`
}
