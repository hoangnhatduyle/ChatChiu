import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ApiError } from './errors.js';
import type { AuthContext } from './supabase.js';

// Idempotent writes (roadmap step 4.3b, SPEC-API-001 AC-API-25). The web app queues writes while
// offline and retries them after a timeout, so one request can arrive twice. A write that carries an
// `Idempotency-Key` header is run once per (user, key): a repeat gets the stored response instead.
// The state lives in public.idempotency_keys behind the caller's own JWT (RLS), never the service
// role (NC-API-SERVICE-ROLE). Requests without the header behave exactly as before (the old app).
//
// Delivery is at-least-once in two narrow cases, both logged: the process dies after a write
// committed but before its response was recorded (the claim is taken over after a 2-minute lease and
// the write runs again), and a server error after a commit releases the key.

const KEY_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const MUTATING = new Set(['POST', 'PATCH', 'DELETE']);
/**
 * Only answers that depend on nothing but the request are stored and replayed. A 404, 409, 403 or 429
 * can change (the parent was created meanwhile, the slot was freed, the quota reset), so they release
 * the key and a retry runs again; so does any 5xx.
 */
const STORED_STATUSES: ReadonlySet<number> = new Set([400, 413, 415, 422]);
/** How long a repeat waits for the first request, which may still be running, before asking the client to retry. */
export const IN_PROGRESS_WAIT_MS = 6_000;
const POLL_MS = 500;
const RETRY_AFTER_SECONDS = '2';
const RECORD_ATTEMPTS = 3;
const RECORD_BACKOFF_MS = 200;
/** Largest response stored (the table allows 1 MiB). A larger one is not stored and the key is released. */
const MAX_STORED_BYTES = 1_000_000;
const MAX_BODY_DEPTH = 64;
const SQLSTATE_NOT_AUTHENTICATED = '28000';

/** The validated key of a write, or undefined when there is none (or the request is not a write). */
export function readIdempotencyKey(req: VercelRequest): string | undefined {
  if (!req.method || !MUTATING.has(req.method)) return undefined;
  const raw = req.headers['idempotency-key'];
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || !KEY_PATTERN.test(raw)) {
    throw new ApiError('BAD_REQUEST', 'Idempotency-Key must be 1 to 100 letters, digits, "_" or "-"');
  }
  return raw;
}

/** JSON with object keys sorted, so the same request always gives the same text. */
function canonical(value: unknown, depth = 0): string {
  if (depth > MAX_BODY_DEPTH) throw new ApiError('BAD_REQUEST', 'Request body is nested too deeply');
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v, depth + 1)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v, depth + 1)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function requestHash(input: { method: string; query: Record<string, unknown>; body: unknown }): string {
  const hash = createHash('sha256');
  hash.update(`${input.method}\n${canonical(input.query)}\n`);
  // A raw body (text or bytes, when it was not parsed as JSON) is hashed as it is, not walked.
  if (typeof input.body === 'string' || Buffer.isBuffer(input.body)) hash.update(input.body);
  else hash.update(canonical(input.body));
  return hash.digest('hex');
}

type Begin = { state: 'new' | 'in_progress' | 'done' | 'mismatch'; status: number | null; response: unknown };
const STATES = new Set(['new', 'in_progress', 'done', 'mismatch']);

const describe = (key: string, method: string, path: string) => `key=${key} ${method} /${path}`;

async function begin(
  ctx: AuthContext,
  key: string,
  method: string,
  path: string,
  hash: string,
): Promise<Begin> {
  const { data, error } = await ctx.client.rpc('idempotency_begin', {
    p_key: key,
    p_method: method,
    p_path: path,
    p_request_hash: hash,
  });
  const row = Array.isArray(data) ? (data[0] as Begin | undefined) : undefined;
  if (error || !row || !STATES.has(row.state)) {
    if ((error as { code?: string } | null)?.code === SQLSTATE_NOT_AUTHENTICATED) {
      throw new ApiError('UNAUTHORIZED', 'Invalid or expired session');
    }
    console.error(`[api] idempotency_begin failed (${describe(key, method, path)})`, error ?? 'unexpected result');
    throw new Error('idempotency_begin failed');
  }
  return row;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function errorBody(error: ApiError) {
  // `details` is left out: it is only for non-production responses and must not be replayed.
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.existingId != null ? { existingId: error.existingId } : {}),
    },
  };
}

/** The route this request is for: the rewrite's __path, else the URL, so two routes never share an identity. */
function routeOf(req: VercelRequest, rawPath: unknown): string {
  const fromRewrite = Array.isArray(rawPath) ? rawPath.join('/') : typeof rawPath === 'string' ? rawPath : '';
  const route = fromRewrite || (req.url ?? '').split('?')[0].replace(/^\/+/, '').replace(/^api\/?/, '');
  if (!route) throw new Error('idempotency: cannot tell which route this request is for');
  return route;
}

/**
 * Runs `run` at most once for this user and key. A repeat gets the first response. Answers that depend
 * only on the request (success, 400/413/415/422) are stored; anything else releases the key so a retry
 * runs. Returns undefined when it already sent a stored response.
 */
export async function withIdempotency<T>(
  ctx: AuthContext,
  req: VercelRequest,
  res: VercelResponse,
  key: string,
  run: () => Promise<T>,
): Promise<T | undefined> {
  // The route (__path) is not part of the request's identity; every other query parameter is.
  const { __path: rawPath, ...rest } = req.query as Record<string, unknown>;
  const method = req.method ?? 'POST';
  const path = routeOf(req, rawPath);
  const hash = requestHash({ method, query: rest, body: req.body });
  const label = describe(key, method, path);

  const deadline = Date.now() + IN_PROGRESS_WAIT_MS;
  let state = await begin(ctx, key, method, path, hash);
  let failedPolls = 0;
  while (state.state === 'in_progress' && Date.now() < deadline) {
    await sleep(POLL_MS);
    try {
      state = await begin(ctx, key, method, path, hash);
    } catch (error) {
      // One bad poll must not fail a request whose first attempt is still running.
      if (error instanceof ApiError || (failedPolls += 1) > 1) throw error;
    }
  }

  if (state.state === 'mismatch') {
    console.error(`[api] idempotency key reused for a different request (${label})`);
    throw new ApiError('BAD_REQUEST', 'Idempotency-Key was already used for a different request');
  }
  if (state.state === 'in_progress') {
    res.setHeader('Retry-After', RETRY_AFTER_SECONDS);
    throw new ApiError('RATE_LIMITED', 'The same request is still being processed');
  }
  if (state.state === 'done') {
    if (state.status === null) throw new Error(`idempotency: a finished key has no status (${label})`);
    res.status(state.status).json(state.response);
    return undefined;
  }

  // state 'new': this call owns the key.
  try {
    const data = await run();
    if (res.headersSent) {
      // The handler answered by itself: its status and body cannot be captured, so nothing is stored.
      console.error(`[api] a handler sent its own response, so it is not idempotent (${label})`);
      await release(ctx, key, label);
      return data;
    }
    // Serialized once, so the stored copy is exactly what the client gets.
    const body = JSON.stringify({ data: data ?? null });
    if (Buffer.byteLength(body) > MAX_STORED_BYTES) {
      console.error(`[api] response too large to store for idempotency (${label})`);
      await release(ctx, key, label);
      return data;
    }
    await record(ctx, key, 200, JSON.parse(body) as unknown, label);
    return data;
  } catch (error) {
    if (error instanceof ApiError && STORED_STATUSES.has(error.status)) {
      await record(ctx, key, error.status, errorBody(error), label);
    } else {
      await release(ctx, key, label);
    }
    throw error;
  }
}

/** Stores the response, retrying briefly. A failure must not fail a request that already succeeded, so it is logged. */
async function record(
  ctx: AuthContext,
  key: string,
  status: number,
  response: unknown,
  label: string,
): Promise<void> {
  for (let attempt = 1; attempt <= RECORD_ATTEMPTS; attempt += 1) {
    try {
      const { error } = await ctx.client.rpc('idempotency_finish', {
        p_key: key,
        p_status: status,
        p_response: response,
      });
      if (!error) return;
      throw new Error(error.message);
    } catch (error) {
      if (attempt === RECORD_ATTEMPTS) {
        // The claim stays 'in_progress' and is taken over after its lease: the write may run again.
        console.error(`[api] could not record the idempotent response (${label})`, error);
        return;
      }
      await sleep(RECORD_BACKOFF_MS * attempt);
    }
  }
}

/** Releases the key so a retry runs. If that fails the lease takes over, so it is logged, not thrown. */
async function release(ctx: AuthContext, key: string, label: string): Promise<void> {
  try {
    const { error } = await ctx.client.rpc('idempotency_abandon', { p_key: key });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error(`[api] could not release an idempotency key (${label})`, error);
  }
}
