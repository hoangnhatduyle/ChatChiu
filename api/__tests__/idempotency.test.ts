import type { VercelRequest, VercelResponse } from '@vercel/node';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../_lib/errors.js';
import {
  IN_PROGRESS_WAIT_MS,
  readIdempotencyKey,
  requestHash,
  withIdempotency,
} from '../_lib/idempotency.js';
import type { AuthContext } from '../_lib/supabase.js';

// SPEC-API-001 AC-API-25: a repeated write (same user, same Idempotency-Key) returns the first
// response and does not run twice. The database side is tested in supabase/tests/0018 and the
// integration test; here the three RPCs are an in-memory fake.

type Row = { method: string; path: string; hash: string; state: 'in_progress' | 'done'; status?: number; response?: unknown };

function fakeContext(options: { failFinish?: boolean | number; failAbandon?: boolean; beginError?: { code?: string; message: string } } = {}) {
  let finishFailures = typeof options.failFinish === 'number' ? options.failFinish : options.failFinish ? Infinity : 0;
  const rows = new Map<string, Row>();
  const calls: string[] = [];
  const client = {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      const key = String(args.p_key);
      if (name === 'idempotency_begin') {
        if (options.beginError) return { data: null, error: options.beginError };
        const row = rows.get(key);
        if (!row) {
          rows.set(key, { method: String(args.p_method), path: String(args.p_path), hash: String(args.p_request_hash), state: 'in_progress' });
          return { data: [{ state: 'new', status: null, response: null }], error: null };
        }
        if (row.method !== args.p_method || row.path !== args.p_path || row.hash !== args.p_request_hash) {
          return { data: [{ state: 'mismatch', status: null, response: null }], error: null };
        }
        return row.state === 'done'
          ? { data: [{ state: 'done', status: row.status, response: row.response }], error: null }
          : { data: [{ state: 'in_progress', status: null, response: null }], error: null };
      }
      if (name === 'idempotency_finish') {
        if (finishFailures > 0) {
          finishFailures -= 1;
          return { data: null, error: { message: 'db down' } };
        }
        const row = rows.get(key);
        if (row) Object.assign(row, { state: 'done', status: args.p_status, response: args.p_response });
        return { data: null, error: null };
      }
      if (name === 'idempotency_abandon') {
        if (options.failAbandon) return { data: null, error: { message: 'db down' } };
        if (rows.get(key)?.state === 'in_progress') rows.delete(key);
        return { data: null, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    }),
  };
  return { ctx: { client, user: { id: 'u1' }, jwt: 'j' } as unknown as AuthContext, rows, calls };
}

function http(method = 'POST', body: unknown = { name: 'Milk' }, path = 'inventory', headers: Record<string, string> = {}) {
  const sent: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const res = {
    headersSent: false,
    setHeader: (k: string, v: string) => void (sent.headers[k] = v),
    status: (code: number) => ((sent.status = code), res),
    json: (b: unknown) => ((sent.body = b), ((res as { headersSent: boolean }).headersSent = true), res),
  } as unknown as VercelResponse;
  const req = { method, body, query: { __path: path }, headers } as unknown as VercelRequest;
  return { req, res, sent };
}

describe('readIdempotencyKey', () => {
  const header = (value: string | string[] | undefined, method = 'POST') =>
    ({ method, headers: { 'idempotency-key': value } }) as unknown as VercelRequest;

  it('AC-API-25: reads a valid key on a write', () => {
    expect(readIdempotencyKey(header('abc-123_XYZ'))).toBe('abc-123_XYZ');
    for (const method of ['POST', 'PATCH', 'DELETE']) expect(readIdempotencyKey(header('k', method))).toBe('k');
  });

  it('AC-API-25: no header means no idempotency (old clients are unaffected)', () => {
    expect(readIdempotencyKey(header(undefined))).toBeUndefined();
  });

  it('a GET ignores the header', () => {
    expect(readIdempotencyKey(header('k', 'GET'))).toBeUndefined();
  });

  it.each(['', ' ', 'a b', 'bad/key', 'é', 'x'.repeat(101)])('AC-API-25: refuses the key %j with 400', (value) => {
    expect(() => readIdempotencyKey(header(value))).toThrow(ApiError);
    try {
      readIdempotencyKey(header(value));
    } catch (e) {
      expect((e as ApiError).code).toBe('BAD_REQUEST');
    }
  });

  it('refuses a header sent twice', () => {
    expect(() => readIdempotencyKey(header(['a', 'b']))).toThrow(ApiError);
  });
});

describe('requestHash', () => {
  it('is the same for the same request, whatever the key order in the body', () => {
    const a = requestHash({ method: 'POST', query: {}, body: { a: 1, b: { c: 2, d: 3 } } });
    const b = requestHash({ method: 'POST', query: {}, body: { b: { d: 3, c: 2 }, a: 1 } });
    expect(a).toBe(b);
  });

  it('differs when the body, the method or the query differs', () => {
    const base = requestHash({ method: 'POST', query: { x: '1' }, body: { a: 1 } });
    expect(requestHash({ method: 'POST', query: { x: '1' }, body: { a: 2 } })).not.toBe(base);
    expect(requestHash({ method: 'PATCH', query: { x: '1' }, body: { a: 1 } })).not.toBe(base);
    expect(requestHash({ method: 'POST', query: { x: '2' }, body: { a: 1 } })).not.toBe(base);
  });

  it('hashes a string or Buffer body directly instead of walking it', () => {
    expect(requestHash({ method: 'POST', query: {}, body: 'raw text' })).toMatch(/^[0-9a-f]{64}$/);
    expect(requestHash({ method: 'POST', query: {}, body: Buffer.from('abc') })).toMatch(/^[0-9a-f]{64}$/);
    expect(requestHash({ method: 'POST', query: {}, body: Buffer.from('abc') })).not.toBe(
      requestHash({ method: 'POST', query: {}, body: Buffer.from('abd') }),
    );
  });

  it('refuses a body nested too deeply to hash safely', () => {
    let deep: unknown = 1;
    for (let i = 0; i < 200; i += 1) deep = { a: deep };
    expect(() => requestHash({ method: 'POST', query: {}, body: deep })).toThrow(ApiError);
  });

  it('handles no body', () => {
    expect(requestHash({ method: 'DELETE', query: {}, body: undefined })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('withIdempotency', () => {
  it('AC-API-25: the first request runs and its response is stored', async () => {
    const { ctx, rows } = fakeContext();
    const { req, res } = http();
    const run = vi.fn(async () => ({ id: 7 }));
    await expect(withIdempotency(ctx, req, res, 'k1', run)).resolves.toEqual({ id: 7 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(rows.get('k1')).toMatchObject({ state: 'done', status: 200, response: { data: { id: 7 } } });
  });

  it('AC-API-25: a repeat does not run again and replays the first response', async () => {
    const { ctx } = fakeContext();
    const run = vi.fn(async () => ({ id: 7 }));
    await withIdempotency(ctx, http().req, http().res, 'k1', run);
    const again = http();
    const result = await withIdempotency(ctx, again.req, again.res, 'k1', run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(result).toBeUndefined();
    expect(again.sent).toMatchObject({ status: 200, body: { data: { id: 7 } } });
  });

  it('AC-API-25: the same key for a different request is refused with 400 and nothing runs', async () => {
    const { ctx } = fakeContext();
    await withIdempotency(ctx, http('POST', { name: 'Milk' }).req, http().res, 'k1', async () => 1);
    const other = http('POST', { name: 'Eggs' });
    const run = vi.fn(async () => 2);
    await expect(withIdempotency(ctx, other.req, other.res, 'k1', run)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(run).not.toHaveBeenCalled();
  });

  it('AC-API-25: a validation error (400) is stored and replayed with the same status and body', async () => {
    const { ctx, rows } = fakeContext();
    const run = vi.fn(async () => {
      throw new ApiError('BAD_REQUEST', 'name is required');
    });
    await expect(withIdempotency(ctx, http().req, http().res, 'k1', run)).rejects.toBeInstanceOf(ApiError);
    expect(rows.get('k1')).toMatchObject({
      state: 'done',
      status: 400,
      response: { error: { code: 'BAD_REQUEST', message: 'name is required' } },
    });
    const again = http();
    await withIdempotency(ctx, again.req, again.res, 'k1', run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(again.sent).toMatchObject({ status: 400, body: { error: { code: 'BAD_REQUEST' } } });
  });

  it.each(['NOT_FOUND', 'CONFLICT', 'RATE_LIMITED', 'QUOTA_EXCEEDED', 'FORBIDDEN'] as const)(
    'AC-API-25: a %s depends on state that may change, so the key is released and a retry runs again',
    async (code) => {
      const { ctx, rows } = fakeContext();
      const run = vi.fn(async () => {
        throw new ApiError(code, 'not now');
      });
      await expect(withIdempotency(ctx, http().req, http().res, 'k1', run)).rejects.toBeInstanceOf(ApiError);
      expect(rows.has('k1')).toBe(false);
      await expect(withIdempotency(ctx, http().req, http().res, 'k1', run)).rejects.toBeInstanceOf(ApiError);
      expect(run).toHaveBeenCalledTimes(2);
    },
  );

  it('AC-API-25: a server error (5xx) or a crash is not stored: the key is released so a retry runs', async () => {
    const { ctx, rows } = fakeContext();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      withIdempotency(ctx, http().req, http().res, 'k1', async () => {
        throw new Error('db exploded');
      }),
    ).rejects.toThrow('db exploded');
    expect(rows.has('k1')).toBe(false);
    const run = vi.fn(async () => ({ id: 1 }));
    await withIdempotency(ctx, http().req, http().res, 'k1', run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('AC-API-25: a request that is still running is waited for, then replayed (no second run)', async () => {
    vi.useFakeTimers();
    try {
      const { ctx } = fakeContext();
      let finishFirst: (value: unknown) => void = () => {};
      const firstRun = vi.fn(() => new Promise((resolve) => (finishFirst = resolve)));
      const first = withIdempotency(ctx, http().req, http().res, 'k1', firstRun);
      await vi.advanceTimersByTimeAsync(0);
      const secondRun = vi.fn(async () => 'second');
      const second = http();
      const waiting = withIdempotency(ctx, second.req, second.res, 'k1', secondRun);
      await vi.advanceTimersByTimeAsync(700);
      finishFirst({ id: 9 });
      await first;
      await vi.advanceTimersByTimeAsync(700);
      await waiting;
      expect(secondRun).not.toHaveBeenCalled();
      expect(firstRun).toHaveBeenCalledTimes(1);
      expect(second.sent).toMatchObject({ status: 200, body: { data: { id: 9 } } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('AC-API-25: if the first request is still running after the wait, the repeat gets 429 with Retry-After (the client retries)', async () => {
    vi.useFakeTimers();
    try {
      const { ctx } = fakeContext();
      void withIdempotency(ctx, http().req, http().res, 'k1', () => new Promise(() => {}));
      await vi.advanceTimersByTimeAsync(0);
      const second = http();
      const outcome = withIdempotency(ctx, second.req, second.res, 'k1', async () => 'no').catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(IN_PROGRESS_WAIT_MS + 1000);
      expect(await outcome).toMatchObject({ code: 'RATE_LIMITED' });
      expect(second.sent.headers['Retry-After']).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('AC-API-25: recording the response is retried, and a brief database failure still ends with the response stored', async () => {
    vi.useFakeTimers();
    try {
      const { ctx, rows } = fakeContext({ failFinish: 2 });
      const run = withIdempotency(ctx, http().req, http().res, 'k1', async () => ({ ok: true }));
      await vi.advanceTimersByTimeAsync(2000);
      await expect(run).resolves.toEqual({ ok: true });
      expect(rows.get('k1')).toMatchObject({ state: 'done', status: 200 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('AC-API-25: if the response can never be recorded the request still succeeds, and the loss is logged with the key', async () => {
    vi.useFakeTimers();
    try {
      const { ctx } = fakeContext({ failFinish: true });
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const run = withIdempotency(ctx, http().req, http().res, 'k-lost', async () => ({ ok: true }));
      await vi.advanceTimersByTimeAsync(5000);
      await expect(run).resolves.toEqual({ ok: true });
      expect(log.mock.calls.flat().join(' ')).toContain('k-lost');
    } finally {
      vi.useRealTimers();
    }
  });

  it('AC-API-25: a failure to release the key after a server error is logged, not silent', async () => {
    const { ctx } = fakeContext({ failAbandon: true });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      withIdempotency(ctx, http().req, http().res, 'k-stuck', async () => {
        throw new Error('db exploded');
      }),
    ).rejects.toThrow('db exploded');
    expect(log.mock.calls.flat().join(' ')).toContain('k-stuck');
  });

  it('AC-API-25: a handler that sends its own response is not recorded (its body cannot be captured): the key is released', async () => {
    const { ctx, rows } = fakeContext();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { req, res } = http();
    (res as unknown as { headersSent: boolean }).headersSent = true;
    await withIdempotency(ctx, req, res, 'k1', async () => undefined);
    expect(rows.has('k1')).toBe(false);
  });

  it('AC-API-25: a response too large to store is not stored, and the key is released', async () => {
    const { ctx, rows } = fakeContext();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const big = { text: 'x'.repeat(1_100_000) };
    await expect(withIdempotency(ctx, http().req, http().res, 'k1', async () => big)).resolves.toBe(big);
    expect(rows.has('k1')).toBe(false);
  });

  it('a database error while claiming the key is logged with the key and fails the request (nothing ran)', async () => {
    const { ctx } = fakeContext({ beginError: { message: 'connection lost' } });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const run = vi.fn(async () => 1);
    await expect(withIdempotency(ctx, http().req, http().res, 'k-db', run)).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join(' ')).toContain('k-db');
  });

  it('a missing session at claim time is a 401, not a 500', async () => {
    const { ctx } = fakeContext({ beginError: { code: '28000', message: 'requires an authenticated user' } });
    await expect(withIdempotency(ctx, http().req, http().res, 'k1', async () => 1)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('AC-API-25: when the first request is released while a repeat waits, the repeat takes over and runs', async () => {
    vi.useFakeTimers();
    try {
      const { ctx, rows } = fakeContext();
      void withIdempotency(ctx, http().req, http().res, 'k1', () => new Promise(() => {}));
      await vi.advanceTimersByTimeAsync(0);
      const secondRun = vi.fn(async () => ({ id: 5 }));
      const waiting = withIdempotency(ctx, http().req, http().res, 'k1', secondRun);
      await vi.advanceTimersByTimeAsync(700);
      rows.delete('k1'); // the first request failed and released the key
      await vi.advanceTimersByTimeAsync(700);
      await expect(waiting).resolves.toEqual({ id: 5 });
      expect(secondRun).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('AC-API-25: the route is part of the identity, also without the rewrite (url fallback): two routes with one body do not collide', async () => {
    const { ctx } = fakeContext();
    const usage = http('POST', { n: 1 }, '');
    (usage.req as unknown as { url: string }).url = '/api/inventory/5/usage';
    (usage.req.query as Record<string, unknown>).id = '5';
    const undo = http('POST', { n: 1 }, '');
    (undo.req as unknown as { url: string }).url = '/api/inventory/5/usage-undo';
    (undo.req.query as Record<string, unknown>).id = '5';
    await withIdempotency(ctx, usage.req, usage.res, 'k1', async () => 'usage');
    await expect(withIdempotency(ctx, undo.req, undo.res, 'k1', async () => 'undo')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('NC-API-SERVICE-ROLE: only the three idempotency functions are called, as the caller', async () => {
    const { ctx, calls } = fakeContext();
    await withIdempotency(ctx, http().req, http().res, 'k1', async () => 1);
    expect([...new Set(calls)].sort()).toEqual(['idempotency_begin', 'idempotency_finish']);
  });
});
