import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The browser sends Idempotency-Key on writes; a cross-origin API must allow it in the preflight,
// or every queued write would fail (step 4.3b).
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('CORS', () => {
  it('varies on Origin even for an origin that is not allowed', async () => {
    vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('SUPABASE_ANON_KEY', 'a');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 's');
    vi.stubEnv('OPENAI_API_KEY', 'unused');
    vi.stubEnv('API_ALLOWED_ORIGINS', 'https://app.example');
    const { applyCors } = await import('../_lib/cors.js');
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (k: string, v: string) => void (headers[k] = v),
      status: () => res,
      end: () => res,
    } as unknown as VercelResponse;
    applyCors({ method: 'GET', headers: { origin: 'https://evil.example' } } as unknown as VercelRequest, res);
    expect(headers.Vary).toBe('Origin');
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('AC-API-25: allows the Idempotency-Key header for a listed origin', async () => {
    vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('SUPABASE_ANON_KEY', 'a');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 's');
    vi.stubEnv('OPENAI_API_KEY', 'unused');
    vi.stubEnv('API_ALLOWED_ORIGINS', 'https://app.example');
    const { applyCors } = await import('../_lib/cors.js');
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (k: string, v: string) => void (headers[k] = v),
      status: () => res,
      end: () => res,
    } as unknown as VercelResponse;
    const handled = applyCors({ method: 'OPTIONS', headers: { origin: 'https://app.example' } } as unknown as VercelRequest, res);
    expect(handled).toBe(true);
    expect(headers['Access-Control-Allow-Headers']).toContain('Idempotency-Key');
    expect(headers['Access-Control-Expose-Headers']).toContain('Retry-After');
    expect(headers.Vary).toBe('Origin');
  });
});
