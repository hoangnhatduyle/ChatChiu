/// <reference types="vitest/config" />
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  // Pre-bundle the dev-only gallery's deps too, so the dev server never reloads mid-test.
  optimizeDeps: { entries: ['index.html', 'ui-gallery.html'] },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Raw CSS reaches the token and font tests (styles/*.test.ts); other CSS is stubbed.
    css: { include: [/\.css\?raw$/] },
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
  },
})
