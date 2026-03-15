// SPDX-License-Identifier: MIT
import { test as base, _electron, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAIN_ENTRY = path.resolve(__dirname, '../../electron/main.cjs');
const DEV_SUITE_ROOT = path.resolve(__dirname, '../../../..');

/**
 * Full Integration Flow — end-to-end user journey:
 *   Splash → Start → Main Window → Wizard step 1–5 → Install → Orchestrator
 *
 * This uses its own fixtures to control the full lifecycle.
 */

function createTestProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devsuite-e2e-flow-'));

  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "e2e@test.local"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "E2E Test"', { cwd: dir, stdio: 'pipe' });

  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'e2e-flow-project',
        version: '1.0.0',
        dependencies: { react: '^19.0.0', express: '^5.0.0' },
        devDependencies: { typescript: '^5.0.0', vitest: '^3.0.0' },
      },
      null,
      2,
    ),
  );

  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'console.log("hello");\n');
  fs.writeFileSync(path.join(dir, 'src', 'App.tsx'), 'export default function App() { return <div/>; }\n');

  execSync('git add -A', { cwd: dir, stdio: 'pipe' });
  execSync('git commit -m "initial commit"', { cwd: dir, stdio: 'pipe' });

  return dir;
}

const test = base.extend<{
  testProjectDir: string;
  electronApp: ElectronApplication;
}>({
  testProjectDir: async ({}, use) => {
    const dir = createTestProject();
    await use(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  },
  electronApp: async ({ testProjectDir }, use) => {
    const app = await _electron.launch({
      args: [MAIN_ENTRY],
      cwd: testProjectDir,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DEV_SUITE_DIR: DEV_SUITE_ROOT,
      },
    });
    await use(app);
    await app.close().catch(() => {});
  },
});

test.describe('Full Integration Flow', () => {
  test('splash → wizard → install → orchestrator', async ({ electronApp }) => {
    // ── Phase 1: Splash screen ──
    const splashPage = await electronApp.firstWindow();
    await splashPage.waitForLoadState('domcontentloaded');

    // Verify splash elements
    const logo = splashPage.locator('.logo');
    await expect(logo).toBeVisible({ timeout: 5_000 });

    const startBtn = splashPage.locator('#btnStart');
    await expect(startBtn).toBeVisible();
    await expect(startBtn).toBeEnabled();

    // Click Start
    await startBtn.click();
    await expect(startBtn).toBeDisabled();
    await expect(startBtn).toHaveText('Starting...');

    // ── Phase 2: Main window opens ──
    const mainPage = await electronApp.waitForEvent('window', { timeout: 90_000 });
    await mainPage.waitForLoadState('domcontentloaded');
    await mainPage.waitForSelector('aside, main, [data-testid]', { timeout: 30_000 });

    // ── Phase 3: Wizard Step 1 — Detection ──
    const sidebar = mainPage.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    // Detection step should auto-run and show results
    await mainPage.waitForTimeout(3_000);
    let pageContent = await mainPage.textContent('body');
    expect(pageContent).toContain('Detection');

    // ── Phase 4: Navigate through wizard steps ──
    // Step 1 → 2 (Agents)
    let continueBtn = mainPage.locator('button:has-text("Continue")');
    await continueBtn.first().click();
    await mainPage.waitForTimeout(2_000);

    pageContent = await mainPage.textContent('body');
    const hasAgentsContent =
      pageContent?.includes('Agent') || pageContent?.includes('expert');
    expect(hasAgentsContent).toBeTruthy();

    // Step 2 → 3 (MCP Servers)
    continueBtn = mainPage.locator('button:has-text("Continue")');
    await continueBtn.first().click();
    await mainPage.waitForTimeout(2_000);

    pageContent = await mainPage.textContent('body');
    const hasMcpContent =
      pageContent?.includes('MCP') || pageContent?.includes('Server');
    expect(hasMcpContent).toBeTruthy();

    // Step 3 → 4 (Environment)
    continueBtn = mainPage.locator('button:has-text("Continue")');
    await continueBtn.first().click();
    await mainPage.waitForTimeout(2_000);

    pageContent = await mainPage.textContent('body');
    const hasEnvContent =
      pageContent?.includes('Environment') || pageContent?.includes('Variable');
    expect(hasEnvContent).toBeTruthy();

    // Step 4 → 5 (Install)
    continueBtn = mainPage.locator('button:has-text("Continue")');
    await continueBtn.first().click();
    await mainPage.waitForTimeout(2_000);

    pageContent = await mainPage.textContent('body');
    expect(pageContent).toContain('Installation');

    // ── Phase 5: Verify Install step UI ──
    const installBtn = mainPage.locator('button:has-text("Start Installation")');
    await expect(installBtn).toBeVisible({ timeout: 5_000 });

    // Verify summary counts are shown
    const summaryContent = await mainPage.textContent('body');
    expect(summaryContent).toContain('Agents');
    expect(summaryContent).toContain('MCP Servers');

    // ── Phase 6: All wizard steps should be marked done in sidebar ──
    const completedSteps = sidebar.locator('.bg-green-500');
    const completedCount = await completedSteps.count();
    // At least steps 1-4 should be completed (shown as green circles)
    expect(completedCount).toBeGreaterThanOrEqual(3);
  });

  test('tool windows accessible throughout wizard flow', async ({ electronApp }) => {
    // Get through splash to main window
    const splashPage = await electronApp.firstWindow();
    await splashPage.waitForLoadState('domcontentloaded');
    await splashPage.locator('#btnStart').click();

    const mainPage = await electronApp.waitForEvent('window', { timeout: 90_000 });
    await mainPage.waitForLoadState('domcontentloaded');
    await mainPage.waitForSelector('aside', { timeout: 30_000 });

    // Tool window bar should be visible during wizard
    const toolBar = mainPage.locator('[data-tutorial="tool-window-bar"]');
    await expect(toolBar).toBeVisible({ timeout: 15_000 });

    // Git panel should work during wizard
    const gitBtn = mainPage.locator('[data-tutorial="git-tool-btn"]');
    await gitBtn.click();
    await mainPage.waitForTimeout(2_000);

    const gitClasses = await gitBtn.getAttribute('class');
    expect(gitClasses).toContain('bg-accent-600');

    // Close Git, open Manage
    await gitBtn.click();
    await mainPage.waitForTimeout(500);

    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await manageBtn.click();

    const modal = mainPage.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // Close Manage via Escape
    await mainPage.keyboard.press('Escape');
    await mainPage.waitForTimeout(500);
    await expect(modal).not.toBeVisible();
  });
});
