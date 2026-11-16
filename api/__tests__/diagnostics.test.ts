import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import diagnostics, { isAllowedPushEndpoint } from '../diagnostics.js';

function call(method: string, body?: unknown) {
  const out: { status: number; body: unknown } = { status: 0, body: undefined };
  const res = {
    setHeader: () => res,
    status: (code: number) => ((out.status = code), res),
    json: (b: unknown) => ((out.body = b), res),
  } as unknown as VercelResponse;
  const req = { method, body, headers: {}, query: {} } as unknown as VercelRequest;
  return diagnostics(req, res).then(() => out);
}

const subscription = (endpoint: string) => ({
  subscription: { endpoint, keys: { p256dh: 'p', auth: 'a' } },
  delaySeconds: 0,
});

afterEach(() => vi.unstubAllEnvs());

describe('isAllowedPushEndpoint', () => {
  it.each([
    'https://web.push.apple.com/QGx',
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/x',
    'https://wns2-bl2p.notify.windows.com/w/?token=x',
  ])('accepts %s', (url) => expect(isAllowedPushEndpoint(url)).toBe(true));

  it.each([
    'http://web.push.apple.com/x',
    'https://web.push.apple.com.evil.example/x',
    'https://169.254.169.254/latest/meta-data',
    'https://localhost/x',
    'not a url',
  ])('rejects %s', (url) => expect(isAllowedPushEndpoint(url)).toBe(false));
});

describe('diagnostics handler', () => {
  it('returns 404 when diagnostics are disabled', async () => {
    vi.stubEnv('DIAGNOSTICS_ENABLED', '');
    expect((await call('GET')).status).toBe(404);
  });

  it('returns 404 when enabled but the VAPID pair is missing', async () => {
    vi.stubEnv('DIAGNOSTICS_ENABLED', 'true');
    vi.stubEnv('DIAG_VAPID_PUBLIC_KEY', '');
    expect((await call('GET')).status).toBe(404);
  });

  describe('when enabled', () => {
    const enable = () => {
      vi.stubEnv('DIAGNOSTICS_ENABLED', 'true');
      vi.stubEnv('DIAG_VAPID_PUBLIC_KEY', 'BPublicKey');
      vi.stubEnv('DIAG_VAPID_PRIVATE_KEY', 'private');
    };

    it('serves the public key on GET', async () => {
      enable();
      expect(await call('GET')).toEqual({ status: 200, body: { data: { publicKey: 'BPublicKey' } } });
    });

    it('rejects other methods', async () => {
      enable();
      expect((await call('DELETE')).status).toBe(405);
    });

    it('rejects an invalid body', async () => {
      enable();
      expect((await call('POST', { subscription: {} })).status).toBe(400);
    });

    it('rejects a delay above 30 seconds', async () => {
      enable();
      const body = { ...subscription('https://web.push.apple.com/x'), delaySeconds: 31 };
      expect((await call('POST', body)).status).toBe(400);
    });

    it('refuses to contact hosts outside the allowlist', async () => {
      enable();
      const out = await call('POST', subscription('https://internal.example/x'));
      expect(out.status).toBe(422);
      expect(JSON.stringify(out.body)).toContain('internal.example');
    });
  });
});
