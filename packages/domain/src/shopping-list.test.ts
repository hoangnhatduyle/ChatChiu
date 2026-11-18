// Shopping list rules (SPEC-SL-001): purchased rows sink, grouping by category, counts, and the share text.
import { describe, expect, it } from 'vitest'
import {
  groupShoppingByCategory,
  shoppingCounts,
  shoppingShareText,
  sinkPurchased,
} from './shopping-list.js'

const row = (
  id: number,
  name: string,
  extra: Partial<{ quantity: string | null; isPurchased: boolean; categoryId: number | null }> = {},
) => ({ id, name, quantity: null, isPurchased: false, categoryId: null, ...extra })

describe('sinkPurchased (F-SL-05)', () => {
  it('keeps the order inside each part and puts purchased rows last', () => {
    const rows = [
      row(1, 'A', { isPurchased: true }),
      row(2, 'B'),
      row(3, 'C', { isPurchased: true }),
      row(4, 'D'),
    ]
    expect(sinkPurchased(rows).map((r) => r.id)).toEqual([2, 4, 1, 3])
  })

  it('does not mutate its input', () => {
    const rows = [row(1, 'A', { isPurchased: true }), row(2, 'B')]
    sinkPurchased(rows)
    expect(rows.map((r) => r.id)).toEqual([1, 2])
  })
})

describe('groupShoppingByCategory (F-SL-05)', () => {
  it('groups in order of first appearance, purchased last in each group, no category last', () => {
    const rows = [
      row(1, 'Eggs', { categoryId: 5, isPurchased: true }),
      row(2, 'Soap'),
      row(3, 'Milk', { categoryId: 5 }),
      row(4, 'Rice', { categoryId: 6 }),
    ]
    const groups = groupShoppingByCategory(rows)
    expect(groups.map((g) => g.key)).toEqual([5, 6, null])
    expect(groups[0]!.items.map((r) => r.id)).toEqual([3, 1])
  })
})

describe('shoppingCounts (F-SL-08)', () => {
  it('counts pending and purchased', () => {
    const rows = [row(1, 'a'), row(2, 'b'), row(3, 'c', { isPurchased: true })]
    expect(shoppingCounts(rows)).toEqual({ pending: 2, purchased: 1 })
  })
})

describe('shoppingShareText (F-SL-06)', () => {
  it('lists the pending items as "- name (quantity)", the old app\'s text', () => {
    const rows = [
      row(1, 'Eggs', { quantity: '10' }),
      row(2, 'Milk'),
      row(3, 'Bread', { isPurchased: true }),
    ]
    expect(shoppingShareText(rows)).toBe('Shopping List:\n- Eggs (10)\n- Milk')
  })

  it('an empty or blank quantity adds no brackets; nothing pending shares nothing', () => {
    expect(shoppingShareText([row(1, 'Milk', { quantity: '  ' })])).toBe('Shopping List:\n- Milk')
    expect(shoppingShareText([row(1, 'Milk', { isPurchased: true })])).toBeNull()
  })
})

describe('review fixes', () => {
  it('a newline or line separator inside a name or quantity does not break the one-line-per-item format', () => {
    const rows = [row(1, 'Oat\nmilk', { quantity: '2\u2028bags' }), row(2, '  Rice  ')]
    expect(shoppingShareText(rows)).toBe('Shopping List:\n- Oat milk (2 bags)\n- Rice')
  })

  it('groups a few thousand rows without copying the group for every row', () => {
    const rows = Array.from({ length: 5000 }, (_, i) => row(i, `n${i}`, { categoryId: i % 3 }))
    expect(groupShoppingByCategory(rows).map((g) => g.items.length)).toEqual([1667, 1667, 1666])
  })
})
