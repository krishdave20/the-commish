/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' + HashRouter so the static build works from any path (GitHub Pages, a file server, etc.)
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    // fixture tests decode several MB of saved Sleeper data; 5 s is too tight on a busy machine or CI runner
    testTimeout: 20_000,
    // a couple of simulation-gated UI tests are timing-sensitive on small CI runners; locally a failure is a failure
    retry: process.env.CI ? 2 : 0,
  },
})
