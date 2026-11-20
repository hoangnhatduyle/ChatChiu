// The stock-value ring: which slices, in what order, and its gradient.
import { ringGradient, ringRows, MAX_SLICES } from './ring'

const row = (categoryId: number, category: string, count: number, value: number) => ({
  categoryId,
  category,
  count,
  value,
})
const colourOf = (id: number) => `#00${id}000`

describe('ringRows', () => {
  it('sorts by value, biggest first, ties by count then name', () => {
    const rows = ringRows([row(1, 'B', 1, 5), row(2, 'A', 3, 5), row(3, 'C', 1, 9)], colourOf)
    expect(rows.map((r) => r.label)).toEqual(['C', 'A', 'B'])
    expect(rows[0]).toMatchObject({ key: '3', count: 1, value: 9, colour: '#003000' })
  })

  it('keeps the biggest ones and folds the rest into Other', () => {
    const many = Array.from({ length: 10 }, (_, i) => row(i + 1, `Cat ${i + 1}`, 1, 100 - i)) // 100 .. 91
    const rows = ringRows(many, colourOf)
    expect(rows).toHaveLength(MAX_SLICES)
    const other = rows.at(-1)!
    expect(other.label).toBe('Other')
    // the 8th to 10th biggest: 93 + 92 + 91
    expect(other.count).toBe(3)
    expect(other.value).toBe(93 + 92 + 91)
  })

  it('never changes the rows it was given', () => {
    const rows = [row(1, 'B', 1, 1), row(2, 'A', 1, 2)]
    ringRows(rows, colourOf)
    expect(rows.map((r) => r.category)).toEqual(['B', 'A'])
  })
})

describe('ringGradient', () => {
  it('paints each slice for its share of the value, with a thin gap in the surface colour', () => {
    const css = ringGradient([
      { key: 'a', label: 'A', count: 1, value: 75, colour: '#111111' },
      { key: 'b', label: 'B', count: 1, value: 25, colour: '#222222' },
    ])
    expect(css).toMatch(/^conic-gradient\(/)
    expect(css).toContain('#111111 0%')
    expect(css).toContain('#222222 75%')
    expect(css).toContain('var(--surface)')
  })

  it('is an empty track when there is no value to show', () => {
    expect(ringGradient([])).toBe('conic-gradient(var(--track) 0% 100%)')
    expect(ringGradient([{ key: 'a', label: 'A', count: 2, value: 0, colour: '#111111' }])).toBe(
      'conic-gradient(var(--track) 0% 100%)',
    )
  })
})
