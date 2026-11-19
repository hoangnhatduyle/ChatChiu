import { defineConfig, devices } from '@playwright/test'

// The API router (e2e/api-client.spec.ts) reads these when it is first imported, in whichever worker
// that is, so they are set for every worker here. Quota 0: the AI routes answer QUOTA_EXCEEDED before
// any OpenAI call.
process.env.AI_QUOTA_EXPIRATION_PER_MONTH = '0'
process.env.AI_QUOTA_RECEIPT_PER_MONTH = '0'
process.env.OPENAI_API_KEY ??= 'test-key-openai-is-never-called'

const PORT = 4173
// Dev server for the component gallery (ui-gallery.html never ships in the production build).
const UI_PORT = 4174
// E2E_SUITE=app runs only the built app (needs dist/), E2E_SUITE=ui only the gallery (dev server).
// Unset (CI): both servers start and every project runs.
const SUITE = process.env.E2E_SUITE

// Two form factors from architecture.md §1: Fire Max 11 landscape and a phone.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    // E2E_COLOR_SCHEME=dark runs the functional specs once in the dark theme (roadmap 7.0.35b).
    colorScheme: process.env.E2E_COLOR_SCHEME === 'dark' ? 'dark' : undefined,
  },
  expect: {
    // Same Chromium and self-hosted fonts locally and in CI; allow anti-aliasing noise only.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  projects: [
    {
      name: 'tablet',
      testIgnore: 'ui/**',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, hasTouch: true },
    },
    {
      name: 'phone',
      // shell.spec.ts and visual.spec.ts set their own sizes, and the Node-only specs (no page) do not depend
      // on the form factor, so they run once, in the tablet project.
      testIgnore: [
        'ui/**',
        'shell.spec.ts',
        'visual.spec.ts',
        'auth-core.spec.ts',
        'api-client.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      // Component screenshots (light + dark) and real-pointer tests, roadmap 3.2.
      name: 'ui',
      testDir: './e2e/ui',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${UI_PORT}` },
    },
  ],
  webServer: [
    ...(SUITE === 'ui'
      ? []
      : [
          {
            command: `npm run preview -- --port ${PORT} --strictPort`,
            port: PORT,
            reuseExistingServer: !process.env.CI,
          },
        ]),
    ...(SUITE === 'app'
      ? []
      : [
          {
            command: `npx vite --port ${UI_PORT} --strictPort`,
            port: UI_PORT,
            reuseExistingServer: !process.env.CI,
          },
        ]),
  ],
})
