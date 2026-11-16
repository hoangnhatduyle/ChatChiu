import { defineConfig } from 'vitest/config';

// Unit tests only. Integration tests against local Supabase run with
// `npm run test:integration -w api` (vitest.integration.config.ts).
export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    exclude: ['__tests__/integration/**', '**/node_modules/**'],
  },
});
