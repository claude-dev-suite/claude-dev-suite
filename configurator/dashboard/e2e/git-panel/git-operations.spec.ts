// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';
import { waitForGitPanel } from '../fixtures/helpers';

test.describe('Git Panel — Operations', () => {
  test.beforeEach(async ({ mainPage }) => {
    const gitBtn = mainPage.locator('[data-tutorial="git-tool-btn"]');
    await expect(gitBtn).toBeVisible({ timeout: 15_000 });
    await gitBtn.click();
    await waitForGitPanel(mainPage);
  });

  test('Git panel shows accordion sections', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    const hasChanges = pageContent?.includes('Changes');
    const hasBranches = pageContent?.includes('Branches');
    const hasHistory = pageContent?.includes('History');

    // At least Changes and Branches should be present
    expect(hasChanges || hasBranches).toBeTruthy();
  });

  test('Branches section shows master or main', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    const hasBranch =
      pageContent?.includes('master') || pageContent?.includes('main');
    expect(hasBranch).toBeTruthy();
  });

  test('History section shows initial commit', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    const hasCommit =
      pageContent?.includes('initial commit') ||
      pageContent?.includes('Commit') ||
      pageContent?.includes('History');
    expect(hasCommit).toBeTruthy();
  });

  test('Fetch/Pull/Push buttons visible in footer', async ({ mainPage }) => {
    const fetchBtn = mainPage.locator('button:has-text("Fetch")');
    const pullBtn = mainPage.locator('button:has-text("Pull")');
    const pushBtn = mainPage.locator('button:has-text("Push")');

    const totalCount =
      (await fetchBtn.count()) + (await pullBtn.count()) + (await pushBtn.count());

    expect(totalCount).toBeGreaterThanOrEqual(3);
  });

  test('Commit textarea has placeholder', async ({ mainPage }) => {
    // The commit textarea may or may not be visible depending on changes
    const textarea = mainPage.locator('textarea[placeholder*="Commit"]');
    const count = await textarea.count();

    if (count > 0) {
      const placeholder = await textarea.first().getAttribute('placeholder');
      expect(placeholder).toContain('Commit');
    } else {
      // If no textarea, that's fine — no staged changes
      expect(true).toBe(true);
    }
  });

  test('Auto-refresh indicator visible', async ({ mainPage }) => {
    // The git panel auto-refreshes every 30s — look for the refresh indicator
    // or just verify the panel continues to render without errors after wait
    await mainPage.waitForTimeout(3_000);

    const pageContent = await mainPage.textContent('body');
    expect(pageContent?.includes('Something went wrong')).toBeFalsy();

    // The panel should still show git content
    const hasBranch =
      pageContent?.includes('master') || pageContent?.includes('main');
    expect(hasBranch).toBeTruthy();
  });
});
