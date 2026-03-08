// SPDX-License-Identifier: MIT
import { test as base, expect } from '../fixtures/electron-app.fixture';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

/**
 * Install execution tests need a fresh project per test because
 * each test runs the actual installation, which mutates the project dir.
 */
const test = base.extend({
  testProjectDir: async ({}, use) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devsuite-e2e-install-'));

    execSync('git init', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.email "e2e@test.local"', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.name "E2E Test"', { cwd: dir, stdio: 'pipe' });

    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify(
        {
          name: 'e2e-install-test',
          version: '1.0.0',
          dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0', express: '^5.0.0' },
          devDependencies: { typescript: '^5.0.0', vitest: '^4.0.0' },
        },
        null,
        2,
      ),
    );

    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const hello = "world";\n');
    fs.writeFileSync(
      path.join(dir, 'src', 'App.tsx'),
      'export function App() { return <div>Hello</div>; }\n',
    );

    execSync('git add -A', { cwd: dir, stdio: 'pipe' });
    execSync('git commit -m "initial commit"', { cwd: dir, stdio: 'pipe' });

    await use(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  },
});

test.describe('Wizard — Install Execution', () => {
  // Navigate to step 5 (Detection -> Agents -> MCP Servers -> Environment -> Install)
  test.beforeEach(async ({ mainPage }) => {
    const sidebar = mainPage.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    // Advance through steps 1-4, waiting for Continue to be enabled each time
    for (let i = 0; i < 4; i++) {
      const continueBtn = mainPage.locator('button:has-text("Continue"):not([disabled])');
      await continueBtn.first().waitFor({ state: 'visible', timeout: 30_000 });
      await continueBtn.first().click();
      await mainPage.waitForTimeout(2_000);
    }
  });

  test('Start Installation button triggers install', async ({ mainPage }) => {
    await mainPage.waitForTimeout(3_000);

    const installBtn = mainPage.locator('button:has-text("Start Installation")');
    await expect(installBtn).toBeVisible({ timeout: 10_000 });
    await installBtn.click();

    // Button should become disabled or change text after clicking
    await mainPage.waitForTimeout(2_000);
    const isDisabled = await installBtn.isDisabled().catch(() => true);
    const btnText = await installBtn.textContent().catch(() => '');
    // Either disabled or text changed (e.g., "Installing...")
    expect(isDisabled || btnText !== 'Start Installation').toBeTruthy();
  });

  test('progress steps transition through states', async ({ mainPage }) => {
    await mainPage.waitForTimeout(3_000);

    const installBtn = mainPage.locator('button:has-text("Start Installation")');
    await expect(installBtn).toBeVisible({ timeout: 10_000 });
    await installBtn.click();

    // Wait for progress — look for green checkmarks or completion indicators
    await mainPage.waitForTimeout(10_000);

    const pageContent = await mainPage.textContent('body');
    const hasProgress =
      pageContent?.includes('✓') ||
      pageContent?.includes('Complete') ||
      pageContent?.includes('complete') ||
      pageContent?.includes('Installing') ||
      pageContent?.includes('Preparing');

    expect(hasProgress).toBeTruthy();
  });

  test('installation creates .dev-suite.json', async ({ mainPage, testProjectDir }) => {
    await mainPage.waitForTimeout(3_000);

    const installBtn = mainPage.locator('button:has-text("Start Installation")');
    await expect(installBtn).toBeVisible({ timeout: 10_000 });
    await installBtn.click();

    // Wait for installation to complete (generous timeout)
    await mainPage.waitForTimeout(30_000);

    const configPath = path.join(testProjectDir, '.dev-suite.json');
    expect(fs.existsSync(configPath)).toBe(true);
  });

  test('installation creates CLAUDE.md and agents', async ({ mainPage, testProjectDir }) => {
    await mainPage.waitForTimeout(3_000);

    const installBtn = mainPage.locator('button:has-text("Start Installation")');
    await expect(installBtn).toBeVisible({ timeout: 10_000 });
    await installBtn.click();

    // Wait for installation to complete
    await mainPage.waitForTimeout(30_000);

    const claudeMdPath = path.join(testProjectDir, 'CLAUDE.md');
    expect(fs.existsSync(claudeMdPath)).toBe(true);

    const agentsDir = path.join(testProjectDir, '.claude', 'agents');
    if (fs.existsSync(agentsDir)) {
      const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
      expect(agentFiles.length).toBeGreaterThan(0);
    }
  });

  test('Go to Management button appears', async ({ mainPage }) => {
    await mainPage.waitForTimeout(3_000);

    const installBtn = mainPage.locator('button:has-text("Start Installation")');
    await expect(installBtn).toBeVisible({ timeout: 10_000 });
    await installBtn.click();

    // Wait for installation to complete and success message
    const goToMgmt = mainPage.locator('button:has-text("Go to Management")');
    await expect(goToMgmt).toBeVisible({ timeout: 60_000 });
  });
});
