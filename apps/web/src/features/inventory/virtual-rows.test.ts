// F-IN-06 with columns: a group's items are cut into rows of N cards; headers stay their own rows and the item
// positions keep counting across groups.
import type { InventoryItem } from '@chatchiu/contracts'
import { flattenGroups } from './virtual-rows'

const item = (id: number) => ({ id, name: `Item ${id}` }) as unknown as InventoryItem
const groups = [
  { key: 1, items: [item(1), item(2), item(3), item(4), item(5)] },
  { key: null, items: [item(6)] },
]
const label = (key: number | null) => (key === null ? 'No location' : `Place ${key}`)

describe('flattenGroups', () => {
  it('one column: a header per group, one row per item', () => {
    const rows = flattenGroups(groups, true, label)
    expect(rows.map((r) => r.kind)).toEqual([
      'header',
      'item',
      'item',
      'item',
      'item',
      'item',
      'header',
      'item',
    ])
    expect(rows[0]).toMatchObject({ kind: 'header', groupKey: 1, label: 'Place 1', count: 5 })
  })

  it('three columns: rows of up to 3 cards, a short last row, positions count items only', () => {
    const rows = flattenGroups(groups, true, label, 3)
    expect(rows.map((r) => (r.kind === 'cards' ? r.entries.length : r.kind))).toEqual([
      'header',
      3,
      2,
      'header',
      1,
    ])
    const positions = rows.flatMap((r) =>
      r.kind === 'cards' ? r.entries.map((e) => e.position) : [],
    )
    expect(positions).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('ungrouped: no headers', () => {
    expect(
      flattenGroups([{ key: null, items: [item(1), item(2)] }], false, label, 2).map((r) => r.kind),
    ).toEqual(['cards'])
  })

  it('row keys are unique', () => {
    const rows = flattenGroups(groups, true, label, 2)
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length)
  })
})
