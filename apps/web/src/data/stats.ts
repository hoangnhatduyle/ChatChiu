// Statistics (step 4.4): read only. They follow from the pantry and the waste log, so they are
// refreshed by the next read, never by a write.
import type { StatsOverview, StatsRange } from '@chatchiu/contracts'
import { queryKeys, useApiQuery } from './query'

export const useStatsOverviewQuery = (range: StatsRange = 'all', categoryId?: number) =>
  useApiQuery<StatsOverview>(queryKeys.stats(range, categoryId), '/api/stats/overview', {
    range,
    categoryId,
  })
