import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import dispatch from '../../handler.js';

// Test-only helpers. The service-role client is used here for fixtures and
// assertions only; routes under test always run with the caller's JWT.

const url = process.env.SUPABASE_URL ?? '';
const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const admin: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export interface TestUser {
  id: string;
  email: string;
  jwt: string;
  /** Supabase client bound to this user's JWT (RLS applies). */
  db: SupabaseClient;
}

export async function createTestUser(label: string): Promise<TestUser> {
  const email = `${label}-${crypto.randomUUID()}@chatchiu.test`;
  const password = `Pw-${crypto.randomUUID()}-Aa1`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) {
    throw new Error(`createUser failed: ${created.error?.message}`);
  }
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await anon.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) {
    throw new Error(`signIn failed: ${signedIn.error?.message}`);
  }
  const jwt = signedIn.data.session.access_token;
  const db = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { id: created.data.user.id, email, jwt, db };
}

export async function deleteTestUser(user: TestUser | undefined): Promise<void> {
  if (user) await admin.auth.admin.deleteUser(user.id);
}

export interface RouteResult<T = unknown> {
  status: number;
  body: T;
  /** Response headers the route set (for example Retry-After). */
  headers: Record<string, string>;
}

interface CallOptions {
  user?: TestUser;
  jwt?: string;
  body?: unknown;
  query?: Record<string, string>;
  /** Extra request headers, lower-case names (for example idempotency-key). */
  headers?: Record<string, string>;
}

/** Call the real router in-process, like Vercel would after the /api rewrite. */
export async function callApi<T = unknown>(
  method: string,
  path: string,
  { user, jwt, body, query = {}, headers = {} }: CallOptions = {},
): Promise<RouteResult<T>> {
  const out: RouteResult = { status: 0, body: undefined, headers: {} };
  let sent = false;
  const res = {
    get headersSent() {
      return sent;
    },
    setHeader: (name: string, value: string) => {
      out.headers[name] = value;
      return res;
    },
    status(code: number) {
      out.status = code;
      return res;
    },
    json(payload: unknown) {
      out.body = payload;
      sent = true;
      return res;
    },
    end() {
      sent = true;
      return res;
    },
  } as unknown as VercelResponse;
  const token = jwt ?? user?.jwt;
  const req = {
    method,
    url: `/api/${path}`,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    query: { ...query, __path: path },
    body,
  } as unknown as VercelRequest;
  await dispatch(req, res);
  return out as RouteResult<T>;
}

/** Create a category owned by the user through the API (never a seeded one). */
export async function createCategory(user: TestUser, name = `Cat ${crypto.randomUUID().slice(0, 8)}`) {
  const res = await callApi<{ data: { id: number; name: string } }>('POST', 'categories', {
    user,
    body: { name },
  });
  if (res.status !== 200) throw new Error(`createCategory failed: ${JSON.stringify(res.body)}`);
  return res.body.data;
}

export async function createLocation(user: TestUser, name = 'Fridge') {
  const res = await callApi<{ data: { id: number; name: string } }>('POST', 'locations', {
    user,
    body: { name },
  });
  if (res.status !== 200) throw new Error(`createLocation failed: ${JSON.stringify(res.body)}`);
  return res.body.data;
}
