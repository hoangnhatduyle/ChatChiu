// F-SL-09: the Running low suggestions.
import {
  lowSuggestions,
  MAX_SUGGESTIONS,
  suggestionEntry,
  type LowSuggestion,
} from './low-suggestions'

const row = (
  name: string,
  percentLeft: number,
  extra: Partial<LowSuggestion> = {},
): LowSuggestion => ({
  id: name.length * 100 + percentLeft,
  name,
  unit: 'pcs',
  categoryId: 3,
  currentQuantity: percentLeft / 100,
  initialQuantity: 1,
  percentLeft,
  lowStockThreshold: 20,
  ...extra,
})

describe('lowSuggestions', () => {
  it('lists the lowest first, ties by name', () => {
    const out = lowSuggestions([row('Rice', 15), row('Milk', 5), row('Eggs', 15)], [])
    expect(out.map((r) => r.name)).toEqual(['Milk', 'Eggs', 'Rice'])
  })

  it('leaves out what is already on the list, whatever the case or spacing', () => {
    const list = [{ name: '  milk ', isPurchased: false }]
    expect(lowSuggestions([row('Milk', 5), row('Eggs', 10)], list).map((r) => r.name)).toEqual([
      'Eggs',
    ])
  })

  it('a bought row does not hide the suggestion (it needs buying again)', () => {
    expect(lowSuggestions([row('Milk', 5)], [{ name: 'Milk', isPurchased: true }])).toHaveLength(1)
  })

  it('shows at most six and copes with no data', () => {
    const many = Array.from({ length: 10 }, (_, i) => row(`Item ${i}`, i))
    expect(lowSuggestions(many, [])).toHaveLength(MAX_SUGGESTIONS)
    expect(lowSuggestions(undefined, [])).toEqual([])
  })

  it('does not change the rows it was given', () => {
    const rows = [row('B', 10), row('A', 5)]
    lowSuggestions(rows, [])
    expect(rows.map((r) => r.name)).toEqual(['B', 'A'])
  })
})

describe('suggestionEntry', () => {
  it('is the same entry the item panel adds: name, full amount, category and why', () => {
    expect(
      suggestionEntry(row('Milk', 15, { unit: 'L', initialQuantity: 2, currentQuantity: 0.3 })),
    ).toEqual({
      name: 'Milk',
      quantity: '2 L',
      notes: 'Low stock (15% left)',
      categoryId: 3,
    })
  })
})
