/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// base './' + HashRouter so the static build works from any path (GitHub Pages, a file server, etc.)
export default defineConfig({
  base: './',
  plugins: [
    react(),
    // The installable app (docs/WEB_APP_NOTES.md, "Installable app"). The manifest is a static file (public/manifest.webmanifest, relative paths, so it
    // works under /the-commish/); the worker is src/app/pwa/sw.ts, built to dist/sw.js with the built files listed in it. The page registers it itself
    // (src/app/pwa/register.ts), so no script is injected into index.html. Nothing runs in `vite dev`.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/app/pwa',
      filename: 'sw.ts',
      injectRegister: false,
      manifest: false,
      registerType: 'prompt',
      injectManifest: {
        rollupFormat: 'iife',
        // the app shell and built assets. public/data (the nightly nflverse JSON, written after the build) is left out: the worker caches it as it is read.
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2,webmanifest}'],
        globIgnores: ['data/**', 'sw.js'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    // fixture tests decode several MB of saved Sleeper data; 5 s is too tight on a busy machine or CI runner
    testTimeout: 20_000,
    // a couple of simulation-gated UI tests are timing-sensitive on small CI runners; locally a failure is a failure
    retry: process.env.CI ? 2 : 0,
    // UI tests build their clock from local-time dates (Tue 8 pm, Sun 10 am); pin the zone so CI (UTC) and a laptop agree.
    // The moments engine itself passes in UTC and Pacific too.
    env: { TZ: 'America/Chicago' },
  },
})
