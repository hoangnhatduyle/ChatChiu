import { z } from 'zod'
import { idSchema } from './fields.js'
import type { InventoryItem } from './inventory.js'

export const statsRange = z.enum(['week', 'month', 'year', 'all'])
export type StatsRange = z.infer<typeof statsRange>

/** GET /api/stats/overview — range defaults to all, like the old waste page. */
export const statsOverviewQuery = z.object({
  range: statsRange.optional().default('all'),
  categoryId: idSchema.optional(),
})
export type StatsOverviewQuery = z.infer<typeof statsOverviewQuery>

export interface ExpiringRow {
  id: number
  name: string
  expirationDate: string
  quantity: number
  unit: string
  categoryId: number
  locationId: number | null
}

export interface LowStockRow {
  id: number
  name: string
  unit: string
  categoryId: number
  currentQuantity: number
  initialQuantity: number
  percentLeft: number
  lowStockThreshold: number
}

/** dashboard_summary_v2(): old keys, %-based low stock, value = Σ price × current (F-ST-05). */
export interface DashboardSummaryV2 {
  totalItems: number
  totalValue: number
  expiringCount: number
  expiredCount: number
  lowStockCount: number
  expiringSoon: ExpiringRow[]
  lowStock: LowStockRow[]
  byCategory: Array<{ categoryId: number; category: string; count: number; value: number }>
  byLocation: Array<{ locationId: number | null; location: string; count: number }>
  waste30dCount: number
  waste30dValue: number
}

export interface RunOutRow extends LowStockRow {
  /** Average daily use over the last 30 days; null without history. */
  avgDailyUse: number | null
  /** YYYY-MM-DD; null when it can't be predicted. */
  runOutDate: string | null
}

export interface WastedItemStat {
  itemName: string
  timesWasted: number
  totalValue: number
}

/** GET /api/stats/overview (AC-API-16, F-ST-03…07). */
export interface StatsOverview {
  range: StatsRange
  stock: Pick<DashboardSummaryV2, 'totalItems' | 'totalValue' | 'expiringCount' | 'expiredCount'>
  byCategory: DashboardSummaryV2['byCategory']
  byLocation: DashboardSummaryV2['byLocation']
  recentlyAdded: InventoryItem[]
  waste: {
    totalItems: number
    totalValue: number
    last30dCount: number
    last30dValue: number
    byMonth: Array<{ month: string; itemsWasted: number; valueLost: number }>
    byCategory: Array<{
      categoryId: number | null
      categoryName: string | null
      itemsWasted: number
      valueLost: number
    }>
    mostWastedByCount: WastedItemStat[]
    mostWastedByValue: WastedItemStat[]
  }
  lowStock: RunOutRow[]
}
