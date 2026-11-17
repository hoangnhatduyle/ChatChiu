import type { StatsOverview, StatsRange, WastedItemStat } from '@chatchiu/contracts';
import { addDays, roundMoney, todayInTimeZone, wasteValue } from '@chatchiu/domain';

/** First local date inside each range (inclusive); null = no lower bound. */
const RANGE_DAYS: Record<StatsRange, number | null> = { week: 7, month: 30, year: 365, all: null };
const TOP_WASTED = 5;

export interface WasteRow {
  item_name: string;
  category_id: number | null;
  quantity: number;
  price: number | null;
  wasted_date: string;
  categories: { name: string } | null;
}

/** Her first local date inside the range, or null for "all". */
export function rangeStart(range: StatsRange, today: string): string | null {
  const days = RANGE_DAYS[range];
  return days == null ? null : addDays(today, -(days - 1));
}

/** Waste entries in range (dated in her timezone) and, optionally, one category. */
export function filterWaste(
  rows: readonly WasteRow[],
  opts: { range: StatsRange; categoryId?: number; today: string; timezone: string },
): WasteRow[] {
  const start = rangeStart(opts.range, opts.today);
  return rows.filter(
    (r) =>
      (opts.categoryId == null || r.category_id === opts.categoryId) &&
      (start == null || todayInTimeZone(opts.timezone, new Date(r.wasted_date)) >= start),
  );
}

/** Totals, by month, by category and the most wasted items (F-ST-03/04/07). */
export function summariseWaste(
  rows: readonly WasteRow[],
  timezone: string,
  last30d: { count: number; value: number },
): StatsOverview['waste'] {
  const value = (r: WasteRow) => wasteValue({ price: r.price, quantity: Number(r.quantity) });
  const sum = (list: readonly WasteRow[]) => roundMoney(list.reduce((s, r) => s + value(r), 0));

  const byMonth = new Map<string, WasteRow[]>();
  const byCategory = new Map<number | null, WasteRow[]>();
  const byItem = new Map<string, { itemName: string; rows: WasteRow[] }>();
  for (const r of rows) {
    const month = todayInTimeZone(timezone, new Date(r.wasted_date)).slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), r]);
    byCategory.set(r.category_id, [...(byCategory.get(r.category_id) ?? []), r]);
    const key = r.item_name.trim().toLowerCase();
    const entry = byItem.get(key) ?? { itemName: r.item_name.trim(), rows: [] };
    byItem.set(key, { ...entry, rows: [...entry.rows, r] });
  }

  const items: WastedItemStat[] = [...byItem.values()].map(({ itemName, rows: list }) => ({
    itemName,
    timesWasted: list.length,
    totalValue: sum(list),
  }));
  const byCount = [...items].sort(
    (a, b) =>
      b.timesWasted - a.timesWasted ||
      b.totalValue - a.totalValue ||
      a.itemName.localeCompare(b.itemName),
  );
  const byValue = [...items].sort(
    (a, b) =>
      b.totalValue - a.totalValue ||
      b.timesWasted - a.timesWasted ||
      a.itemName.localeCompare(b.itemName),
  );

  return {
    totalItems: rows.length,
    totalValue: sum(rows),
    last30dCount: last30d.count,
    last30dValue: last30d.value,
    byMonth: [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, list]) => ({ month, itemsWasted: list.length, valueLost: sum(list) })),
    byCategory: [...byCategory.entries()]
      .map(([categoryId, list]) => ({
        categoryId,
        categoryName: list[0]?.categories?.name ?? null,
        itemsWasted: list.length,
        valueLost: sum(list),
      }))
      .sort((a, b) => b.valueLost - a.valueLost || b.itemsWasted - a.itemsWasted),
    mostWastedByCount: byCount.slice(0, TOP_WASTED),
    mostWastedByValue: byValue.slice(0, TOP_WASTED),
  };
}
