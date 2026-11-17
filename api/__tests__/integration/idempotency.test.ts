import { addDays, todayInTimeZone } from '@chatchiu/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin,
  callApi,
  createCategory,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers.js';

// Step 4.3b (SPEC-API-001 AC-API-25): a repeated write with the same Idempotency-Key runs once and
// replays the first response. Against local Supabase with two users; every test makes its own data.

type Data<T> = { data: T };
type Err = { error: { code: string; message: string; existingId?: number } };

let alice: TestUser;
let bob: TestUser;
let aliceCat: number;
const today = todayInTimeZone('UTC');
const newKey = () => `test-${crypto.randomUUID()}`;
const withKey = (key: string) => ({ 'idempotency-key': key });

const newItem = (name: string) => ({
  name,
  categoryId: aliceCat,
  quantity: 1,
  unit: 'piece',
  expirationDate: addDays(today, 30),
});

async function count(user: TestUser, name: string) {
  const { count: n, error } = await admin
    .from('inventory_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('name', name);
  if (error) throw new Error(error.message);
  return n ?? 0;
}

beforeAll(async () => {
  alice = await createTestUser('alice-idem');
  bob = await createTestUser('bob-idem');
  aliceCat = (await createCategory(alice, 'Dairy')).id;
});

afterAll(async () => {
  await deleteTestUser(alice);
  await deleteTestUser(bob);
});

describe('AC-API-25: idempotent writes', () => {
  it('AC-API-25: the same key twice creates one item and returns the same response', async () => {
    const key = newKey();
    const body = newItem('Idem milk');
    const first = await callApi<Data<{ id: number }>>('POST', 'inventory', {
      user: alice,
      body,
      headers: withKey(key),
    });
    const second = await callApi<Data<{ id: number }>>('POST', 'inventory', {
      user: alice,
      body,
      headers: withKey(key),
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(await count(alice, 'Idem milk')).toBe(1);
  });

  it('AC-API-25: a retried usage log writes one history row, not two (the reason for this step)', async () => {
    const created = await callApi<Data<{ id: number }>>('POST', 'inventory', {
      user: alice,
      body: { ...newItem('Idem usage'), initialQuantity: 1, currentQuantity: 1 },
    });
    const id = created.body.data.id;
    const key = newKey();
    const usage = { amountUsed: 0.2, currentQuantity: 0.8 };
    const first = await callApi('POST', `inventory/${id}/usage`, { user: alice, body: usage, headers: withKey(key) });
    const retry = await callApi('POST', `inventory/${id}/usage`, { user: alice, body: usage, headers: withKey(key) });
    expect(retry.body).toEqual(first.body);
    const { count: rows } = await admin
      .from('usage_history')
      .select('id', { count: 'exact', head: true })
      .eq('item_id', id);
    expect(rows).toBe(1);
  });

  it('AC-API-25: writes without a key behave as before (two calls, two rows)', async () => {
    const body = newItem('No key');
    await callApi('POST', 'inventory', { user: alice, body });
    await callApi('POST', 'inventory', { user: alice, body });
    expect(await count(alice, 'No key')).toBe(2);
  });

  it('AC-API-25: the same key with a different body is refused with 400 and creates nothing', async () => {
    const key = newKey();
    await callApi('POST', 'inventory', { user: alice, body: newItem('First body'), headers: withKey(key) });
    const other = await callApi<Err>('POST', 'inventory', {
      user: alice,
      body: newItem('Second body'),
      headers: withKey(key),
    });
    expect(other.status).toBe(400);
    expect(other.body.error.code).toBe('BAD_REQUEST');
    expect(await count(alice, 'Second body')).toBe(0);
  });

  it('NC-DATA-RLS: another user can use the same key independently', async () => {
    const key = newKey();
    await callApi('POST', 'inventory', { user: alice, body: newItem('Alice key'), headers: withKey(key) });
    const bobCat = (await createCategory(bob, 'Dairy')).id;
    const bobs = await callApi<Data<{ id: number }>>('POST', 'inventory', {
      user: bob,
      body: { ...newItem('Bob key'), categoryId: bobCat },
      headers: withKey(key),
    });
    expect(bobs.status).toBe(200);
    expect(await count(bob, 'Bob key')).toBe(1);
  });

  it('AC-API-25: an error the server decided (400) is stored and replayed, not run again', async () => {
    const key = newKey();
    const bad = { name: 'x' }; // missing required fields
    const first = await callApi<Err>('POST', 'inventory', { user: alice, body: bad, headers: withKey(key) });
    const again = await callApi<Err>('POST', 'inventory', { user: alice, body: bad, headers: withKey(key) });
    expect(first.status).toBe(400);
    expect(again.status).toBe(400);
    // The replay carries the same error; `details` (non-production only) is deliberately not stored.
    expect(again.body.error.code).toBe(first.body.error.code);
    expect(again.body.error.message).toBe(first.body.error.message);
    const { data: rows } = await admin.from('idempotency_keys').select('state, status').eq('user_id', alice.id).eq('key', key);
    expect(rows).toEqual([{ state: 'done', status: 400 }]);
  });

  it('AC-API-25: two requests with one key at the same moment create one item (the second waits, then gets the same response)', async () => {
    const key = newKey();
    const body = newItem('Idem concurrent');
    const [a, b] = await Promise.all([
      callApi<Data<{ id: number }>>('POST', 'inventory', { user: alice, body, headers: withKey(key) }),
      callApi<Data<{ id: number }>>('POST', 'inventory', { user: alice, body, headers: withKey(key) }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.data.id).toBe(b.body.data.id);
    expect(await count(alice, 'Idem concurrent')).toBe(1);
  });

  it('AC-API-25: a state-dependent error (404) is not stored, so a retry after the cause is fixed works', async () => {
    const key = newKey();
    const usage = { amountUsed: 0.1, currentQuantity: 0.9 };
    const missing = await callApi<Err>('POST', 'inventory/999999999/usage', {
      user: alice,
      body: usage,
      headers: withKey(key),
    });
    expect(missing.status).toBe(404);
    const { data: stored } = await admin.from('idempotency_keys').select('key').eq('user_id', alice.id).eq('key', key);
    expect(stored).toEqual([]);
  });

  it('AC-API-25: a route whose response is a credential (uploads/sign) ignores the key: nothing is stored or replayed', async () => {
    const key = newKey();
    const body = { scope: 'items', contentType: 'image/png', ext: 'png' };
    const first = await callApi<Data<{ path: string }>>('POST', 'uploads/sign', {
      user: alice,
      body,
      headers: withKey(key),
    });
    const second = await callApi<Data<{ path: string }>>('POST', 'uploads/sign', {
      user: alice,
      body,
      headers: withKey(key),
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.path).not.toBe(first.body.data.path); // a fresh URL each time
    const { data: stored } = await admin.from('idempotency_keys').select('key').eq('user_id', alice.id).eq('key', key);
    expect(stored).toEqual([]);
  });

  it('AC-API-25: a malformed key is refused with 400 before anything runs', async () => {
    const res = await callApi<Err>('POST', 'inventory', {
      user: alice,
      body: newItem('Bad key'),
      headers: { 'idempotency-key': 'not valid!' },
    });
    expect(res.status).toBe(400);
    expect(await count(alice, 'Bad key')).toBe(0);
  });

  it('a GET ignores the header', async () => {
    const res = await callApi('GET', 'inventory', { user: alice, headers: withKey(newKey()) });
    expect(res.status).toBe(200);
  });

  it('NC-DATA-RLS: a user cannot read another user\'s stored keys', async () => {
    const key = newKey();
    await callApi('POST', 'inventory', { user: alice, body: newItem('Private key'), headers: withKey(key) });
    const { data } = await bob.db.from('idempotency_keys').select('key').eq('key', key);
    expect(data).toEqual([]);
  });
});
