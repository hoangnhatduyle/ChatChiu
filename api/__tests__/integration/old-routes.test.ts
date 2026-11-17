import { readFileSync } from 'node:fs';
import { addDays, todayLocalDateString } from '@chatchiu/domain';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  admin,
  callApi,
  createCategory,
  createLocation,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers.js';
import { toCamel } from '../../_lib/mappers.js';

// AC-DATA-02 / AC-API-02: the old app has no API tests, so this suite replays the
// request shapes the old Angular services send (OLD/src/app/services/*.ts) to every
// old route, on the migrated local database, and parses each response with the old
// app's models (OLD/src/app/models/*.ts). Loose objects: added fields are allowed,
// removed or retyped ones fail (NC-API-NO-BREAK-OLD).

const num = z.number();
const str = z.string();
// Every field below is a database column the routes return with select('*'), so its
// key must be present (null allowed): a route that stops returning one fails here.
const opt = <T extends z.ZodType>(t: T) => t.nullable();

// No test may reach a push service: web-push is replaced for this whole file.
const sendNotification = vi.hoisted(() => vi.fn(async () => ({ statusCode: 201 })));
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification },
}));

const today = todayLocalDateString();

// Every route in api/handler.ts that this suite exercises; a new or missed route fails.
const COVERED = new Set([
  'ai/expiration-suggest', 'ai/receipt-scan', 'barcode-mappings/:barcode', 'barcode-mappings',
  'categories/:id', 'categories', 'cron/check-expirations', 'health', 'inventory/:id',
  'inventory/:id/images', 'inventory/:id/usage', 'inventory/by-barcode/:barcode/images',
  'inventory/images/:imageId', 'inventory', 'locations/:id', 'locations', 'meal-plans/:id',
  'meal-plans', 'push/subscribe', 'push/test', 'recipes/:id', 'recipes', 'shopping-list/:id',
  'shopping-list', 'statistics/dashboard', 'uploads/read', 'uploads/sign', 'waste/:id',
  'waste/from-item', 'waste',
]);
const envelope = <T extends z.ZodType>(data: T) => z.strictObject({ data });

const OldInventoryItem = z.looseObject({
  id: num,
  userId: str,
  name: str,
  categoryId: num,
  quantity: num,
  unit: str,
  purchaseDate: opt(str),
  expirationDate: str,
  locationId: opt(num),
  price: opt(num),
  notes: opt(str),
  notificationEnabled: z.boolean(),
  notificationDaysBefore: num,
  barcode: opt(str),
  initialQuantity: opt(num),
  currentQuantity: opt(num),
  usageNotes: opt(str),
  lowStockThreshold: opt(num),
  createdAt: str,
  updatedAt: str,
});
const OldCategory = z.looseObject({
  id: num,
  name: str,
  icon: opt(str),
  color: opt(str),
  userId: opt(str),
  isSystem: z.boolean(),
});
const OldLocation = z.looseObject({ id: num, userId: str, name: str, subLocation: opt(str) });
const OldShoppingItem = z.looseObject({
  id: num,
  userId: str,
  name: str,
  quantity: opt(str),
  notes: opt(str),
  categoryId: opt(num),
  isPurchased: z.boolean(),
  createdAt: str,
});
const OldUsage = z.looseObject({
  id: num,
  itemId: num,
  amountUsed: num,
  remainingAmount: num,
  notes: opt(str),
  recordedAt: str,
});
const OldMealPlan = z.looseObject({
  id: num,
  userId: str,
  planDate: str,
  mealType: z.enum(['breakfast', 'lunch', 'dinner']),
  mealName: str,
  recipeId: opt(num),
  isFavorite: z.boolean(),
  notes: opt(str),
});
const OldRecipe = z.looseObject({
  id: num,
  name: str,
  ingredients: str,
  prepTime: opt(str),
  servings: opt(num),
  instructions: opt(str),
  createdAt: str,
  updatedAt: str,
});
const OldWasted = z.looseObject({
  id: num,
  userId: str,
  itemName: str,
  categoryId: opt(num),
  quantity: num,
  unit: str,
  price: opt(num),
  wastedDate: str,
});
const OldBarcode = z.looseObject({ id: num, barcode: str, itemName: str, categoryId: num, userId: str });
const OldDashboard = z.looseObject({
  totalItems: num,
  totalValue: num,
  expiringCount: num,
  expiredCount: num,
  expiringSoon: z.array(z.looseObject({ id: num, name: str })),
  lowStock: z.array(z.looseObject({ id: num, name: str })),
  byCategory: z.array(z.looseObject({ category: str, count: num })),
  byLocation: z.array(z.looseObject({ location: str, count: num })),
  waste30dCount: num,
  waste30dValue: num,
});
const Deleted = envelope(z.object({ deleted: z.literal(true) }));
const ErrorBody = z.strictObject({
  error: z.strictObject({ code: str, message: str, details: z.unknown().optional() }),
});

let user: TestUser;
let categoryId: number;
let locationId: number;
let itemId: number;

const ok = async <T extends z.ZodType>(
  schema: T,
  ...args: Parameters<typeof callApi>
): Promise<z.infer<T>> => {
  const res = await callApi(...args);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return schema.parse(res.body);
};

beforeAll(async () => {
  user = await createTestUser('old-routes');
  categoryId = (await createCategory(user, 'Dairy')).id;
  locationId = (await createLocation(user, 'Fridge')).id;
});

afterAll(async () => {
  await deleteTestUser(user);
});

describe('AC-DATA-02: every old route behaves as before on the migrated database', () => {
  it('AC-API-02: the suite covers every route registered in api/handler.ts', () => {
    const handler = readFileSync(new URL('../../handler.ts', import.meta.url), 'utf8');
    const registered = [...handler.matchAll(/segments: \[([^\]]*)\]/g)].map((m) =>
      [...(m[1] ?? '').matchAll(/"([^"]+)"/g)].map((x) => x[1]).join('/'),
    );
    expect(registered.length).toBeGreaterThan(20);
    expect(registered.filter((r) => !COVERED.has(r))).toEqual([]);
  });

  it('GET /api/health is public', async () => {
    const res = await callApi('GET', 'health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: expect.objectContaining({ status: expect.any(String) }) });
  });

  it('AC-API-02: inventory CRUD with the old item form body (board loads, add item)', async () => {
    const created = await ok(envelope(OldInventoryItem), 'POST', 'inventory', {
      user,
      body: {
        name: 'Milk',
        categoryId,
        quantity: 1,
        unit: 'L',
        purchaseDate: today,
        expirationDate: addDays(today, 3),
        locationId,
        price: 2.5,
        notes: 'top shelf',
        notificationEnabled: true,
        notificationDaysBefore: 3,
        initialQuantity: 1,
        currentQuantity: 1,
        lowStockThreshold: 20,
      },
    });
    itemId = created.data.id;
    await ok(envelope(z.array(OldInventoryItem).min(1)), 'GET', 'inventory', { user });
    await ok(envelope(OldInventoryItem), 'GET', `inventory/${itemId}`, { user, query: { id: '' } });
    // The old app PATCHes the whole item object back, including read-only fields.
    const patched = await ok(envelope(OldInventoryItem), 'PATCH', `inventory/${itemId}`, {
      user,
      body: { ...created.data, notes: 'door' },
    });
    expect(patched.data.notes).toBe('door');
    expect(patched.data.notificationEnabled).toBe(true);
  });

  it('AC-API-02: usage with the old body { currentQuantity, amountUsed, notes } (drag usage)', async () => {
    const logged = await ok(envelope(OldUsage), 'POST', `inventory/${itemId}/usage`, {
      user,
      body: { currentQuantity: 0.6, amountUsed: 0.4, notes: 'breakfast' },
    });
    expect(logged.data.remainingAmount).toBe(0.6);
    const item = await ok(envelope(OldInventoryItem), 'GET', `inventory/${itemId}`, { user });
    expect(item.data.currentQuantity).toBe(0.6);
    const history = await ok(envelope(z.array(OldUsage)), 'GET', `inventory/${itemId}/usage`, { user });
    expect(history.data).toHaveLength(1);
  });

  it('AC-API-02: locations CRUD', async () => {
    const loc = await ok(envelope(OldLocation), 'POST', 'locations', {
      user,
      body: { name: 'Pantry', subLocation: 'Top shelf' },
    });
    await ok(envelope(z.array(OldLocation)), 'GET', 'locations', { user });
    await ok(envelope(OldLocation), 'PATCH', `locations/${loc.data.id}`, {
      user,
      body: { ...loc.data, name: 'Larder' },
    });
    await ok(Deleted, 'DELETE', `locations/${loc.data.id}`, { user });
  });

  it('AC-API-02: categories CRUD and the duplicate-name 409', async () => {
    const cat = await ok(envelope(OldCategory), 'POST', 'categories', {
      user,
      body: { name: 'Snacks', icon: '🍿', color: '#E91E63' },
    });
    await ok(envelope(z.array(OldCategory)), 'GET', 'categories', { user });
    await ok(envelope(OldCategory), 'PATCH', `categories/${cat.data.id}`, {
      user,
      body: { ...cat.data, name: 'Treats' },
    });
    const dup = await callApi('POST', 'categories', { user, body: { name: 'treats' } });
    expect(dup.status).toBe(409);
    ErrorBody.parse(dup.body);
    await ok(Deleted, 'DELETE', `categories/${cat.data.id}`, { user });
  });

  it('AC-API-02: shopping list CRUD and the old tick body { isPurchased }', async () => {
    const row = await ok(envelope(OldShoppingItem), 'POST', 'shopping-list', {
      user,
      body: { name: 'Eggs', quantity: '10', notes: 'free range', categoryId },
    });
    const ticked = await ok(envelope(OldShoppingItem), 'PATCH', `shopping-list/${row.data.id}`, {
      user,
      body: { isPurchased: true },
    });
    expect(ticked.data.isPurchased).toBe(true);
    await ok(envelope(z.array(OldShoppingItem)), 'GET', 'shopping-list', { user });
    await ok(Deleted, 'DELETE', `shopping-list/${row.data.id}`, { user });
  });

  it('AC-API-02: meal plans CRUD, the ?from&to list and the slot conflict 409', async () => {
    const plan = await ok(envelope(OldMealPlan), 'POST', 'meal-plans', {
      user,
      body: { planDate: '2026-11-16', mealType: 'dinner', mealName: 'Pho bo', notes: null },
    });
    await ok(envelope(z.array(OldMealPlan)), 'GET', 'meal-plans', {
      user,
      query: { from: '2026-11-16', to: '2026-11-22' },
    });
    const conflict = await callApi('POST', 'meal-plans', {
      user,
      body: { planDate: '2026-11-16', mealType: 'dinner', mealName: 'Bun cha' },
    });
    expect(conflict.status).toBe(409);
    expect((conflict.body as { error: { code: string } }).error.code).toBe('CONFLICT');
    await ok(envelope(OldMealPlan), 'PATCH', `meal-plans/${plan.data.id}`, {
      user,
      body: { ...plan.data, isFavorite: true },
    });
    await ok(Deleted, 'DELETE', `meal-plans/${plan.data.id}`, { user });
  });

  it('AC-API-02: recipes list, edit and delete', async () => {
    const { data: row, error } = await user.db
      .from('recipes')
      .insert({
        user_id: user.id,
        name: 'Omelette',
        ingredients: 'eggs, milk',
        prep_time: '10 min',
        servings: 2,
      })
      .select('*')
      .single();
    expect(error).toBeNull();
    const recipe = { data: OldRecipe.parse(toCamel(row)) };
    await ok(envelope(z.array(OldRecipe)), 'GET', 'recipes', { user });
    await ok(envelope(OldRecipe), 'PATCH', `recipes/${recipe.data.id}`, {
      user,
      body: { ...recipe.data, servings: 3 },
    });
    await ok(Deleted, 'DELETE', `recipes/${recipe.data.id}`, { user });
  });

  it('AC-API-02: POST /api/recipes creates a recipe and a case-variant name is a 409 (old 42P10 bug fixed)', async () => {
    // The old route upserted on (user_id, name), which matches no constraint (the
    // unique index is (user_id, lower(name))), so every create failed with 42P10.
    // Fixed in step 2.3 at the user's request (2026-11-16).
    const created = await ok(envelope(OldRecipe), 'POST', 'recipes', {
      user,
      body: { name: 'Toast', ingredients: 'bread, butter', prepTime: '5 min', servings: 1 },
    });
    expect(created.data.name).toBe('Toast');
    const dup = await callApi('POST', 'recipes', {
      user,
      body: { name: 'TOAST', ingredients: 'bread' },
    });
    expect(dup.status).toBe(409);
    expect(ErrorBody.parse(dup.body).error.code).toBe('CONFLICT');
    await ok(Deleted, 'DELETE', `recipes/${created.data.id}`, { user });
  });

  it('AC-API-02: waste log, ad-hoc waste, waste from item and delete', async () => {
    const entry = await ok(envelope(OldWasted), 'POST', 'waste', {
      user,
      body: { itemName: 'Bread', categoryId, quantity: 1, unit: 'piece', price: 3 },
    });
    await ok(envelope(z.array(OldWasted).min(1)), 'GET', 'waste', { user });
    const temp = await ok(envelope(OldInventoryItem), 'POST', 'inventory', {
      user,
      body: { name: 'Yoghurt', categoryId, quantity: 2, unit: 'piece', expirationDate: '2026-11-17' },
    });
    const fromItem = await ok(envelope(OldWasted), 'POST', 'waste/from-item', {
      user,
      body: { itemId: temp.data.id },
    });
    expect(fromItem.data.itemName).toBe('Yoghurt');
    expect((await callApi('GET', `inventory/${temp.data.id}`, { user })).status).toBe(404);
    await ok(Deleted, 'DELETE', `waste/${entry.data.id}`, { user });
  });

  it('AC-API-02: GET /api/statistics/dashboard keeps the old payload, with rows in every list', async () => {
    const res = await ok(envelope(OldDashboard), 'GET', 'statistics/dashboard', { user });
    // Milk (0.6 left, expiring in 3 days) is in expiringSoon and, by the old absolute
    // rule (0.6 <= 20), in lowStock; it has a category and a location.
    expect(res.data.expiringSoon.length).toBeGreaterThan(0);
    expect(res.data.lowStock.length).toBeGreaterThan(0);
    expect(res.data.byCategory.length).toBeGreaterThan(0);
    expect(res.data.byLocation.length).toBeGreaterThan(0);
  });

  it('AC-API-02: uploads sign returns a signed path in her folder', async () => {
    const res = await ok(
      envelope(z.looseObject({ path: str, token: str, signedUrl: str, expiresIn: num })),
      'POST',
      'uploads/sign',
      { user, body: { scope: 'receipts', contentType: 'image/jpeg', ext: 'jpg' } },
    );
    expect(res.data.path.startsWith(`${user.id}/receipts/`)).toBe(true);
  });

  it('AC-API-02: uploads read, and attaching / deleting an item image (hidden, D3)', async () => {
    const path = `${user.id}/items/${crypto.randomUUID()}.png`;
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const up = await user.db.storage.from('inventory-images').upload(path, png, { contentType: 'image/png' });
    expect(up.error).toBeNull();
    const read = await ok(envelope(z.looseObject({ url: str, expiresIn: num })), 'GET', 'uploads/read', {
      user,
      query: { path },
    });
    expect(read.data.expiresIn).toBe(900);
    expect((await callApi('GET', 'uploads/read', { user, query: { path: `00000000-0000-0000-0000-000000000000/items/x.png` } })).status).toBe(403);
    const image = await ok(envelope(z.looseObject({ id: num, imagePath: str, storagePath: str })), 'POST', `inventory/${itemId}/images`, {
      user,
      body: { storagePath: path, isPrimary: true },
    });
    await ok(Deleted, 'DELETE', `inventory/images/${image.data.id}`, { user });
  });

  it('AC-API-02: push subscribe (old body, no channel) and unsubscribe', async () => {
    const endpoint = 'https://push.invalid/old-routes-test';
    await ok(envelope(z.looseObject({ id: num })), 'POST', 'push/subscribe', {
      user,
      body: { endpoint, expirationTime: null, keys: { p256dh: 'p', auth: 'a' } },
    });
    const { data } = await admin
      .from('push_subscriptions')
      .select('channel')
      .eq('user_id', user.id)
      .single();
    expect(data?.channel).toBe('web-push');
    await ok(Deleted, 'DELETE', 'push/subscribe', { user, query: { endpoint } });
    // With no subscription left, the test push answers 400 and sends nothing.
    expect((await callApi('POST', 'push/test', { user, body: {} })).status).toBe(400);
  });

  it('AC-API-02: hidden barcode and image routes still answer (D3)', async () => {
    const mapping = await ok(envelope(OldBarcode), 'POST', 'barcode-mappings', {
      user,
      body: { barcode: '8930001', itemName: 'Milk', categoryId },
    });
    await ok(envelope(z.array(OldBarcode)), 'GET', 'barcode-mappings', { user });
    await ok(envelope(OldBarcode), 'GET', `barcode-mappings/${mapping.data.barcode}`, { user });
    await ok(envelope(z.array(z.unknown())), 'GET', `inventory/${itemId}/images`, { user });
    await ok(envelope(z.array(z.unknown())), 'GET', 'inventory/by-barcode/8930001/images', { user });
  });

  it('AC-API-21: AI routes answer QUOTA_EXCEEDED before any OpenAI call', async () => {
    const suggest = await callApi('POST', 'ai/expiration-suggest', {
      user,
      body: { itemName: 'Milk', categoryName: 'Dairy' },
    });
    expect(suggest.status).toBe(429);
    expect((suggest.body as { error: { code: string } }).error.code).toBe('QUOTA_EXCEEDED');
    const scan = await callApi('POST', 'ai/receipt-scan', {
      user,
      body: { imagePath: `${user.id}/receipts/abc-123.jpg` },
    });
    expect(scan.status).toBe(429);
  });

  it('AC-API-22: a receipt path outside her folder is 403', async () => {
    const res = await callApi('POST', 'ai/receipt-scan', {
      user,
      body: { imagePath: '00000000-0000-0000-0000-000000000000/receipts/abc.jpg' },
    });
    expect(res.status).toBe(403);
  });

  it('AC-API-23: the scheduled send job rejects a missing or wrong CRON_SECRET', async () => {
    expect((await callApi('GET', 'cron/check-expirations')).status).toBe(401);
    expect((await callApi('GET', 'cron/check-expirations', { jwt: 'nope' })).status).toBe(401);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('AC-API-02: the old send job still answers its old payload with the right secret', async () => {
    const res = await ok(
      envelope(z.looseObject({ checked: num, due: num, usersNotified: num, pushesSent: num })),
      'GET',
      'cron/check-expirations',
      { jwt: 'test-cron-secret' },
    );
    expect(res.data.checked).toBeGreaterThan(0);
  });

  it('AC-API-04: routes without a bearer token answer 401', async () => {
    for (const path of ['inventory', 'categories', 'shopping-list', 'statistics/dashboard']) {
      const res = await callApi('GET', path);
      expect(res.status, path).toBe(401);
      ErrorBody.parse(res.body);
    }
  });

  it('AC-API-01: unknown paths answer the { error } envelope with 404', async () => {
    const res = await callApi('GET', 'no-such-route', { user });
    expect(res.status).toBe(404);
    ErrorBody.parse(res.body);
  });
});
