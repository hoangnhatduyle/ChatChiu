import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

// Integration tests run the real router (api/handler.ts) in-process against
// the LOCAL Supabase stack started with `npx supabase start`. They never
// point at production: the URL must be a loopback address.
function localSupabaseEnv(): Record<string, string> {
  const raw = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const status = JSON.parse(raw.slice(raw.indexOf('{'))) as Record<string, string>;
  const url = status.API_URL ?? '';
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) {
    throw new Error(`Refusing to run integration tests against non-local Supabase: ${url}`);
  }
  return {
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: status.ANON_KEY ?? '',
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY ?? '',
    SUPABASE_DB_URL: status.DB_URL ?? '',
    OPENAI_API_KEY: 'test-key-openai-is-never-called',
    NODE_ENV: 'test',
  };
}

export default defineConfig({
  test: {
    include: ['__tests__/integration/**/*.test.ts'],
    env: localSupabaseEnv(),
    globalSetup: ['__tests__/integration/global-setup.ts'],
    // One shared local database: run files one after another.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
