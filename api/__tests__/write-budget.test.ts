import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Step 6.5 (security review): the write budget fails OPEN (a counter that cannot be read must not stop every write), so
// the failure has to be loud: the log line says the limit is not enforced and why.
beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('SUPABASE_ANON_KEY', 'a');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 's');
  vi.stubEnv('OPENAI_API_KEY', 'unused');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const clientAnswering = (answer: { data: unknown; error: { code: string; message: string } | null }) =>
  ({ rpc: vi.fn(async () => answer) }) as unknown as SupabaseClient;

describe('consumeWriteBudgetOrThrow', () => {
  it('lets the write through, and says loudly that the limit is not enforced, when the function is missing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { consumeWriteBudgetOrThrow } = await import('../_lib/writeBudget.js');
    const client = clientAnswering({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.consume_write_budget' } });
    await expect(consumeWriteBudgetOrThrow(client, 300)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0]![0])).toMatch(/NOT ENFORCED.*PGRST202.*consume_write_budget/);
  });

  it('answers RATE_LIMITED when the function says the budget is used up', async () => {
    const { consumeWriteBudgetOrThrow } = await import('../_lib/writeBudget.js');
    await expect(consumeWriteBudgetOrThrow(clientAnswering({ data: false, error: null }), 3)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
    });
  });

  it('passes while the budget lasts', async () => {
    const { consumeWriteBudgetOrThrow } = await import('../_lib/writeBudget.js');
    await expect(consumeWriteBudgetOrThrow(clientAnswering({ data: true, error: null }), 3)).resolves.toBeUndefined();
  });
});
