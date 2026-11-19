import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { admin, callApi, createTestUser, deleteTestUser, type TestUser } from './helpers.js';

// POST /api/push/test (7.0.32a): a subscription the push service reports gone (404/410) is removed, like the send job
// does, so the test does not fail the same way forever. web-push is mocked: nothing leaves the machine. Endpoints whose
// path contains "gone" answer 410; anything else succeeds.
const sendNotification = vi.hoisted(() =>
  vi.fn(async (sub: { endpoint: string }) => {
    if (sub.endpoint.includes('gone')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
    return { statusCode: 201 };
  }),
);
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));

const FCM = 'https://fcm.googleapis.com/fcm/send/';
let user: TestUser;

beforeAll(async () => {
  user = await createTestUser('push-test-owner');
});
afterAll(async () => {
  await deleteTestUser(user);
});
beforeEach(async () => {
  sendNotification.mockClear();
  await admin.from('push_subscriptions').delete().eq('user_id', user.id);
});

const subscribe = (path: string) =>
  admin.from('push_subscriptions').insert({
    user_id: user.id,
    endpoint: `${FCM}${path}`,
    p256dh: 'p',
    auth: 'a',
    channel: 'web-push',
  });
const endpoints = async () =>
  ((await admin.from('push_subscriptions').select('endpoint').eq('user_id', user.id)).data ?? []).map(
    (r) => r.endpoint as string,
  );

describe('POST /api/push/test', () => {
  it('sends to a live device and keeps it', async () => {
    await subscribe('live-1');
    const res = await callApi<{ data: { sent: number } }>('POST', 'push/test', { user, body: {} });
    expect(res.status).toBe(200);
    expect(res.body.data.sent).toBe(1);
    expect(await endpoints()).toHaveLength(1);
  });

  it('7.0.32a: removes a device the push service reports gone, and still reports the live one', async () => {
    await subscribe('live-2');
    await subscribe('gone-2');
    const res = await callApi<{ data: { sent: number } }>('POST', 'push/test', { user, body: {} });
    expect(res.status).toBe(200);
    expect(res.body.data.sent).toBe(1);
    expect(await endpoints()).toEqual([`${FCM}live-2`]);
  });

  it('7.0.32a: when every device is gone it removes them and says to turn notifications on again', async () => {
    await subscribe('gone-3');
    const res = await callApi<{ error: { message: string } }>('POST', 'push/test', { user, body: {} });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/turn notifications on again/i);
    expect(await endpoints()).toEqual([]);
  });
});
