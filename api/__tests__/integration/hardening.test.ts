import { MAX_PUSH_SUBSCRIPTIONS } from '@chatchiu/contracts';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { admin, callApi, createTestUser, deleteTestUser, type TestUser } from './helpers.js';

// Step 6.5 (roadmap 7.0.13): the per-user write budget, the cap on push subscriptions, and the retention of
// push_failures. web-push is mocked: nothing leaves the machine.
vi.hoisted(() => {
  process.env.WRITE_LIMIT_PER_MINUTE = '4';
});
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn(async () => ({ statusCode: 201 })) },
}));

let a: TestUser;
let b: TestUser;
beforeAll(async () => {
  a = await createTestUser('hard-a');
  b = await createTestUser('hard-b');
});
afterAll(async () => {
  await deleteTestUser(a);
  await deleteTestUser(b);
});

const FCM = 'https://fcm.googleapis.com/fcm/send/';
const subscribe = (user: TestUser, id: string) =>
  callApi('POST', 'push/subscribe', {
    user,
    body: { endpoint: `${FCM}${id}`, keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } },
  });

describe('per-user write budget (7.0.13d)', () => {
  it('answers 429 with Retry-After once a user is over her budget, and the refused write changes nothing', async () => {
    // The five writes must share one minute window: start early in a minute.
    while (new Date().getUTCSeconds() > 50) await new Promise((r) => setTimeout(r, 500));
    const add = (name: string) => callApi('POST', 'shopping-list', { user: a, body: { name } });
    for (let i = 1; i <= 4; i++) expect((await add(`Item ${i}`)).status, `write ${i}`).toBe(200);
    const refused = await add('Item 5');
    expect(refused.status).toBe(429);
    expect(refused.body).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    expect(refused.headers['Retry-After']).toBe('60');
    const { data } = await admin.from('shopping_list').select('name').eq('user_id', a.id);
    expect(data?.map((r) => r.name).sort()).toEqual(['Item 1', 'Item 2', 'Item 3', 'Item 4']);
  });

  it('reads are never counted, even when the user is over her budget', async () => {
    expect((await callApi('GET', 'shopping-list', { user: a })).status).toBe(200);
    expect((await callApi('GET', 'bootstrap', { user: a })).status).toBe(200);
  });

  it('another user has her own budget', async () => {
    const res = await callApi('POST', 'shopping-list', { user: b, body: { name: 'B item' } });
    expect(res.status).toBe(200);
  });

  it('a user cannot reset her own budget through PostgREST', async () => {
    const reset = await a.db.from('api_write_budget').delete().eq('user_id', a.id);
    expect(reset.error).not.toBeNull();
    const read = await a.db.from('api_write_budget').select('*');
    expect(read.error).not.toBeNull();
  });
});

describe('push subscription cap (7.0.13c)', () => {
  it(`registers up to ${MAX_PUSH_SUBSCRIPTIONS} devices, refuses one more with 409, and still refreshes a known one`, async () => {
    // A fresh user: the write budget (4 a minute here) is not what this test is about, so the rows past the first few are
    // inserted as the service role and the budget rows are cleared before the request that is judged on the cap.
    const user = await createTestUser('hard-cap');
    try {
      for (let i = 0; i < MAX_PUSH_SUBSCRIPTIONS; i++) {
        const res = await subscribe(user, `dev-${i}`);
        if (res.status !== 200) {
          // The budget (4 writes/minute here) stops the loop first: insert the rest as the service role.
          await admin.from('push_subscriptions').insert(
            Array.from({ length: MAX_PUSH_SUBSCRIPTIONS - i }, (_, k) => ({
              user_id: user.id,
              endpoint: `${FCM}dev-${i + k}`,
              p256dh: 'p',
              auth: 'a',
            })),
          );
          break;
        }
      }
      const { count } = await admin.from('push_subscriptions').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
      expect(count).toBe(MAX_PUSH_SUBSCRIPTIONS);
      // Wait for a fresh budget window so the write itself is judged on the cap, not the budget.
      await admin.from('api_write_budget').delete().eq('user_id', user.id);
      const over = await subscribe(user, 'one-too-many');
      expect(over.status).toBe(409);
      expect(over.body).toMatchObject({ error: { code: 'CONFLICT' } });
      const again = await subscribe(user, 'dev-0');
      expect(again.status).toBe(200);
    } finally {
      await deleteTestUser(user);
    }
  });
});

describe('push_failures retention (7.0.13f)', () => {
  it('the send job deletes failure rows older than 30 days and keeps recent ones', async () => {
    const day = 86_400_000;
    const old = await admin.from('push_failures').insert({ user_id: b.id, endpoint: `${FCM}old`, message: 'old', created_at: new Date(Date.now() - 40 * day).toISOString() }).select().single();
    const recent = await admin.from('push_failures').insert({ user_id: b.id, endpoint: `${FCM}recent`, message: 'recent', created_at: new Date(Date.now() - 5 * day).toISOString() }).select().single();
    expect(old.error).toBeNull();
    const run = await callApi('GET', 'cron/check-expirations', { headers: { authorization: 'Bearer test-cron-secret' } });
    expect(run.status).toBe(200);
    const left = await admin.from('push_failures').select('id').eq('user_id', b.id);
    expect(left.data?.map((r) => r.id)).toEqual([recent.data!.id]);
  });
});

describe('push subscription cap under concurrency (security review)', () => {
  it('twenty concurrent registrations on top of 19 never leave more than 20 devices', async () => {
    const user = await createTestUser('hard-race');
    try {
      await admin.from('push_subscriptions').insert(
        Array.from({ length: 19 }, (_, i) => ({ user_id: user.id, endpoint: `${FCM}seed-${i}`, p256dh: 'p', auth: 'a' })),
      );
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          user.db.from('push_subscriptions').insert({ user_id: user.id, endpoint: `${FCM}race-${i}`, p256dh: 'p', auth: 'a' }),
        ),
      );
      const { count } = await admin.from('push_subscriptions').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
      expect(count).toBe(MAX_PUSH_SUBSCRIPTIONS);
      expect(results.filter((r) => r.error === null)).toHaveLength(1);
    } finally {
      await deleteTestUser(user);
    }
  });
});
