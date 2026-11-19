import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './errors.js';

// Per-user write budget (roadmap 7.0.13d), counted in SQL by public.consume_write_budget (migration 0020): one atomic
// upsert per write, one window per minute. This is abuse control, not authorization, so when the check itself cannot run
// (for example the migration is not applied yet) the write goes through and the failure is logged: refusing every write
// because a counter is unavailable would be the worse outage.

export const BUDGETED_METHODS: ReadonlySet<string> = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
/** Seconds to wait, as a conservative Retry-After: the window is a minute long. */
export const WRITE_BUDGET_RETRY_AFTER_S = 60;

export async function consumeWriteBudgetOrThrow(client: SupabaseClient, max: number): Promise<void> {
  const { data, error } = await client.rpc('consume_write_budget', { p_limit: max });
  if (error) {
    // Visible in the logs on every write while it lasts (PGRST202 = migration 0020 is not applied on this database).
    console.error(
      `[writeBudget] NOT ENFORCED: consume_write_budget failed (${error.code}: ${error.message}); the write goes through`,
    );
    return;
  }
  if (data === false) {
    throw new ApiError('RATE_LIMITED', 'Too many changes in a short time. Wait a minute and try again.');
  }
}
