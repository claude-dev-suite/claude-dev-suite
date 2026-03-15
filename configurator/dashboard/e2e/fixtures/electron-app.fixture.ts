// SPDX-License-Identifier: MIT
/**
 * Playwright fixtures for Dev-Suite Electron E2E tests.
 *
 * Provides reusable test contexts:
 *   - testProjectDir: temp git repo that acts as the "user project"
 *   - electronApp:    launched Electron application
 *   - splashPage:     first window (splash screen)
 *   - mainPage:       main dashboard window (after splash completes)
 */

import { test as base, _electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Re-export expect so tests import everything from here
export { expect } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the Electron main entry point
const MAIN_ENTRY = path.resolve(__dirname, '../../electron/main.cjs');

// Dev-suite root (two levels up from configurator/dashboard)
const DEV_SUITE_ROOT = path.resolve(__dirname, '../../../..');

/** Shared temp directory created once per worker */
let sharedTestProject: string | null = null;

/**
 * Create a minimal test project directory with git, package.json, and source files.
 * Reused across tests in the same worker to speed things up.
 */
function getOrCreateTestProject(): string {
  if (sharedTestProject && fs.existsSync(sharedTestProject)) {
    return sharedTestProject;
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devsuite-e2e-'));

  // Initialize git repo
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "e2e@test.local"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "E2E Test"', { cwd: dir, stdio: 'pipe' });

  // Minimal project structure that triggers detection
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'e2e-test-project',
        version: '1.0.0',
        dependencies: {
          react: '^19.0.0',
          'react-dom': '^19.0.0',
          express: '^5.0.0',
        },
        devDependencies: {
          typescript: '^5.0.0',
          vitest: '^4.0.0',
        },
      },
      null,
      2,
    ),
  );

  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const hello = "world";\n');
  fs.writeFileSync(path.join(dir, 'src', 'App.tsx'), 'export function App() { return <div>Hello</div>; }\n');

  // Initial commit so git commands work
  execSync('git add -A', { cwd: dir, stdio: 'pipe' });
  execSync('git commit -m "initial commit"', { cwd: dir, stdio: 'pipe' });

  sharedTestProject = dir;
  return dir;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export type TestFixtures = {
  /** Path to a temp git-initialized project directory */
  testProjectDir: string;
  /** Launched Electron application (splash visible) */
  electronApp: ElectronApplication;
  /** Splash screen page (first window) */
  splashPage: Page;
  /** Main dashboard page (after completing splash flow) */
  mainPage: Page;
};

/**
 * Base test with only the test project directory.
 * Use this for tests that launch the app manually.
 */
export const test = base.extend<TestFixtures>({
  // ── Test project ────────────────────────────────────────────────────
  testProjectDir: async ({}, use) => {
    const dir = getOrCreateTestProject();
    await use(dir);
    // Don't delete — shared across tests in the worker
  },

  // ── Electron app ────────────────────────────────────────────────────
  electronApp: async ({ testProjectDir }, use) => {
    const app = await _electron.launch({
      args: [MAIN_ENTRY],
      cwd: testProjectDir,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DEV_SUITE_DIR: DEV_SUITE_ROOT,
        E2E_HEADLESS: '1',
      },
    });
    await use(app);
    await app.close().catch(() => {
      /* app may already be closed */
    });
  },

  // ── Splash page ─────────────────────────────────────────────────────
  splashPage: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    // Wait for the splash to finish loading
    await page.waitForLoadState('domcontentloaded');
    await use(page);
  },

  // ── Main page (full startup flow) ──────────────────────────────────
  mainPage: async ({ electronApp, splashPage }, use) => {
    // The splash auto-fills the path from cwd (testProjectDir).
    // Click Start to begin initialization.
    const startBtn = splashPage.locator('#btnStart');
    await startBtn.waitFor({ state: 'visible' });
    await startBtn.click();

    // Wait for the main window to appear (server starts, dashboard loads).
    // The splash window closes and a new BrowserWindow opens.
    // In dev mode Electron may also open a DevTools window, so we keep
    // listening until we get a page whose URL is NOT devtools://.
    let mainPage: Page | null = null;
    const deadline = Date.now() + 90_000;
    while (!mainPage && Date.now() < deadline) {
      const candidate = await electronApp.waitForEvent('window', {
        timeout: Math.max(deadline - Date.now(), 1_000),
      });
      const url = candidate.url();
      if (!url.startsWith('devtools://')) {
        mainPage = candidate;
      }
    }
    if (!mainPage) {
      throw new Error('Main window did not appear within 90 seconds');
    }

    // Wait for the React app to mount
    await mainPage.waitForLoadState('domcontentloaded');
    // Wait for either the wizard or the orchestrator to be visible
    await mainPage.waitForSelector('[data-testid], .splash-container, main', {
      timeout: 60_000,
    });

    await use(mainPage);
  },
});
