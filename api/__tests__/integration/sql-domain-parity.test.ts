import {
  averageDailyUse,
  isLowStock,
  percentLeft,
  predictRunOutDate,
  stockValue,
} from '@chatchiu/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, createCategory, createTestUser, deleteTestUser, type TestUser } from './helpers.js';

// AR-ONE-DEFINITION: where SQL must compute a business rule, a test checks that
// it agrees with packages/domain on the same rows (low stock, % left, stock value,
// consumption rate and run-out).

interface Row {
  id: number;
  quantity: number;
  initial_quantity: number | null;
  current_quantity: number | null;
  low_stock_threshold: number | null;
  price: number | null;
}

const fixtures: Array<Omit<Row, 'id'> & { name: string }> = [
  { name: 'Milk 15%', quantity: 1, initial_quantity: 1, current_quantity: 0.15, low_stock_threshold: 20, price: 2 },
  { name: 'Flour 5 of 100', quantity: 100, initial_quantity: 100, current_quantity: 5, low_stock_threshold: 20, price: 0.01 },
  { name: 'Salt 5 of 5', quantity: 5, initial_quantity: 5, current_quantity: 5, low_stock_threshold: 20, price: null },
  { name: 'Old row', quantity: 2, initial_quantity: null, current_quantity: null, low_stock_threshold: null, price: 1.5 },
  { name: 'Edge 7 at 7', quantity: 1, initial_quantity: 1, current_quantity: 0.07, low_stock_threshold: 7, price: 0 },
  { name: 'Edge 29 at 29', quantity: 1, initial_quantity: 1, current_quantity: 0.29, low_stock_threshold: 29, price: 3 },
  { name: 'Just above', quantity: 3, initial_quantity: 3, current_quantity: 0.6000003, low_stock_threshold: 20, price: 0.4 },
  { name: 'Used up', quantity: 1, initial_quantity: 1, current_quantity: 0, low_stock_threshold: 20, price: 1 },
  { name: 'Zero full', quantity: 0, initial_quantity: null, current_quantity: null, low_stock_threshold: 20, price: 1 },
];

let user: TestUser;
let rows: Row[] = [];

const camel = (r: Row) => ({
  quantity: r.quantity,
  initialQuantity: r.initial_quantity,
  currentQuantity: r.current_quantity,
  lowStockThreshold: r.low_stock_threshold,
  price: r.price,
});

beforeAll(async () => {
  user = await createTestUser('parity');
  const category = await createCategory(user, 'Mixed');
  const { data, error } = await admin
    .from('inventory_items')
    .insert(
      fixtures.map((f) => ({ ...f, user_id: user.id, category_id: category.id, unit: 'piece', expiration_date: '2027-01-01' })),
    )
    .select('id, quantity, initial_quantity, current_quantity, low_stock_threshold, price');
  if (error) throw new Error(error.message);
  rows = (data ?? []).map((r) => ({
    ...r,
    quantity: Number(r.quantity),
    initial_quantity: r.initial_quantity == null ? null : Number(r.initial_quantity),
    current_quantity: r.current_quantity == null ? null : Number(r.current_quantity),
    low_stock_threshold: r.low_stock_threshold == null ? null : Number(r.low_stock_threshold),
    price: r.price == null ? null : Number(r.price),
  })) as Row[];
  expect(rows).toHaveLength(fixtures.length);
});

afterAll(async () => {
  await deleteTestUser(user);
});

describe('SQL and packages/domain agree (AR-ONE-DEFINITION)', () => {
  it('AC-DATA-04: dashboard_summary_v2 low stock and % left match isLowStock / percentLeft', async () => {
    const { data, error } = await user.db.rpc('dashboard_summary_v2', { p_today: '2026-11-16' });
    expect(error).toBeNull();
    const summary = data as { lowStock: Array<{ id: number; percentLeft: number }>; lowStockCount: number };
    const sqlLow = summary.lowStock.map((r) => r.id).sort((a, b) => a - b);
    const domainLow = rows.filter((r) => isLowStock(camel(r))).map((r) => r.id).sort((a, b) => a - b);
    expect(sqlLow).toEqual(domainLow);
    expect(summary.lowStockCount).toBe(domainLow.length);
    for (const r of summary.lowStock) {
      const row = rows.find((x) => x.id === r.id);
      expect(Number(r.percentLeft)).toBe(percentLeft(camel(row as Row)));
    }
  });

  it('F-ST-05: totalValue matches Σ stockValue', async () => {
    const { data, error } = await user.db.rpc('dashboard_summary_v2', { p_today: '2026-11-16' });
    expect(error).toBeNull();
    const expected = rows.reduce((sum, r) => sum + stockValue(camel(r)), 0);
    expect(Number((data as { totalValue: number }).totalValue)).toBeCloseTo(expected, 2);
  });

  it('F-KB-10: item_consumption matches averageDailyUse / predictRunOutDate in her timezone', async () => {
    // Fixed instants and a fixed "today" so the test never depends on the clock.
    const tz = 'Asia/Ho_Chi_Minh';
    const today = '2026-11-16';
    const item = rows.find((r) => r.current_quantity === 5) as Row;
    const usage = [
      { amountUsed: 2, recordedAt: '2026-11-07T03:00:00Z' },
      { amountUsed: 1, recordedAt: '2026-11-14T10:00:00Z' },
      // 18:30Z on the 15th is already the 16th in Ho Chi Minh City
      { amountUsed: 0.5, recordedAt: '2026-11-15T18:30:00Z' },
      { amountUsed: 9, recordedAt: '2026-10-01T03:00:00Z' },
    ];
    const { error } = await admin.from('usage_history').insert(
      usage.map((u) => ({
        item_id: item.id,
        user_id: user.id,
        amount_used: u.amountUsed,
        remaining_amount: 5,
        recorded_at: u.recordedAt,
      })),
    );
    expect(error).toBeNull();

    const { data, error: rpcError } = await user.db.rpc('item_consumption', {
      p_item_id: item.id,
      p_today: today,
      p_tz: tz,
    });
    expect(rpcError).toBeNull();
    const sql = (data as Array<{ avg_daily_use: number | null; run_out_date: string | null }>)[0];
    const rate = averageDailyUse(usage, today, tz);
    expect(rate).not.toBeNull();
    expect(Number(sql?.avg_daily_use)).toBeCloseTo(rate as number, 10);
    expect(sql?.run_out_date).toBe(predictRunOutDate(5, rate, today));
  });
});
