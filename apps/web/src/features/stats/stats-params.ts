// The stats page's state that lives in the URL (CS-STATE-HOMES): the waste time range and category.
// Unknown values fall back to the defaults (all time, all categories).
import type { WasteRange } from '@chatchiu/domain'

export const RANGES: ReadonlyArray<WasteRange> = ['week', 'month', 'year', 'all']
export const DEFAULT_RANGE: WasteRange = 'all'
const ID = /^\d+$/
/** The largest id the database holds (a 32-bit integer): anything above is not a category. */
const MAX_ID = 2_147_483_647

export function parseStatsParams(
  params: URLSearchParams,
  knownCategoryIds: readonly number[] | undefined,
): { range: WasteRange; categoryId: number | null } {
  const range = RANGES.find((r) => r === params.get('range')) ?? DEFAULT_RANGE
  const raw = params.get('category')
  const id = raw !== null && ID.test(raw) ? Number(raw) : null
  // Until the categories have loaded the id is kept; once they have, one that no longer exists is dropped.
  const categoryId =
    id !== null && id > 0 && id <= MAX_ID && (knownCategoryIds?.includes(id) ?? true) ? id : null
  return { range, categoryId }
}

export function statsSearch(range: WasteRange, categoryId: number | null): string {
  const next = new URLSearchParams()
  if (range !== DEFAULT_RANGE) next.set('range', range)
  if (categoryId !== null) next.set('category', String(categoryId))
  const text = next.toString()
  return text ? `?${text}` : ''
}
