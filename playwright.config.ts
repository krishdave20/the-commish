/* Playwright runs against `vite preview` of the built dist/ (the app is a static web app, not Electron; see
   docs/WEB_APP_NOTES.md). The smoke test serves every network call from reference/fixture/, so it needs no internet. */
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  outputDir: './e2e/results/artifacts',
  reporter: [['list'], ['html', { outputFolder: 'e2e/results/report', open: 'never' }]],
  // one browser session per project: the route visits share a signed-in page (see e2e/session.ts), so run them in order
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    // same visits at phone width (also asserts no horizontal page overflow)
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    // build once, then serve the real dist/ (the same files GitHub Pages serves)
    command: `npm run dist && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
