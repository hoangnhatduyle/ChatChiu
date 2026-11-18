/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    // Installable PWA with an offline shell (SPEC-AP-001 F-AP-01). Prompt mode: a new version
    // waits for "Reload" (shell/UpdatePrompt.tsx, F-SE-05). No inline registration script, so
    // the strict CSP (script-src 'self') holds. The manifest stays the static
    // public/manifest.webmanifest (step 3.4).
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,
      workbox: {
        // Everything the app shows offline. Fail-safe: any new image is precached unless it is
        // listed here. The install icons (Chrome fetches them itself) and the 1.5 MB chef-pig
        // artwork are left out to keep the install download small.
        globPatterns: ['**/*.{js,css,html,woff2,ico,png,svg,webmanifest}'],
        globIgnores: [
          '**/sw-diagnostics.js',
          '**/sw-push.js',
          'chac-chiu-icon.png',
          'icons/icon-{72x72,128x128,144x144,152x152,192x192,384x384,512x512}.png',
          'icons/icon-maskable-*.png',
        ],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  // The budget gate (scripts/check-bundle-budget.mjs) reads chunk sizes from the manifest.
  build: { manifest: true },
  // Pre-bundle the dev-only gallery's deps too, so the dev server never reloads mid-test.
  optimizeDeps: { entries: ['index.html', 'ui-gallery.html'] },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Raw CSS reaches the token and font tests (styles/*.test.ts); other CSS is stubbed.
    css: { include: [/\.css\?raw$/] },
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    alias: {
      // No service workers in jsdom: a stand-in for vite-plugin-pwa's React hook.
      'virtual:pwa-register/react': fileURLToPath(
        new URL('./src/test/pwa-register-react.ts', import.meta.url),
      ),
    },
  },
})
