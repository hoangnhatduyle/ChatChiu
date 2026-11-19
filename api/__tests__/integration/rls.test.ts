// Step 6.5 (SPEC-DATA-001, SPEC-API-001 security): Row Level Security with two users, straight through PostgREST (no API
// code in between). User A owns a row in every user-owned table. User B, an anonymous caller and an insert that
// claims A's user_id must all be unable to read, change, delete or create A's data, while A can still use her own.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, createTestUser, deleteTestUser, type TestUser } from './helpers.js';

type Row = Record<string, unknown>;
type Spec = {
  table: string;
  /** Column to change, and the value to change it to, for the update attempt. */
  touch: [string, unknown];
  /** A valid row owned by `userId`; `ids` are rows A already owns that this table points at. */
  row: (userId: string, ids: Ids) => Row;
  /** The primary key column (user_preferences is keyed by user_id). */
  key?: string;
  /** Tables with no SELECT policy for the owner (nothing to read back). */
  ownerCannotRead?: boolean;
  /** Append-only for the owner: she may read her rows but there is no UPDATE policy (a log). */
  ownerCannotUpdate?: boolean;
};
type Ids = { categoryId: number; itemId: number };

const url = process.env.SUPABASE_URL ?? '';
const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
const anon: SupabaseClient = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SPECS: Spec[] = [
  { table: 'categories', touch: ['name', 'Hacked'], row: (u) => ({ user_id: u, name: `A cat ${crypto.randomUUID()}`, is_system: false }) },
  { table: 'locations', touch: ['name', 'Hacked'], row: (u) => ({ user_id: u, name: 'A fridge' }) },
  {
    table: 'inventory_items',
    touch: ['name', 'Hacked'],
    row: (u, ids) => ({ user_id: u, name: 'A milk', category_id: ids.categoryId, expiration_date: '2030-01-01', unit: 'L' }),
  },
  {
    table: 'usage_history',
    touch: ['notes', 'Hacked'],
    row: (u, ids) => ({ user_id: u, item_id: ids.itemId, amount_used: 1, remaining_amount: 2 }),
  },
  { table: 'wasted_items', touch: ['item_name', 'Hacked'], row: (u) => ({ user_id: u, item_name: 'A bread', quantity: 1, unit: 'pc' }) },
  { table: 'shopping_list', touch: ['name', 'Hacked'], row: (u) => ({ user_id: u, name: 'A eggs' }) },
  {
    table: 'meal_plans',
    touch: ['meal_name', 'Hacked'],
    row: (u) => ({ user_id: u, meal_name: 'A pasta', meal_type: 'dinner', plan_date: '2030-01-01' }),
  },
  { table: 'recipes', touch: ['name', 'Hacked'], row: (u) => ({ user_id: u, name: 'A soup', ingredients: 'water' }) },
  {
    table: 'barcode_mappings',
    touch: ['item_name', 'Hacked'],
    row: (u, ids) => ({ user_id: u, barcode: `b-${crypto.randomUUID()}`, item_name: 'A thing', category_id: ids.categoryId }),
  },
  {
    table: 'item_images',
    touch: ['storage_path', 'hacked.png'],
    row: (u, ids) => ({ user_id: u, item_id: ids.itemId, storage_path: `${u}/a.png` }),
  },
  {
    table: 'push_subscriptions',
    touch: ['user_agent', 'Hacked'],
    row: (u) => ({ user_id: u, endpoint: `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`, p256dh: 'k', auth: 'a' }),
  },
  {
    table: 'push_failures',
    touch: ['message', 'Hacked'],
    ownerCannotUpdate: true,
    row: (u) => ({ user_id: u, endpoint: 'https://push.example/x', message: 'gone' }),
  },
  { table: 'ai_usage_log', touch: ['item_name', 'Hacked'], ownerCannotUpdate: true, row: (u) => ({ user_id: u, request_type: 'expiration' }) },
  { table: 'user_preferences', key: 'user_id', touch: ['theme', 'dark'], row: (u) => ({ user_id: u, theme: 'light' }) },
  {
    table: 'idempotency_keys',
    key: 'key',
    touch: ['state', 'done'],
    ownerCannotRead: true,
    row: (u) => ({ user_id: u, key: `k-${crypto.randomUUID()}`, method: 'POST', path: '/x', request_hash: 'h' }),
  },
];

let a: TestUser;
let b: TestUser;
const ids: Ids = { categoryId: 0, itemId: 0 };
const inserted = new Map<string, Row>();

async function insertAsAdmin(table: string, row: Row): Promise<Row> {
  const { data, error } = await admin.from(table).insert(row).select().single();
  if (error) throw new Error(`fixture insert into ${table} failed: ${error.message}`);
  return data as Row;
}

const keyOf = (spec: Spec) => spec.key ?? 'id';

beforeAll(async () => {
  a = await createTestUser('rls-a');
  b = await createTestUser('rls-b');
  for (const spec of SPECS) {
    if (spec.table === 'usage_history' || spec.table === 'item_images') continue; // need the item first
    const row = await insertAsAdmin(spec.table, spec.row(a.id, ids));
    inserted.set(spec.table, row);
    if (spec.table === 'categories') ids.categoryId = row.id as number;
    if (spec.table === 'inventory_items') {
      ids.itemId = row.id as number;
      for (const later of SPECS.filter((s) => s.table === 'usage_history' || s.table === 'item_images')) {
        inserted.set(later.table, await insertAsAdmin(later.table, later.row(a.id, ids)));
      }
    }
  }
});

afterAll(async () => {
  await deleteTestUser(a);
  await deleteTestUser(b);
});

const where = (spec: Spec) => ({ column: keyOf(spec), value: inserted.get(spec.table)![keyOf(spec)] as string | number });

describe.each(SPECS)('RLS on $table', (spec) => {
  it('user B cannot read user A’s row', async () => {
    const { column, value } = where(spec);
    const { data, error } = await b.db.from(spec.table).select('*').eq(column, value);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('user B cannot update user A’s row', async () => {
    const { column, value } = where(spec);
    const { data } = await b.db
      .from(spec.table)
      .update({ [spec.touch[0]]: spec.touch[1] })
      .eq(column, value)
      .select();
    expect(data ?? []).toEqual([]);
    const { data: after } = await admin.from(spec.table).select('*').eq(column, value).single();
    expect(after).toEqual(inserted.get(spec.table));
  });

  it('user B cannot delete user A’s row', async () => {
    const { column, value } = where(spec);
    const { data } = await b.db.from(spec.table).delete().eq(column, value).select();
    expect(data ?? []).toEqual([]);
    const { data: after } = await admin.from(spec.table).select('*').eq(column, value);
    expect(after).toHaveLength(1);
  });

  it('user B cannot create a row that claims user A’s user_id', async () => {
    // A fresh row for A, built the same way as the fixture (the keyed tables need a new key).
    const row = spec.row(a.id, ids);
    const { error } = await b.db.from(spec.table).insert(row);
    // The RLS refusal specifically (42501): a duplicate-key or constraint error would pass for the wrong reason.
    expect(error?.code, `B inserted a row for A into ${spec.table}`).toBe('42501');
  });

  it('an anonymous caller can neither read nor write it', async () => {
    const { column, value } = where(spec);
    // After the hardening anon has no privilege on the table at all: a refusal (42501), not just an empty answer.
    const read = await anon.from(spec.table).select('*').eq(column, value);
    expect(read.data ?? []).toEqual([]);
    expect(read.error?.code, `anon read of ${spec.table}`).toBe('42501');
    const write = await anon.from(spec.table).insert(spec.row(a.id, ids));
    expect(write.error?.code, `anon insert into ${spec.table}`).toBe('42501');
  });

  it('user A still sees and changes her own row (the policy is not over-strict)', async () => {
    if (spec.ownerCannotRead) return;
    const { column, value } = where(spec);
    const { data } = await a.db.from(spec.table).select('*').eq(column, value);
    expect(data).toHaveLength(1);
    if (spec.ownerCannotUpdate) return;
    const { data: changed } = await a.db
      .from(spec.table)
      .update({ [spec.touch[0]]: spec.touch[1] })
      .eq(column, value)
      .select();
    expect(changed).toHaveLength(1);
  });
});

describe('RLS beyond single tables', () => {
  // A foreign key is checked without RLS, so a policy that only tests user_id lets B point a row at A's rows: B could
  // pin A's categories and locations ("in use" blocks her delete), and probe which ids exist.
  describe('cross-tenant references', () => {
    let locationId = 0;
    let recipeId = 0;
    beforeAll(async () => {
      locationId = (await admin.from('locations').select('id').eq('user_id', a.id).single()).data!.id as number;
      recipeId = (await admin.from('recipes').select('id').eq('user_id', a.id).single()).data!.id as number;
    });

    const mine = (extra: Row = {}) => ({
      name: 'B item',
      expiration_date: '2030-01-01',
      unit: 'L',
      user_id: b.id,
      ...extra,
    });

    it('an item of B cannot use A’s category', async () => {
      const { error } = await b.db.from('inventory_items').insert(mine({ category_id: ids.categoryId }));
      expect(error?.code, 'B pointed an item at A’s category').toBe('42501');
    });

    it('an item of B cannot be stored in A’s location', async () => {
      const own = await admin.from('categories').insert({ user_id: b.id, name: `B cat ${crypto.randomUUID()}`, is_system: false }).select().single();
      const { error } = await b.db
        .from('inventory_items')
        .insert(mine({ category_id: own.data!.id, location_id: locationId }));
      expect(error?.code, 'B pointed an item at A’s location').toBe('42501');
    });

    it('B cannot move her own item to A’s category or location', async () => {
      const own = await admin.from('categories').insert({ user_id: b.id, name: `B cat ${crypto.randomUUID()}`, is_system: false }).select().single();
      const item = await b.db.from('inventory_items').insert(mine({ category_id: own.data!.id })).select().single();
      expect(item.error).toBeNull();
      const toCategory = await b.db.from('inventory_items').update({ category_id: ids.categoryId }).eq('id', item.data!.id).select();
      expect(toCategory.error?.code, 'B moved her item into A’s category').toBe('42501');
      const toLocation = await b.db.from('inventory_items').update({ location_id: locationId }).eq('id', item.data!.id).select();
      expect(toLocation.error?.code, 'B moved her item into A’s location').toBe('42501');
    });

    it('B cannot log usage on, or attach an image to, A’s item', async () => {
      const usage = await b.db.from('usage_history').insert({ user_id: b.id, item_id: ids.itemId, amount_used: 1, remaining_amount: 0 });
      expect(usage.error?.code, 'B logged usage on A’s item').toBe('42501');
      const image = await b.db.from('item_images').insert({ user_id: b.id, item_id: ids.itemId, storage_path: `${b.id}/x.png` });
      expect(image.error?.code, 'B attached an image to A’s item').toBe('42501');
    });

    it('B cannot point a barcode mapping, a waste entry or a shopping row at A’s category', async () => {
      const barcode = await b.db.from('barcode_mappings').insert({ user_id: b.id, barcode: `b-${crypto.randomUUID()}`, item_name: 'x', category_id: ids.categoryId });
      expect(barcode.error?.code, 'barcode mapping').toBe('42501');
      const waste = await b.db.from('wasted_items').insert({ user_id: b.id, item_name: 'x', quantity: 1, unit: 'pc', category_id: ids.categoryId });
      expect(waste.error?.code, 'waste entry').toBe('42501');
      const shopping = await b.db.from('shopping_list').insert({ user_id: b.id, name: 'x', category_id: ids.categoryId });
      expect(shopping.error?.code, 'shopping row').toBe('42501');
    });

    it('B cannot plan a meal with A’s recipe', async () => {
      const { error } = await b.db.from('meal_plans').insert({ user_id: b.id, meal_name: 'x', meal_type: 'dinner', plan_date: '2030-01-02', recipe_id: recipeId });
      expect(error?.code, 'meal plan with A’s recipe').toBe('42501');
    });

    it('B can still use her own category, location and item', async () => {
      const cat = await admin.from('categories').insert({ user_id: b.id, name: `B cat ${crypto.randomUUID()}`, is_system: false }).select().single();
      const loc = await admin.from('locations').insert({ user_id: b.id, name: 'B fridge' }).select().single();
      const item = await b.db.from('inventory_items').insert(mine({ category_id: cat.data!.id, location_id: loc.data!.id })).select().single();
      expect(item.error).toBeNull();
      const usage = await b.db.from('usage_history').insert({ user_id: b.id, item_id: item.data!.id, amount_used: 1, remaining_amount: 0 });
      expect(usage.error).toBeNull();
    });
  });

  it('user B cannot read user A’s storage objects', async () => {
    const path = `${a.id}/receipt-${crypto.randomUUID()}.png`;
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const up = await a.db.storage.from('inventory-images').upload(path, png, { contentType: 'image/png' });
    expect(up.error).toBeNull();
    const download = await b.db.storage.from('inventory-images').download(path);
    expect(download.error).not.toBeNull();
    const list = await b.db.storage.from('inventory-images').list(a.id);
    expect(list.data ?? []).toEqual([]);
    const overwrite = await b.db.storage.from('inventory-images').upload(path, png, { contentType: 'image/png', upsert: true });
    expect(overwrite.error).not.toBeNull();
    await admin.storage.from('inventory-images').remove([path]);
  });

  it('user B cannot upload into user A’s storage folder', async () => {
    const path = `${a.id}/planted-${crypto.randomUUID()}.png`;
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const up = await b.db.storage.from('inventory-images').upload(path, png, { contentType: 'image/png' });
    expect(up.error).not.toBeNull();
  });

  it('the SECURITY INVOKER summary functions return nothing about user A to user B', async () => {
    const { data } = await b.db.rpc('dashboard_summary_v2', { p_today: '2030-01-01' });
    const summary = Array.isArray(data) ? data[0] : data;
    expect(JSON.stringify(summary ?? {})).not.toContain('A milk');
  });
});

describe('push_subscriptions (security review M1, M2)', () => {
  const row = (endpoint: string, extra: Row = {}) => ({
    endpoint,
    p256dh: 'k',
    auth: 'a',
    channel: 'web-push',
    ...extra,
  });

  it('B cannot store an endpoint that is not a known push service, straight through PostgREST', async () => {
    for (const endpoint of [
      'https://internal.example:8443/x',
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://evil.example/fcm.googleapis.com/x',
      'https://fcm.googleapis.com.evil.example/x',
    ]) {
      const { error } = await b.db.from('push_subscriptions').insert({ user_id: b.id, ...row(endpoint) });
      expect(error, endpoint).not.toBeNull();
    }
    const ok = await b.db.from('push_subscriptions').insert({ user_id: b.id, ...row('https://web.push.apple.com/abc') });
    expect(ok.error).toBeNull();
  });

  it('a Fire tablet registration (channel local) is still accepted', async () => {
    const { error } = await b.db
      .from('push_subscriptions')
      .insert({ user_id: b.id, ...row('local:tablet-1', { channel: 'local', p256dh: 'local', auth: 'local' }) });
    expect(error).toBeNull();
  });

  it('one user cannot register more than 20 devices, but a known one can be refreshed', async () => {
    const c = await createTestUser('rls-cap');
    try {
      const rows = Array.from({ length: 20 }, (_, i) => ({ user_id: c.id, ...row(`https://fcm.googleapis.com/fcm/send/cap-${i}`) }));
      const first = await c.db.from('push_subscriptions').insert(rows);
      expect(first.error).toBeNull();
      const over = await c.db.from('push_subscriptions').insert({ user_id: c.id, ...row('https://fcm.googleapis.com/fcm/send/cap-20') });
      expect(over.error, 'a 21st device was accepted').not.toBeNull();
      const refresh = await c.db
        .from('push_subscriptions')
        .upsert({ user_id: c.id, ...row('https://fcm.googleapis.com/fcm/send/cap-0'), user_agent: 'again' }, { onConflict: 'user_id,endpoint' });
      expect(refresh.error).toBeNull();
    } finally {
      await deleteTestUser(c);
    }
  });
});
