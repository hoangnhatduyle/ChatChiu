import type {
  DashboardSummaryV2,
  InventoryItem,
  RunOutRow,
  StatsOverview,
} from '@chatchiu/contracts';
import { authedHandler, assertMethod } from '../../_lib/handler.js';
import { ApiError } from '../../_lib/errors.js';
import { parseQuery } from '../../_lib/validation.js';
import { preferencesQuery, statsOverviewQuery } from '../../_lib/schemas.js';
import { toCamelList } from '../../_lib/mappers.js';
import { userClock } from '../../_lib/clock.js';
import { fetchAll } from '../../_lib/paging.js';
import { filterWaste, rangeStart, summariseWaste, type WasteRow } from '../../_lib/stats.js';

const RECENTLY_ADDED = 5;

interface ConsumptionRow {
  item_id: number;
  avg_daily_use: number | null;
  run_out_date: string | null;
}

// GET /api/stats/overview?range=week|month|year|all&categoryId= — the Waste & Stats
// page in one call (AC-API-16, F-ST-03…07). range and categoryId filter the waste
// figures (her local dates, ?tz= when she has no preferences yet); stock figures
// are always the whole kitchen. Low-stock rows carry the
// 30-day usage rate and predicted run-out from consumption_stats().
export default authedHandler(async ({ client }, req) => {
  assertMethod(req, ['GET']);
  const { range, categoryId } = parseQuery(req, statsOverviewQuery);
  const { tz } = parseQuery(req, preferencesQuery);
  const { today, timezone } = await userClock(client, tz);
  // A day of margin either side of her local range start; the exact cut is filterWaste's.
  const start = rangeStart(range, today);
  const since =
    start == null ? null : new Date(Date.parse(`${start}T00:00:00Z`) - 86_400_000).toISOString();

  const [summary, consumption, recent, wasteRows] = await Promise.all([
    client.rpc('dashboard_summary_v2', { p_today: today }),
    client.rpc('consumption_stats', { p_today: today, p_tz: timezone }),
    client
      .from('inventory_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(RECENTLY_ADDED),
    fetchAll<WasteRow>((from, to) => {
      let q = client.from('wasted_items').select('*, categories(name)');
      if (since) q = q.gte('wasted_date', since);
      if (categoryId != null) q = q.eq('category_id', categoryId);
      return q.order('wasted_date', { ascending: false }).order('id').range(from, to);
    }, 'waste log'),
  ]);
  for (const r of [summary, consumption, recent]) {
    if (r.error) throw new ApiError('INTERNAL', 'Failed to load statistics', r.error);
  }

  const s = summary.data as DashboardSummaryV2;
  const rates = new Map(((consumption.data ?? []) as ConsumptionRow[]).map((c) => [c.item_id, c]));
  const lowStock: RunOutRow[] = s.lowStock.map((row) => {
    const rate = rates.get(row.id);
    return {
      ...row,
      currentQuantity: Number(row.currentQuantity),
      initialQuantity: Number(row.initialQuantity),
      percentLeft: Number(row.percentLeft),
      lowStockThreshold: Number(row.lowStockThreshold),
      avgDailyUse: rate?.avg_daily_use == null ? null : Number(rate.avg_daily_use),
      runOutDate: rate?.run_out_date ?? null,
    };
  });

  const inRange = filterWaste(wasteRows, { range, categoryId, today, timezone });

  const overview: StatsOverview = {
    range,
    stock: {
      totalItems: s.totalItems,
      totalValue: Number(s.totalValue),
      expiringCount: s.expiringCount,
      expiredCount: s.expiredCount,
    },
    byCategory: s.byCategory,
    byLocation: s.byLocation,
    recentlyAdded: toCamelList(recent.data ?? []) as unknown as InventoryItem[],
    // The 30-day figures are the summary's (rolling 30 days, like the board), so the
    // two never disagree on one page; range and categoryId shape the rest.
    waste: summariseWaste(inRange, timezone, {
      count: s.waste30dCount,
      value: Number(s.waste30dValue),
    }),
    lowStock,
  };
  return overview;
});
