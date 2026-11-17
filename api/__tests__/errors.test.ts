import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, withErrorHandler } from '../_lib/errors.js';

function call(handler: () => Promise<unknown>) {
  const out: { status: number; body: unknown } = { status: 0, body: undefined };
  const res = {
    headersSent: false,
    status: (code: number) => ((out.status = code), res),
    json: (b: unknown) => ((out.body = b), res),
  } as unknown as VercelResponse;
  return withErrorHandler(handler)({} as VercelRequest, res).then(() => out);
}

afterEach(() => vi.unstubAllEnvs());

describe('error envelope (AC-API-01, NC-API-ENVELOPE, NC-API-NO-LEAK)', () => {
  it('AC-API-01: success is { data } with 200', async () => {
    expect(await call(async () => ({ ok: 1 }))).toEqual({ status: 200, body: { data: { ok: 1 } } });
  });

  it('NC-API-NO-LEAK: in production an unexpected error is a bare 500 with no details', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const out = await call(async () => {
      throw new Error('relation "secret_table" does not exist at line 1');
    });
    expect(out).toEqual({
      status: 500,
      body: { error: { code: 'INTERNAL', message: 'Internal server error' } },
    });
  });

  it('NC-API-NO-LEAK: in production an ApiError keeps code and message but drops details', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const out = await call(async () => {
      throw new ApiError('INTERNAL', 'Failed to load', { code: '42P01', message: 'sql text' });
    });
    expect(out.body).toEqual({ error: { code: 'INTERNAL', message: 'Failed to load' } });
  });

  it('AC-API-12: existingId survives production; details only outside it', async () => {
    const err = () => {
      throw new ApiError('CONFLICT', 'Slot taken', { pg: '23505' }, { existingId: 42 });
    };
    vi.stubEnv('NODE_ENV', 'production');
    expect((await call(async () => err())).body).toEqual({
      error: { code: 'CONFLICT', message: 'Slot taken', existingId: 42 },
    });
    vi.stubEnv('NODE_ENV', 'development');
    expect((await call(async () => err())).body).toEqual({
      error: { code: 'CONFLICT', message: 'Slot taken', details: { pg: '23505' }, existingId: 42 },
    });
  });
});
