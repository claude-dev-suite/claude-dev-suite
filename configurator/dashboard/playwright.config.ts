// SPDX-License-Identifier: MIT
import { defineConfig } from '@playwright/test';

/**
 * Playwright configuration for Dev-Suite Electron E2E tests.
 *
 * Prerequisites:
 *   - Server must be built: cd server && npm run build
 *   - Frontend must be built: npm run build
 *   - Port 3456 must be free (no dev instance running)
 *
 * Run:
 *   npm run test:e2e          # headless
 *   npm run test:e2e:ui       # interactive UI mode
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000, // 2 min — accounts for server startup
  expect: { timeout: 10_000 },
  retries: 1,
  workers: 1, // Electron tests must run serially (single app instance)
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'e2e-report' }],
  ],
  use: {
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.spec.ts',
    },
  ],
  outputDir: 'e2e-results',
});
