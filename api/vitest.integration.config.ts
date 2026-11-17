import { execFileSync } from 'node:child_process';
import webpush from 'web-push';
import { defineConfig } from 'vitest/config';

function testVapidKeys(): Record<string, string> {
  const { publicKey, privateKey } = webpush.generateVAPIDKeys();
  return { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: 'mailto:test@chatchiu.test' };
}

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
    OPENAI_API_KEY: 'test-key-openai-is-never-called',
    // Quotas of 0: both AI routes stop at QUOTA_EXCEEDED before any OpenAI call.
    AI_QUOTA_EXPIRATION_PER_MONTH: '0',
    AI_QUOTA_RECEIPT_PER_MONTH: '0',
    // Throwaway VAPID pair so the push routes are "configured"; tests never send to a real endpoint.
    ...testVapidKeys(),
    CRON_SECRET: 'test-cron-secret',
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
