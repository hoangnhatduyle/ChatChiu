import { addDays, todayInTimeZone } from '@chatchiu/domain';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  admin,
  callApi,
  createCategory,
  createLocation,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers.js';

// Step 2.4: new and changed routes (architecture.md §3.4, SPEC-API-001), against
// local Supabase with two users. Every test creates its own categories (AC-DATA-07).

type Data<T> = { data: T };
type Err = { error: { code: string; message: string; details?: unknown; existingId?: number } };
type Item = {
  id: number;
  name: string;
  quantity: number;
  initialQuantity: number | null;
  currentQuantity: number | null;
  price: number | null;
  expirationDate: string;
  lowStockNotifiedAt: string | null;
};

let alice: TestUser;
let bob: TestUser;
let aliceCat: number;
let bobCat: number;
let aliceLoc: number;
const today = todayInTimeZone('UTC');

async function item(user: TestUser, categoryId: number, body: Record<string, unknown>) {
  const res = await callApi<Data<Item>>('POST', 'inventory', {
    user,
    body: { unit: 'piece', expirationDate: addDays(today, 30), ...body, categoryId },
  });
  if (res.status !== 200) throw new Error(JSON.stringify(res.body));
  return res.body.data;
}

const data = <T>(res: { status: number; body: unknown }): T => {
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  expect(Object.keys(res.body as object)).toEqual(['data']);
  return (res.body as Data<T>).data;
};

const error = (res: { status: number; body: unknown }, status: number, code: string) => {
  expect(res.status, JSON.stringify(res.body)).toBe(status);
  expect((res.body as Err).error.code).toBe(code);
  return (res.body as Err).error;
};

beforeAll(async () => {
  alice = await createTestUser('alice-v2');
  bob = await createTestUser('bob-v2');
  aliceCat = (await createCategory(alice, 'Dairy')).id;
  bobCat = (await createCategory(bob, 'Dairy')).id;
  aliceLoc = (await createLocation(alice, 'Fridge')).id;
});

afterAll(async () => {
  await deleteTestUser(alice);
  await deleteTestUser(bob);
});

describe('GET /api/bootstrap', () => {
  it('AC-API-06: one response with items, locations, categories and the v2 summary', async () => {
    await item(alice, aliceCat, {
      name: 'Milk',
      quantity: 1,
      initialQuantity: 1,
      currentQuantity: 0.15,
      price: 2,
      locationId: aliceLoc,
    });
    await item(alice, aliceCat, {
      name: 'Eggs',
      quantity: 10,
      initialQuantity: 10,
      currentQuantity: 6,
      price: 0.4,
    });
    const boot = data<{
      items: Item[];
      locations: Array<{ id: number; name: string }>;
      categories: Array<{ id: number; isSystem: boolean }>;
      summary: { totalValue: number; lowStockCount: number; totalItems: number };
    }>(await callApi('GET', 'bootstrap', { user: alice }));
    expect(boot.items.map((i) => i.name).sort()).toEqual(['Eggs', 'Milk']);
    expect(boot.items[0]).toHaveProperty('expirationDate');
    expect(boot.locations.map((l) => l.id)).toEqual([aliceLoc]);
    expect(boot.categories.map((c) => c.id)).toContain(aliceCat);
    // Σ price × current = 2 × 0.15 + 0.4 × 6 = 2.70; Milk (15 %) is the only low item
    expect(Number(boot.summary.totalValue)).toBe(2.7);
    expect(boot.summary.lowStockCount).toBe(1);
  });

  it('AC-API-05: B sees none of A’s rows', async () => {
    const boot = data<{ items: unknown[]; locations: unknown[] }>(
      await callApi('GET', 'bootstrap', { user: bob }),
    );
    expect(boot.items).toEqual([]);
    expect(boot.locations).toEqual([]);
  });
});

describe('usage and usage-undo', () => {
  it('AC-API-07: atomic usage with crossedLowStock, then undo restores 0.6 and removes the row', async () => {
    const milk = await item(alice, aliceCat, {
      name: 'Oat milk',
      quantity: 1,
      initialQuantity: 1,
      currentQuantity: 0.6,
    });
    const logged = data<{
      id: number;
      remainingAmount: number;
      crossedLowStock: boolean;
      item: Item;
    }>(
      await callApi('POST', `inventory/${milk.id}/usage`, {
        user: alice,
        body: { amountUsed: 0.5, currentQuantity: 0.1 },
      }),
    );
    expect(logged.remainingAmount).toBe(0.1);
    // AC-API-02: the old usage-row fields are all still there
    expect(logged).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        itemId: milk.id,
        amountUsed: 0.5,
        notes: null,
        recordedAt: expect.any(String),
      }),
    );
    expect(logged.crossedLowStock).toBe(true);
    expect(logged.item.currentQuantity).toBe(0.1);

    const restored = data<Item>(
      await callApi('POST', `inventory/${milk.id}/usage-undo`, {
        user: alice,
        body: { usageId: logged.id },
      }),
    );
    expect(restored.currentQuantity).toBe(0.6);
    expect(
      data<unknown[]>(await callApi('GET', `inventory/${milk.id}/usage`, { user: alice })),
    ).toEqual([]);

    // usage_entry UNDONE → LOGGED is impossible: the row is gone
    error(
      await callApi('POST', `inventory/${milk.id}/usage-undo`, {
        user: alice,
        body: { usageId: logged.id },
      }),
      404,
      'NOT_FOUND',
    );
  });

  it('AC-API-05: B cannot log or undo usage on A’s item; an undo id from another item is 404', async () => {
    const a = await item(alice, aliceCat, {
      name: 'Cream',
      quantity: 1,
      initialQuantity: 1,
      currentQuantity: 1,
    });
    const b = await item(alice, aliceCat, {
      name: 'Butter',
      quantity: 1,
      initialQuantity: 1,
      currentQuantity: 1,
    });
    const logged = data<{ id: number }>(
      await callApi('POST', `inventory/${a.id}/usage`, {
        user: alice,
        body: { amountUsed: 0.5, currentQuantity: 0.5 },
      }),
    );
    error(
      await callApi('POST', `inventory/${b.id}/usage-undo`, {
        user: alice,
        body: { usageId: logged.id },
      }),
      404,
      'NOT_FOUND',
    );
    error(
      await callApi('POST', `inventory/${a.id}/usage-undo`, {
        user: bob,
        body: { usageId: logged.id },
      }),
      404,
      'NOT_FOUND',
    );
    error(
      await callApi('POST', `inventory/${a.id}/usage`, {
        user: bob,
        body: { amountUsed: 0, currentQuantity: 0 },
      }),
      404,
      'NOT_FOUND',
    );
  });

  it('a usage that raises the amount left is a 400, not a history row', async () => {
    const x = await item(alice, aliceCat, {
      name: 'Yoghurt',
      quantity: 1,
      initialQuantity: 1,
      currentQuantity: 0.2,
    });
    error(
      await callApi('POST', `inventory/${x.id}/usage`, {
        user: alice,
        body: { amountUsed: 0, currentQuantity: 0.9 },
      }),
      400,
      'BAD_REQUEST',
    );
  });
});

describe('POST /api/inventory/:id/restock', () => {
  it('AC-API-08 / AC-DATA-10: refills the same item, per-unit price, clears the low-stock marker', async () => {
    const low = await item(alice, aliceCat, {
      name: 'Juice',
      quantity: 1,
      initialQuantity: 1,
      currentQuantity: 0.1,
      price: 3,
    });
    await admin
      .from('inventory_items')
      .update({ low_stock_notified_at: new Date().toISOString() })
      .eq('id', low.id);
    const before = await admin
      .from('inventory_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', alice.id);
    const restocked = data<Item>(
      await callApi('POST', `inventory/${low.id}/restock`, {
        user: alice,
        body: { quantity: 2, totalPrice: 5, expirationDate: addDays(today, 10) },
      }),
    );
    expect(restocked.id).toBe(low.id);
    expect([restocked.quantity, restocked.initialQuantity, restocked.currentQuantity]).toEqual([
      2, 2, 2,
    ]);
    expect(restocked.price).toBe(2.5);
    expect(restocked.lowStockNotifiedAt).toBeNull();
    expect(restocked.expirationDate).toBe(addDays(today, 10));
    const after = await admin
      .from('inventory_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', alice.id);
    expect(after.count).toBe(before.count);
  });

  it('keeps the price when no total is given; B gets 404', async () => {
    const x = await item(alice, aliceCat, { name: 'Tea', quantity: 1, price: 4 });
    expect(
      data<Item>(
        await callApi('POST', `inventory/${x.id}/restock`, { user: alice, body: { quantity: 1 } }),
      ).price,
    ).toBe(4);
    error(
      await callApi('POST', `inventory/${x.id}/restock`, { user: bob, body: { quantity: 1 } }),
      404,
      'NOT_FOUND',
    );
    error(
      await callApi('POST', `inventory/${x.id}/restock`, { user: alice, body: { quantity: 0 } }),
      400,
      'BAD_REQUEST',
    );
  });
});

describe('/api/inventory/bulk', () => {
  const line = (name: string, categoryId: number) => ({
    name,
    categoryId,
    quantity: 1,
    unit: 'piece',
    expirationDate: addDays(today, 5),
    price: 0.5,
  });

  it('AC-API-09: creates N items in one transaction and returns them', async () => {
    const created = data<Item[]>(
      await callApi('POST', 'inventory/bulk', {
        user: alice,
        body: {
          items: [line('Bulk A', aliceCat), line('Bulk B', aliceCat), line('Bulk C', aliceCat)],
        },
      }),
    );
    expect(created.map((i) => i.name)).toEqual(['Bulk A', 'Bulk B', 'Bulk C']);
  });

  it('AC-API-09: one invalid item rejects the request with 400 and nothing is created', async () => {
    error(
      await callApi('POST', 'inventory/bulk', {
        user: alice,
        body: { items: [line('Bad A', aliceCat), { ...line('Bad B', aliceCat), unit: '' }] },
      }),
      400,
      'BAD_REQUEST',
    );
    const { count } = await admin
      .from('inventory_items')
      .select('id', { count: 'exact', head: true })
      .like('name', 'Bad %');
    expect(count).toBe(0);
  });

  it('AC-API-05: B cannot create items in A’s category (400, nothing created)', async () => {
    error(
      await callApi('POST', 'inventory/bulk', {
        user: bob,
        body: { items: [line('Sneaky', aliceCat)] },
      }),
      400,
      'BAD_REQUEST',
    );
    const { count } = await admin
      .from('inventory_items')
      .select('id', { count: 'exact', head: true })
      .eq('name', 'Sneaky');
    expect(count).toBe(0);
  });

  it('AC-API-10: deletes the caller’s matching items and returns the count', async () => {
    const mine = data<Item[]>(
      await callApi('POST', 'inventory/bulk', {
        user: alice,
        body: { items: [line('Del A', aliceCat), line('Del B', aliceCat)] },
      }),
    );
    const theirs = await item(bob, bobCat, { name: 'Bob keeps', quantity: 1 });
    const res = data<{ deleted: number }>(
      await callApi('DELETE', 'inventory/bulk', {
        user: alice,
        body: { ids: [...mine.map((i) => i.id), theirs.id] },
      }),
    );
    expect(res).toEqual({ deleted: 2 });
    expect((await callApi('GET', `inventory/${theirs.id}`, { user: bob })).status).toBe(200);
  });
});

describe('POST /api/shopping-list/clear-purchased', () => {
  it('AC-API-11: deletes only the tapped ids that are still purchased and hers', async () => {
    const add = async (user: TestUser, name: string, isPurchased: boolean) => {
      const row = data<{ id: number }>(
        await callApi('POST', 'shopping-list', { user, body: { name } }),
      );
      if (isPurchased)
        await callApi('PATCH', `shopping-list/${row.id}`, { user, body: { isPurchased: true } });
      return row.id;
    };
    const a = await add(alice, 'A', true);
    const b = await add(alice, 'B', true);
    const c = await add(alice, 'C', true);
    await add(alice, 'Pending 1', false);
    await add(alice, 'Pending 2', false);
    const unticked = await add(alice, 'Unticked', true);
    await callApi('PATCH', `shopping-list/${unticked}`, {
      user: alice,
      body: { isPurchased: false },
    });
    const bobs = await add(bob, 'Bob bought', true);
    await add(alice, 'D', true); // ticked after the tap: not in ids

    const res = data<{ deleted: number }>(
      await callApi('POST', 'shopping-list/clear-purchased', {
        user: alice,
        body: { ids: [a, b, c, unticked, bobs] },
      }),
    );
    expect(res).toEqual({ deleted: 3 });
    const left = data<Array<{ name: string }>>(
      await callApi('GET', 'shopping-list', { user: alice }),
    );
    expect(left.map((r) => r.name).sort()).toEqual(['D', 'Pending 1', 'Pending 2', 'Unticked']);
    expect(data<unknown[]>(await callApi('GET', 'shopping-list', { user: bob }))).toHaveLength(1);
  });
});

describe('meal plans', () => {
  it('AC-API-12 / AC-DATA-11: a filled slot answers 409 with error.existingId', async () => {
    const first = data<{ id: number }>(
      await callApi('POST', 'meal-plans', {
        user: alice,
        body: { planDate: today, mealType: 'lunch', mealName: 'Pho bo' },
      }),
    );
    const err = error(
      await callApi('POST', 'meal-plans', {
        user: alice,
        body: { planDate: today, mealType: 'lunch', mealName: 'Bun cha' },
      }),
      409,
      'CONFLICT',
    );
    expect(err.existingId).toBe(first.id);
  });

  it('AC-API-12: existingId is present in production too, where details are stripped', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const err = error(
        await callApi('POST', 'meal-plans', {
          user: alice,
          body: { planDate: today, mealType: 'lunch', mealName: 'Again' },
        }),
        409,
        'CONFLICT',
      );
      expect(typeof err.existingId).toBe('number');
      expect(err).not.toHaveProperty('details');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('AC-API-13: a new typed meal name becomes one recipe, case-insensitively', async () => {
    data(
      await callApi('POST', 'meal-plans', {
        user: alice,
        body: { planDate: today, mealType: 'dinner', mealName: 'Bun Cha' },
      }),
    );
    data(
      await callApi('POST', 'meal-plans', {
        user: alice,
        body: { planDate: addDays(today, 1), mealType: 'dinner', mealName: 'BUN CHA' },
      }),
    );
    const recipes = data<Array<{ name: string }>>(await callApi('GET', 'recipes', { user: alice }));
    expect(recipes.filter((r) => r.name.toLowerCase() === 'bun cha')).toHaveLength(1);
    expect(data<unknown[]>(await callApi('GET', 'recipes', { user: bob }))).toEqual([]);
  });
});

describe('GET /api/waste', () => {
  it('AC-API-14: each entry carries its category name', async () => {
    await callApi('POST', 'waste', {
      user: alice,
      body: { itemName: 'Old cheese', categoryId: aliceCat, quantity: 1, unit: 'piece', price: 3 },
    });
    await callApi('POST', 'waste', {
      user: alice,
      body: { itemName: 'Mystery', quantity: 1, unit: 'piece' },
    });
    const log = data<Array<{ itemName: string; categoryName: string | null }>>(
      await callApi('GET', 'waste', { user: alice }),
    );
    expect(log.find((w) => w.itemName === 'Old cheese')?.categoryName).toBe('Dairy');
    expect(log.find((w) => w.itemName === 'Mystery')?.categoryName).toBeNull();
  });
});

describe('GET /api/recipes/suggestions', () => {
  it('AC-API-15: recipes ranked by matches with items expiring within 3 days, no AI', async () => {
    const chef = await createTestUser('chef-v2');
    try {
      const cat = (await createCategory(chef, 'Fresh')).id;
      await item(chef, cat, { name: 'Eggs', quantity: 6, expirationDate: addDays(today, 1) });
      await item(chef, cat, { name: 'Milk', quantity: 1, expirationDate: addDays(today, 3) });
      await item(chef, cat, { name: 'Bread', quantity: 1, expirationDate: addDays(today, 20) });
      await chef.db.from('recipes').insert([
        { user_id: chef.id, name: 'Omelette', ingredients: 'eggs, milk, cheese' },
        { user_id: chef.id, name: 'Toast', ingredients: 'bread, butter' },
      ]);
      const list = data<Array<{ name: string; matchCount: number; matchingItems: string[] }>>(
        await callApi('GET', 'recipes/suggestions', { user: chef }),
      );
      expect(list).toEqual([
        expect.objectContaining({
          name: 'Omelette',
          matchCount: 2,
          matchingItems: ['Eggs', 'Milk'],
        }),
      ]);
    } finally {
      await deleteTestUser(chef);
    }
  });
});

describe('GET /api/stats/overview', () => {
  it('AC-API-16: low stock carries rate and run-out; most wasted lists the top 5 by count and by value', async () => {
    const s = await createTestUser('stats-v2');
    try {
      const cat = (await createCategory(s, 'Pantry')).id;
      const rice = await item(s, cat, {
        name: 'Rice',
        quantity: 10,
        initialQuantity: 10,
        currentQuantity: 1.5,
        price: 2,
      });
      const usage = await admin.from('usage_history').insert([
        {
          item_id: rice.id,
          user_id: s.id,
          amount_used: 1,
          remaining_amount: 2.5,
          recorded_at: `${addDays(today, -9)}T12:00:00Z`,
        },
        {
          item_id: rice.id,
          user_id: s.id,
          amount_used: 2,
          remaining_amount: 1.5,
          recorded_at: `${addDays(today, -1)}T12:00:00Z`,
        },
      ]);
      expect(usage.error).toBeNull();
      const waste = (itemName: string, times: number, price: number) =>
        Array.from({ length: times }, () => ({
          user_id: s.id,
          item_name: itemName,
          category_id: cat,
          quantity: 1,
          unit: 'piece',
          price,
        }));
      const wasted = await admin.from('wasted_items').insert(
        [
          ...waste('Bread', 4, 1),
          ...waste('Milk', 3, 2),
          ...waste('Steak', 1, 20),
          ...waste('Herbs', 2, 0.5),
          ...waste('Eggs', 2, 0.3),
          ...waste('Lettuce', 1, 1.5),
          {
            user_id: s.id,
            item_name: 'Ancient',
            category_id: cat,
            quantity: 1,
            unit: 'piece',
            price: 99,
            wasted_date: new Date(Date.now() - 400 * 86_400_000).toISOString(),
          },
        ],
        { defaultToNull: false },
      );
      expect(wasted.error).toBeNull();
      const o = data<{
        stock: { totalValue: number };
        lowStock: Array<{
          id: number;
          percentLeft: number;
          avgDailyUse: number | null;
          runOutDate: string | null;
        }>;
        waste: {
          totalItems: number;
          totalValue: number;
          mostWastedByCount: Array<{ itemName: string; timesWasted: number }>;
          mostWastedByValue: Array<{ itemName: string; totalValue: number }>;
          byCategory: Array<{ categoryName: string | null }>;
        };
      }>(await callApi('GET', 'stats/overview', { user: s, query: { range: 'year' } }));

      expect(o.stock.totalValue).toBe(3); // 2 × 1.5
      const low = o.lowStock.find((r) => r.id === rice.id);
      expect(low?.percentLeft).toBe(15);
      expect(low?.avgDailyUse).toBeCloseTo(0.3, 6); // 3 used over 10 days
      expect(low?.runOutDate).toBe(addDays(today, 5)); // ceil(1.5 / 0.3)
      expect(o.waste.totalItems).toBe(13); // the 400-day-old entry is outside 'year'
      expect(o.waste.totalValue).toBe(33.1);
      expect(o.waste.mostWastedByCount.map((w) => w.itemName)).toEqual([
        'Bread',
        'Milk',
        'Herbs',
        'Eggs',
        'Steak',
      ]); // ties: value, then name
      expect(o.waste.mostWastedByValue.map((w) => w.itemName)).toEqual([
        'Steak',
        'Milk',
        'Bread',
        'Lettuce',
        'Herbs',
      ]);
      expect(o.waste.byCategory[0]?.categoryName).toBe('Pantry');

      const all = data<{ waste: { totalItems: number } }>(
        await callApi('GET', 'stats/overview', { user: s, query: { range: 'all' } }),
      );
      expect(all.waste.totalItems).toBe(14);
      const other = data<{ waste: { totalItems: number } }>(
        await callApi('GET', 'stats/overview', {
          user: s,
          query: { range: 'all', categoryId: String(cat + 100000) },
        }),
      );
      expect(other.waste.totalItems).toBe(0);
      error(
        await callApi('GET', 'stats/overview', { user: s, query: { range: 'decade' } }),
        400,
        'BAD_REQUEST',
      );
    } finally {
      await deleteTestUser(s);
    }
  });
});

describe('/api/preferences', () => {
  it('AC-API-17: defaults from ?tz= when valid (else UTC) and nothing is written', async () => {
    const p = data<{
      timezone: string;
      notifyHour: number;
      expiryAlerts: boolean;
      lowStockAlerts: boolean;
      theme: string;
    }>(await callApi('GET', 'preferences', { user: bob, query: { tz: 'Asia/Ho_Chi_Minh' } }));
    expect(p).toEqual({
      timezone: 'Asia/Ho_Chi_Minh',
      notifyHour: 9,
      expiryAlerts: true,
      lowStockAlerts: true,
      theme: 'system',
    });
    expect(
      data<{ timezone: string }>(
        await callApi('GET', 'preferences', { user: bob, query: { tz: 'Mars/Base' } }),
      ).timezone,
    ).toBe('UTC');
    const { count } = await admin
      .from('user_preferences')
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', bob.id);
    expect(count).toBe(0);
  });

  it('AC-API-17: PATCH changes only the fields sent', async () => {
    expect(
      data<{ notifyHour: number }>(
        await callApi('PATCH', 'preferences', { user: alice, body: { notifyHour: 7 } }),
      ).notifyHour,
    ).toBe(7);
    const after = data<{ notifyHour: number; theme: string; timezone: string }>(
      await callApi('PATCH', 'preferences', { user: alice, body: { theme: 'dark' } }),
    );
    expect(after).toMatchObject({ notifyHour: 7, theme: 'dark', timezone: 'UTC' });
    expect(
      data<{ notifyHour: number }>(await callApi('GET', 'preferences', { user: alice })).notifyHour,
    ).toBe(7);
    error(await callApi('PATCH', 'preferences', { user: alice, body: {} }), 400, 'BAD_REQUEST');
    error(
      await callApi('PATCH', 'preferences', { user: alice, body: { timezone: 'Mars/Base' } }),
      400,
      'BAD_REQUEST',
    );
    // B still sees defaults, not A's row
    expect(
      data<{ notifyHour: number }>(await callApi('GET', 'preferences', { user: bob })).notifyHour,
    ).toBe(9);
  });
});

describe('DELETE /api/categories/:id', () => {
  it('AC-DATA-14: a category still used by items answers 409 with a readable message', async () => {
    const cat = await createCategory(alice, 'In use');
    await item(alice, cat.id, { name: 'Uses it', quantity: 1 });
    const err = error(
      await callApi('DELETE', `categories/${cat.id}`, { user: alice }),
      409,
      'CONFLICT',
    );
    expect(err.message).toMatch(/still used by 1 item/);
  });
});

describe('auth on the new routes', () => {
  it.each([
    ['GET', 'bootstrap'],
    ['POST', 'inventory/bulk'],
    ['DELETE', 'inventory/bulk'],
    ['POST', 'inventory/1/restock'],
    ['POST', 'inventory/1/usage-undo'],
    ['POST', 'shopping-list/clear-purchased'],
    ['GET', 'recipes/suggestions'],
    ['GET', 'stats/overview'],
    ['GET', 'preferences'],
    ['PATCH', 'preferences'],
  ])('AC-API-04: %s /api/%s without a token is 401', async (method, path) => {
    error(await callApi(method, path, { body: {} }), 401, 'UNAUTHORIZED');
  });
});
