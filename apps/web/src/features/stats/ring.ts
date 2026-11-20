// The stock-value ring (F-ST-05): one slice per category, biggest first, the smallest folded into "Other" so the ring
// stays readable. The values are the API's `byCategory` (price × current quantity); the colours are the
// categories' own. Pure, so the shape of the ring is tested without a browser.
import type { StatsOverview } from '@chatchiu/contracts'
import { NEUTRAL_CATEGORY_COLOUR, safeCategoryColour } from '../../ui/category-colours'

export const MAX_SLICES = 8
const OTHER_KEY = 'other'
/** The thin gap between slices, in percent of the ring. */
const GAP_PERCENT = 0.6

export type RingRow = { key: string; label: string; count: number; value: number; colour: string }

export function ringRows(
  rows: StatsOverview['byCategory'],
  colourOf: (categoryId: number) => string | null | undefined,
): RingRow[] {
  const sorted = [...rows]
    .sort((a, b) => b.value - a.value || b.count - a.count || a.category.localeCompare(b.category))
    .map((r) => ({
      key: String(r.categoryId),
      label: r.category,
      count: r.count,
      value: r.value,
      colour: safeCategoryColour(colourOf(r.categoryId)),
    }))
  if (sorted.length <= MAX_SLICES) return sorted
  const kept = sorted.slice(0, MAX_SLICES - 1)
  const rest = sorted.slice(MAX_SLICES - 1)
  return [
    ...kept,
    {
      key: OTHER_KEY,
      label: 'Other',
      count: rest.reduce((sum, r) => sum + r.count, 0),
      value: rest.reduce((sum, r) => sum + r.value, 0),
      colour: NEUTRAL_CATEGORY_COLOUR,
    },
  ]
}

/** A conic gradient with one arc per row (by value) and a thin gap in the surface colour between them. */
export function ringGradient(rows: readonly RingRow[]): string {
  const total = rows.reduce((sum, r) => sum + Math.max(0, r.value), 0)
  if (total <= 0) return 'conic-gradient(var(--track) 0% 100%)'
  const stops: string[] = []
  let start = 0
  for (const r of rows) {
    if (r.value <= 0) continue
    const end = start + (r.value / total) * 100
    const paintedEnd = Math.max(start, end - GAP_PERCENT)
    stops.push(
      `${r.colour} ${start}%`,
      `${r.colour} ${paintedEnd}%`,
      `var(--surface) ${paintedEnd}%`,
      `var(--surface) ${end}%`,
    )
    start = end
  }
  return `conic-gradient(${stops.join(', ')})`
}
