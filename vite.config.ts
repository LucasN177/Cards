/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import packageJson from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from https://<user>.github.io/Cards/
  base: process.env.GITHUB_PAGES ? '/Cards/' : '/',
  define: {
    // Shown in the app footer; bump "version" in package.json with every release.
    __APP_VERSION__: JSON.stringify(packageJson.version),
    // Always inline the flag (also when unset) so test-game code is dropped from normal builds.
    'import.meta.env.VITE_ENABLE_TEST_GAMES': JSON.stringify(
      process.env.VITE_ENABLE_TEST_GAMES ?? '',
    ),
  },
  // The AI worker imports shared modules; ES module workers allow code splitting.
  worker: { format: 'es' },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Ask the user before activating a new version, so a running game is never reloaded unexpectedly.
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Cards',
        short_name: 'Cards',
        description: 'Classic card games. Smarter opponents. Endless fun.',
        lang: 'de',
        theme_color: '#14532d',
        background_color: '#14532d',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webp,mp3,ogg}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Simulation tests keep CPUs busy; UI tests running next to them need some slack.
    testTimeout: 20_000,
    alias: {
      'virtual:pwa-register/react': fileURLToPath(
        new URL('./src/test/mocks/pwa-register-react.ts', import.meta.url),
      ),
    },
  },
})
