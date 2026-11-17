import type { VercelRequest, VercelResponse } from '@vercel/node';
import { env } from './env.js';

// Strict CORS: only origins listed in API_ALLOWED_ORIGINS are accepted.
// If the env var is empty (e.g. local dev with curl), no Access-Control-Allow-Origin
// header is sent and the browser will block the request - that is intentional;
// configure the env var explicitly even in dev.

export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin;
  // The answer depends on the Origin header whether or not it is allowed, so caches must key on it.
  res.setHeader('Vary', 'Origin');
  if (typeof origin === 'string' && env.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization,Content-Type,X-Requested-With,Idempotency-Key',
    );
    // The browser may read Retry-After from a 429 (a repeat of a write that is still running).
    res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
    res.setHeader('Access-Control-Max-Age', '600');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }

  return false;
}
