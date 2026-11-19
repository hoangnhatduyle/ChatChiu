// Statistics (step 4.4): read only. They follow from the pantry and the waste log, so they are
// refreshed by the next read, never by a write.
import type { StatsOverview, StatsRange } from '@chatchiu/contracts'
import type { WasteRange } from '@chatchiu/domain'
import { queryKeys, useApiQuery } from './query'

// The API's range (contracts) and the waste log's range (domain) are one union spelled twice: this fails to
// compile if either changes alone (7.0.31e).
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never
export type RangesAgree = Same<StatsRange, WasteRange> extends true ? true : never
export const rangesAgree: RangesAgree = true

export const useStatsOverviewQuery = (range: StatsRange = 'all', categoryId?: number) =>
  useApiQuery<StatsOverview>(queryKeys.stats(range, categoryId), '/api/stats/overview', {
    range,
    categoryId,
  })
