import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { TestProject } from 'vitest/node';

// Make the local database look like production after the hand-run
// make-categories-editable.sql (roadmap 7.0.10, AR-NO-SEED-ASSUMPTIONS):
// every seeded system category becomes a user-owned row of a throwaway
// "seed owner". Tests then pass only if they create their own categories.
export const SEED_OWNER_EMAIL = 'seed-owner@chatchiu.test';

export default async function setup(project: TestProject): Promise<void> {
  const env = project.config.env as Record<string, string>;
  // This setup rewrites category rows: re-check it can only touch a local stack.
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(env.SUPABASE_URL ?? '')) {
    throw new Error(`global-setup refuses non-local Supabase: ${env.SUPABASE_URL}`);
  }
  const admin = createClient(env.SUPABASE_URL ?? '', env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The post-cutover security hardening (supabase/post-cutover): production gets it after the old app is retired, and
  // every test here runs against the database as it will be then. Idempotent.
  execFileSync('node', [fileURLToPath(new URL('../../../scripts/apply-post-cutover.mjs', import.meta.url))], {
    stdio: 'inherit',
  });

  const ownerId = await ensureSeedOwner(admin);
  const { error } = await admin
    .from('categories')
    .update({ is_system: false, user_id: ownerId })
    .eq('is_system', true);
  if (error) throw new Error(`Could not convert system categories: ${error.message}`);
}

async function ensureSeedOwner(admin: SupabaseClient): Promise<string> {
  const created = await admin.auth.admin.createUser({
    email: SEED_OWNER_EMAIL,
    password: `Seed-${crypto.randomUUID()}`,
    email_confirm: true,
  });
  if (created.data.user) return created.data.user.id;

  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Could not list users: ${error.message}`);
  const owner = data.users.find((u) => u.email === SEED_OWNER_EMAIL);
  if (!owner) throw new Error(`Could not create seed owner: ${created.error?.message}`);
  return owner.id;
}
