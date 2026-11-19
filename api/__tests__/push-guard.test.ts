import { beforeEach, describe, expect, it, vi } from 'vitest';

// Step 6.5, security review M1: sendPush is the one function that POSTs to a subscription's endpoint. Besides the zod
// schema on /push/subscribe and deliverPush, a user can write push_subscriptions straight through PostgREST (RLS only
// checks user_id), so sendPush itself must refuse anything that is not a known push service (SSRF).
const sendNotification = vi.hoisted(() => vi.fn(async () => ({ statusCode: 201 })));
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('SUPABASE_ANON_KEY', 'a');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 's');
  vi.stubEnv('OPENAI_API_KEY', 'unused');
  sendNotification.mockClear();
});

const payload = { title: 't', body: 'b' };
const keys = { p256dh: 'k', auth: 'a' };

describe('sendPush endpoint guard', () => {
  it.each([
    'https://internal.example:8443/x',
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:8443/fcm/send/abc',
    'https://evil.example/fcm.googleapis.com',
    'https://fcm.googleapis.com.evil.example/x',
    'local:device-1',
  ])('never contacts %s', async (endpoint) => {
    const { sendPush } = await import('../_lib/push.js');
    await expect(sendPush({ endpoint, ...keys }, payload)).rejects.toThrow(/not a known push service/i);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('still sends to a real push service', async () => {
    const { sendPush } = await import('../_lib/push.js');
    await sendPush({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', ...keys }, payload);
    expect(sendNotification).toHaveBeenCalledOnce();
  });

  it('sendPushToMany skips an unknown endpoint and counts it as failed', async () => {
    const { sendPushToMany } = await import('../_lib/push.js');
    const result = await sendPushToMany(
      [
        { endpoint: 'https://internal.example/x', ...keys },
        { endpoint: 'https://web.push.apple.com/abc', ...keys },
      ],
      payload,
    );
    expect(result).toEqual({ sent: 1, failed: 1 });
    expect(sendNotification).toHaveBeenCalledOnce();
  });

  it('deliverPush (the send job) records an unknown endpoint as gone and never contacts it', async () => {
    const { deliverPush } = await import('../_lib/push.js');
    const result = await deliverPush(
      [
        { endpoint: 'http://169.254.169.254/latest/meta-data', ...keys },
        { endpoint: 'https://fcm.googleapis.com/fcm/send/ok', ...keys },
      ],
      payload,
    );
    expect(result.sent).toBe(1);
    expect(result.failures).toEqual([
      expect.objectContaining({ endpoint: 'http://169.254.169.254/latest/meta-data', gone: true }),
    ]);
    expect(sendNotification).toHaveBeenCalledOnce();
  });
});
