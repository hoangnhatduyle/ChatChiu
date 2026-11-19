import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './cors.js';
import { withErrorHandler, ApiError } from './errors.js';
import { readIdempotencyKey, withIdempotency } from './idempotency.js';
import { BUDGETED_METHODS, consumeWriteBudgetOrThrow, WRITE_BUDGET_RETRY_AFTER_S } from './writeBudget.js';
import { env } from './env.js';
import { requireAuth, type AuthContext } from './supabase.js';

type AuthedHandler = (
  ctx: AuthContext,
  req: VercelRequest,
  res: VercelResponse,
) => Promise<unknown>;

// Compose CORS + auth + error envelope. Endpoints that need auth use this
// wrapper; public endpoints (none currently) would use withErrorHandler directly.
export interface AuthedOptions {
  /**
   * False for a route whose response must not be stored or replayed (it carries a credential, such as
   * uploads/sign's signed URL and token). The Idempotency-Key header is then ignored.
   */
  idempotent?: boolean;
}

export function authedHandler(handler: AuthedHandler, { idempotent = true }: AuthedOptions = {}) {
  return withErrorHandler(async (req, res) => {
    if (applyCors(req, res)) return;
    const ctx = await requireAuth(req);
    if (req.method && BUDGETED_METHODS.has(req.method)) {
      try {
        await consumeWriteBudgetOrThrow(ctx.client, env.writeLimitPerMinute);
      } catch (error) {
        if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
          res.setHeader('Retry-After', String(WRITE_BUDGET_RETRY_AFTER_S));
        }
        throw error;
      }
    }
    // A write that carries an Idempotency-Key runs once per key (step 4.3b); others are unchanged.
    const key = idempotent ? readIdempotencyKey(req) : undefined;
    if (!key) return handler(ctx, req, res);
    return withIdempotency(ctx, req, res, key, () => handler(ctx, req, res));
  });
}

export function assertMethod(
  req: VercelRequest,
  allowed: readonly string[],
): string {
  if (!req.method || !allowed.includes(req.method)) {
    throw new ApiError(
      'METHOD_NOT_ALLOWED',
      `Allowed methods: ${allowed.join(', ')}`,
    );
  }
  return req.method;
}
