import { defineConfig } from 'vitest/config'

// Roadmap 2.2: packages/domain must keep >= 90 % coverage.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
})
