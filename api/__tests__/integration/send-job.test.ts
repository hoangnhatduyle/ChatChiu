import { addDays, todayInTimeZone } from '@chatchiu/domain';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  admin,
  callApi,
  createCategory,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers.js';

// The scheduled send job GET /api/cron/check-expirations (AC-API-18…20, AC-API-23,
// AC-DATA-16). web-push is mocked: nothing ever leaves the machine. Endpoints whose
// path contains "gone" answer 410, "broken" answers 500, anything else succeeds.
const sendNotification = vi.hoisted(() =>
  vi.fn(async (sub: { endpoint: string }, payload: string) => {
    void payload;
    if (sub.endpoint.includes('gone')) {
      throw Object.assign(new Error('Gone'), {
        statusCode: 410,
        body: 'push subscription has unsubscribed or expired',
      });
    }
    if (sub.endpoint.includes('broken')) {
      throw Object.assign(new Error('Server error'), {
        statusCode: 500,
        body: 'oops upstream secret',
      });
    }
    return { statusCode: 201 };
  }),
);
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));

const FCM = 'https://fcm.googleapis.com/fcm/send/';
const TZ = 'Asia/Ho_Chi_Minh'; // UTC+7, no DST
const utcDay = todayInTimeZone('UTC');
/** An instant at the given local hour in Ho Chi Minh City on today's UTC date. */
const atLocalHour = (hour: number) =>
  new Date(`${utcDay}T${String(hour - 7).padStart(2, '0')}:05:00Z`);
const localDay = todayInTimeZone(TZ, atLocalHour(9));

let carol: TestUser;
let dave: TestUser;
let frank: TestUser;
let dueItem: number;
let lowItem: number;

type RunBody = { data: Record<string, number> };
const run = async (at: Date, jwt = 'test-cron-secret') => {
  vi.setSystemTime(at);
  return callApi<RunBody>('GET', 'cron/check-expirations', { jwt });
};
/** The run really ran: not skipped, no per-user errors, every bookkeeping write landed. */
const expectRan = (res: { status: number; body: RunBody }) => {
  expect(res.status).toBe(200);
  expect(res.body.data).not.toHaveProperty('skipped');
  expect(res.body.data.userErrors).toBe(0);
  expect(res.body.data.markFailures).toBe(0);
};
const pushesTo = (fragment: string, titleMatch: RegExp) =>
  sendNotification.mock.calls.filter(
    ([sub, payload]) =>
      sub.endpoint.includes(fragment) && titleMatch.test(JSON.parse(payload).title),
  );

beforeAll(async () => {
  carol = await createTestUser('carol-send');
  dave = await createTestUser('dave-send');
  frank = await createTestUser('frank-send');
  const cat = (await createCategory(carol, 'Fresh')).id;
  const daveCat = (await createCategory(dave, 'Fresh')).id;
  const frankCat = (await createCategory(frank, 'Fresh')).id;
  await admin.from('user_preferences').insert({ user_id: carol.id, timezone: TZ, notify_hour: 9 });
  const items = await admin
    .from('inventory_items')
    .insert(
      [
        {
          user_id: carol.id,
          category_id: cat,
          name: 'Milk',
          quantity: 1,
          unit: 'L',
          expiration_date: addDays(localDay, 1),
          notification_days_before: 3,
        },
        {
          user_id: carol.id,
          category_id: cat,
          name: 'Yoghurt',
          quantity: 1,
          unit: 'piece',
          expiration_date: addDays(localDay, 2),
          notification_days_before: 3,
        },
        {
          user_id: carol.id,
          category_id: cat,
          name: 'Flour',
          quantity: 1,
          unit: 'kg',
          initial_quantity: 1,
          current_quantity: 0.1,
          expiration_date: addDays(localDay, 300),
        },
        {
          user_id: carol.id,
          category_id: cat,
          name: 'Muted',
          quantity: 1,
          unit: 'piece',
          expiration_date: addDays(localDay, 1),
          notification_enabled: false,
        },
        {
          user_id: dave.id,
          category_id: daveCat,
          name: 'Dave cheese',
          quantity: 1,
          unit: 'piece',
          expiration_date: addDays(utcDay, 1),
        },
        {
          user_id: frank.id,
          category_id: frankCat,
          name: 'Frank ham',
          quantity: 1,
          unit: 'piece',
          expiration_date: addDays(utcDay, 1),
        },
      ],
      { defaultToNull: false },
    )
    .select('id, name');
  if (items.error) throw new Error(items.error.message);
  dueItem = items.data.find((i) => i.name === 'Milk')?.id as number;
  lowItem = items.data.find((i) => i.name === 'Flour')?.id as number;
  const sub = (user: string, endpoint: string, channel = 'web-push') => ({
    user_id: user,
    endpoint,
    p256dh: 'p',
    auth: 'a',
    channel,
  });
  const subs = await admin.from('push_subscriptions').insert(
    [
      sub(carol.id, `${FCM}carol-ok`),
      sub(carol.id, `${FCM}carol-gone`),
      sub(carol.id, `${FCM}carol-broken`),
      sub(carol.id, `${FCM}carol-fire`, 'local'),
      sub(dave.id, `${FCM}dave-ok`),
      sub(frank.id, `${FCM}frank-broken`),
      // inserted behind the API's back: must never be contacted (SSRF guard)
      sub(frank.id, 'http://169.254.169.254/latest/meta-data'),
    ],
    { defaultToNull: false },
  );
  if (subs.error) throw new Error(subs.error.message);
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await deleteTestUser(carol);
  await deleteTestUser(dave);
  await deleteTestUser(frank);
});

describe('scheduled send job', () => {
  // Each test checks the run(s) it makes; database state carries over in order.
  it('AC-API-23: without the CRON_SECRET bearer it is 401 and nothing is sent', async () => {
    sendNotification.mockClear();
    expect((await run(atLocalHour(9), 'wrong')).status).toBe(401);
    expect((await run(atLocalHour(9), 'test-cron-secretX')).status).toBe(401);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('AC-API-18 / AC-API-19: before her notify hour no expiry reminder, but low stock is pushed once and marked', async () => {
    sendNotification.mockClear();
    expectRan(await run(atLocalHour(8)));
    expect(pushesTo('carol', /expir/i)).toHaveLength(0);
    expect(pushesTo('carol-ok', /low|running/i)).toHaveLength(1);
    expect(pushesTo('carol-fire', /./)).toHaveLength(0);
    const { data } = await admin
      .from('inventory_items')
      .select('low_stock_notified_at')
      .eq('id', lowItem)
      .single();
    expect(data?.low_stock_notified_at).not.toBeNull();
  });

  it('AC-API-20 / AC-DATA-16: a 410 deletes that subscription and records the failure; a 500 is recorded and kept', async () => {
    const subs = await admin.from('push_subscriptions').select('endpoint').eq('user_id', carol.id);
    expect((subs.data ?? []).map((s) => s.endpoint).sort()).toEqual([
      `${FCM}carol-broken`,
      `${FCM}carol-fire`,
      `${FCM}carol-ok`,
    ]);
    const failures = await admin
      .from('push_failures')
      .select('endpoint, status_code, message')
      .eq('user_id', carol.id);
    expect(failures.data).toEqual(
      expect.arrayContaining([
        { endpoint: `${FCM}carol-gone`, status_code: 410, message: 'Push service answered 410' },
        { endpoint: `${FCM}carol-broken`, status_code: 500, message: 'Push service answered 500' },
      ]),
    );
    expect(
      (await admin.from('push_subscriptions').select('id').eq('user_id', dave.id)).data,
    ).toHaveLength(1);
  });

  it('AC-API-18: at her notify hour one grouped reminder goes to each web-push device, never to the local one', async () => {
    sendNotification.mockClear();
    expectRan(await run(atLocalHour(9)));
    const ok = pushesTo('carol-ok', /expir/i);
    expect(ok).toHaveLength(1);
    expect(JSON.parse(ok[0]?.[1] ?? '{}')).toMatchObject({
      title: '2 items expiring soon',
      body: 'Milk, Yoghurt',
      url: '/inventory',
    });
    expect(pushesTo('carol-fire', /./)).toHaveLength(0);
    expect(pushesTo('carol', /low|running/i)).toHaveLength(0); // still marked from the 8:00 run
    const { data } = await admin
      .from('user_preferences')
      .select('last_expiry_reminder_on')
      .eq('user_id', carol.id)
      .single();
    expect(data?.last_expiry_reminder_on).toBe(localDay);
    const milk = await admin
      .from('inventory_items')
      .select('last_notified_at')
      .eq('id', dueItem)
      .single();
    expect(milk.data?.last_notified_at).not.toBeNull();
  });

  it('AC-API-18 / AC-API-19: later runs that local day send nothing more (SENT_TODAY → DUE is impossible)', async () => {
    sendNotification.mockClear();
    expectRan(await run(atLocalHour(10)));
    expectRan(await run(atLocalHour(15)));
    expect(pushesTo('carol', /./)).toHaveLength(0);
  });

  it('a user without a preferences row is treated as UTC with notify hour 9', async () => {
    sendNotification.mockClear();
    expectRan(await run(new Date(`${utcDay}T08:30:00Z`)));
    expect(pushesTo('dave', /expir/i)).toHaveLength(0);
    expectRan(await run(new Date(`${utcDay}T09:10:00Z`)));
    const toDave = pushesTo('dave', /expir/i);
    expect(toDave).toHaveLength(1);
    expect(JSON.parse(toDave[0]?.[1] ?? '{}').body).toBe('Dave cheese expires soon');
  });

  it('when every device fails the day stays DUE and the next run retries; a non-push URL is never contacted', async () => {
    const before = await admin
      .from('user_preferences')
      .select('last_expiry_reminder_on')
      .eq('user_id', frank.id)
      .maybeSingle();
    expect(before.data?.last_expiry_reminder_on ?? null).toBeNull(); // the 09:10Z attempt failed and was released
    sendNotification.mockClear();
    expectRan(await run(new Date(`${utcDay}T11:00:00Z`)));
    expect(pushesTo('frank-broken', /expir/i)).toHaveLength(1);
    expect(sendNotification.mock.calls.some(([sub]) => sub.endpoint.includes('169.254'))).toBe(
      false,
    );
    const subs = await admin.from('push_subscriptions').select('endpoint').eq('user_id', frank.id);
    expect((subs.data ?? []).map((s) => s.endpoint)).toEqual([`${FCM}frank-broken`]);
    const failures = await admin.from('push_failures').select('message').eq('user_id', frank.id);
    const messages = (failures.data ?? []).map((f) => f.message);
    expect(messages).toContain('Endpoint is not a known push service');
    expect(messages.every((m) => !/oops|secret/.test(m))).toBe(true); // no upstream bodies stored
  });

  it('AC-API-19: a restock clears the marker; the next drop alerts once even when two runs overlap', async () => {
    const restock = await callApi('POST', `inventory/${lowItem}/restock`, {
      user: carol,
      body: { quantity: 1 },
    });
    expect(restock.status).toBe(200);
    sendNotification.mockClear();
    expectRan(await run(atLocalHour(17)));
    expect(pushesTo('carol', /low|running/i)).toHaveLength(0); // full again: nothing to say
    await admin.from('inventory_items').update({ current_quantity: 0.05 }).eq('id', lowItem);
    vi.setSystemTime(atLocalHour(18));
    const both = await Promise.all([
      callApi('GET', 'cron/check-expirations', { jwt: 'test-cron-secret' }),
      callApi('GET', 'cron/check-expirations', { jwt: 'test-cron-secret' }),
    ]);
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    expect(pushesTo('carol-ok', /low|running/i)).toHaveLength(1);
  });

  it('AC-API-19: an edit in either app that lifts the item above its threshold clears the marker', async () => {
    const edit = await callApi('PATCH', `inventory/${lowItem}`, {
      user: carol,
      body: { currentQuantity: 0.9 },
    });
    expect(edit.status).toBe(200);
    expectRan(await run(atLocalHour(19)));
    const { data } = await admin
      .from('inventory_items')
      .select('low_stock_notified_at')
      .eq('id', lowItem)
      .single();
    expect(data?.low_stock_notified_at).toBeNull();
  });

  it('AC-API-02: the response keeps the old fields', async () => {
    const res = await run(atLocalHour(20));
    expect(res.body.data).toEqual(
      expect.objectContaining({
        checked: expect.any(Number),
        due: expect.any(Number),
        usersNotified: expect.any(Number),
        pushesSent: expect.any(Number),
      }),
    );
  });
});
