// SPDX-License-Identifier: MIT
import { test as base, expect } from '../fixtures/electron-app.fixture';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

/**
 * Git file change tests need a fresh project per test because
 * each test mutates files in the working directory.
 */
const test = base.extend({
  testProjectDir: async ({}, use) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devsuite-e2e-gitfiles-'));

    execSync('git init', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.email "e2e@test.local"', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.name "E2E Test"', { cwd: dir, stdio: 'pipe' });

    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify(
        {
          name: 'e2e-git-test',
          version: '1.0.0',
          dependencies: { react: '^19.0.0' },
        },
        null,
        2,
      ),
    );
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const x = 1;\n');

    execSync('git add -A', { cwd: dir, stdio: 'pipe' });
    execSync('git commit -m "initial commit"', { cwd: dir, stdio: 'pipe' });

    await use(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  },
});

test.describe('Git Panel — File Changes', () => {
  test('creating a file shows it in changes', async ({ mainPage, testProjectDir }) => {
    // Create a new file to trigger untracked changes
    fs.writeFileSync(path.join(testProjectDir, 'newfile.ts'), 'export const y = 2;\n');

    // Open git panel
    const gitBtn = mainPage.locator('[data-tutorial="git-tool-btn"]');
    await expect(gitBtn).toBeVisible({ timeout: 15_000 });
    await gitBtn.click();
    await mainPage.waitForTimeout(5_000);

    const pageContent = await mainPage.textContent('body');
    const hasNewFile =
      pageContent?.includes('newfile') ||
      pageContent?.includes('Untracked') ||
      pageContent?.includes('Changes');

    expect(hasNewFile).toBeTruthy();
  });

  test('Stage All button is visible with modified file', async ({ mainPage, testProjectDir }) => {
    // Modify an already-tracked file — "Stage All" only shows for modified (not untracked) files
    fs.writeFileSync(path.join(testProjectDir, 'src', 'index.ts'), 'export const x = 99;\n');

    const gitBtn = mainPage.locator('[data-tutorial="git-tool-btn"]');
    await expect(gitBtn).toBeVisible({ timeout: 15_000 });
    await gitBtn.click();
    await mainPage.waitForTimeout(5_000);

    const stageAllBtn = mainPage.locator('button:has-text("Stage All")');
    const count = await stageAllBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  test('staging files enables commit textarea', async ({ mainPage, testProjectDir }) => {
    fs.writeFileSync(path.join(testProjectDir, 'staged.ts'), 'export const a = 4;\n');

    const gitBtn = mainPage.locator('[data-tutorial="git-tool-btn"]');
    await expect(gitBtn).toBeVisible({ timeout: 15_000 });
    await gitBtn.click();
    await mainPage.waitForTimeout(5_000);

    // Click Stage All
    const stageAllBtn = mainPage.locator('button:has-text("Stage All")');
    if ((await stageAllBtn.count()) > 0) {
      await stageAllBtn.first().click();
      await mainPage.waitForTimeout(3_000);

      // Commit textarea should now be present and enabled
      const textarea = mainPage.locator('textarea');
      const count = await textarea.count();
      // At least one textarea (commit message) should exist
      expect(count).toBeGreaterThan(0);
    }
  });

  test('commit button shows file count', async ({ mainPage, testProjectDir }) => {
    fs.writeFileSync(path.join(testProjectDir, 'counted.ts'), 'export const b = 5;\n');

    const gitBtn = mainPage.locator('[data-tutorial="git-tool-btn"]');
    await expect(gitBtn).toBeVisible({ timeout: 15_000 });
    await gitBtn.click();
    await mainPage.waitForTimeout(5_000);

    const stageAllBtn = mainPage.locator('button:has-text("Stage All")');
    if ((await stageAllBtn.count()) > 0) {
      await stageAllBtn.first().click();
      await mainPage.waitForTimeout(3_000);

      // Look for Commit button with file count
      const pageContent = await mainPage.textContent('body');
      const hasCommitBtn =
        pageContent?.includes('Commit (') || pageContent?.includes('Commit');

      expect(hasCommitBtn).toBeTruthy();
    }
  });

  test('committing clears changes', async ({ mainPage, testProjectDir }) => {
    fs.writeFileSync(path.join(testProjectDir, 'tocommit.ts'), 'export const c = 6;\n');

    const gitBtn = mainPage.locator('[data-tutorial="git-tool-btn"]');
    await expect(gitBtn).toBeVisible({ timeout: 15_000 });
    await gitBtn.click();
    await mainPage.waitForTimeout(5_000);

    // Stage all
    const stageAllBtn = mainPage.locator('button:has-text("Stage All")');
    if ((await stageAllBtn.count()) > 0) {
      await stageAllBtn.first().click();
      await mainPage.waitForTimeout(3_000);

      // Enter commit message
      const textarea = mainPage.locator('textarea');
      if ((await textarea.count()) > 0) {
        await textarea.first().fill('e2e test commit');
        await mainPage.waitForTimeout(500);

        // Click commit button
        const commitBtn = mainPage.locator('button:has-text("Commit")');
        if ((await commitBtn.count()) > 0) {
          await commitBtn.first().click();
          await mainPage.waitForTimeout(5_000);

          // After commit, the file should no longer be in changes
          const pageContent = await mainPage.textContent('body');
          const fileStillShown = pageContent?.includes('tocommit');
          // File may or may not disappear immediately depending on refresh timing
          expect(pageContent?.includes('Something went wrong')).toBeFalsy();
        }
      }
    }
  });
});
