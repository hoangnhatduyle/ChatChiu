import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Step 6.5, roadmap 7.0.13(a): the router takes the route from the rewrite's `__path` only. A client that adds its own
// `__path` (so it arrives twice) or a `path` parameter must not be able to choose which route runs: the Vercel Firewall
// and the logs key on the URL, and cron/* must only be reachable by its own URL.
beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('SUPABASE_ANON_KEY', 'a');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 's');
  vi.stubEnv('OPENAI_API_KEY', 'unused');
  vi.stubEnv('CRON_SECRET', 'secret-for-this-test');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function call(url: string, query: Record<string, string | string[]>) {
  const { default: dispatch } = await import('../handler.js');
  const out: { status: number; body: unknown } = { status: 0, body: undefined };
  const res = {
    headersSent: false,
    setHeader: () => res,
    status(code: number) {
      out.status = code;
      return res;
    },
    json(payload: unknown) {
      out.body = payload;
      return res;
    },
    end: () => res,
  } as unknown as VercelResponse;
  await dispatch({ method: 'GET', url, headers: {}, query } as unknown as VercelRequest, res);
  return out;
}

describe('router path (7.0.13a)', () => {
  it('runs the route named by a single __path', async () => {
    const res = await call('/api/health', { __path: 'health' });
    expect(res.status).toBe(200);
  });

  it('refuses a __path that arrived twice (the client added its own) instead of joining the parts', async () => {
    const res = await call('/api/health', { __path: ['cron/check-expirations', 'health'] });
    expect(res.status).toBe(400);
  });

  it('ignores a `path` parameter: it is not a way to pick a route', async () => {
    const res = await call('/api/health', { path: 'cron/check-expirations' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: { status: 'ok' } });
  });

  it('falls back to the URL itself when there is no __path (the function hit directly)', async () => {
    const res = await call('/api/health?x=1', {});
    expect(res.status).toBe(200);
  });

  it('answers 404 for a route that does not exist', async () => {
    const res = await call('/api/nope', { __path: 'nope' });
    expect(res.status).toBe(404);
  });
});
