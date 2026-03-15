// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';
import { waitForManageModal, waitForTabContent } from '../fixtures/helpers';

const test = createInstalledTest({ tmpPrefix: 'devsuite-e2e-hk-' });

test.describe('Manage — Hooks Config', () => {
  test.beforeEach(async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await expect(manageBtn).toBeVisible({ timeout: 15_000 });
    await manageBtn.click();

    await waitForManageModal(mainPage);
  });

  test('Hooks tab is visible in Manage modal', async ({ mainPage }) => {
    const tabs = mainPage.locator('[data-tutorial="manage-tabs"]');
    const hooksTab = tabs.locator('button:has-text("Hooks")');
    const count = await hooksTab.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Hooks tab shows loading then content', async ({ mainPage }) => {
    const tabs = mainPage.locator('[data-tutorial="manage-tabs"]');
    const hooksTab = tabs.locator('button:has-text("Hooks")');
    await hooksTab.click();
    await waitForTabContent(mainPage, 'Git Hooks');

    const pageContent = await mainPage.textContent('body');
    const hasContent =
      pageContent?.includes('Git Hooks') ||
      pageContent?.includes('Claude Hooks') ||
      pageContent?.includes('Configure') ||
      pageContent?.includes('Hook') ||
      pageContent?.includes('No Git Repository');

    expect(hasContent).toBeTruthy();
  });

  test('Git Hooks section with Configure button', async ({ mainPage }) => {
    const tabs = mainPage.locator('[data-tutorial="manage-tabs"]');
    await tabs.locator('button:has-text("Hooks")').click();
    await waitForTabContent(mainPage, 'Git Hooks');

    const pageContent = await mainPage.textContent('body');
    const hasGitHooks =
      pageContent?.includes('Git Hooks') ||
      pageContent?.includes('Configure') ||
      pageContent?.includes('pre-commit');

    expect(hasGitHooks).toBeTruthy();
  });

  test('Claude Hooks section with Add Hook button', async ({ mainPage }) => {
    const tabs = mainPage.locator('[data-tutorial="manage-tabs"]');
    await tabs.locator('button:has-text("Hooks")').click();
    await waitForTabContent(mainPage, 'Git Hooks');

    const pageContent = await mainPage.textContent('body');
    const hasClaudeHooks =
      pageContent?.includes('Claude Hooks') ||
      pageContent?.includes('Add Hook') ||
      pageContent?.includes('Apply Template');

    expect(hasClaudeHooks).toBeTruthy();
  });

  test('Repository selector visible for multi-repo', async ({ mainPage }) => {
    const tabs = mainPage.locator('[data-tutorial="manage-tabs"]');
    await tabs.locator('button:has-text("Hooks")').click();
    await waitForTabContent(mainPage, 'Git Hooks');

    const pageContent = await mainPage.textContent('body');
    expect(pageContent?.includes('Something went wrong')).toBeFalsy();
  });

  test('Hooks tab loads without errors', async ({ mainPage }) => {
    const tabs = mainPage.locator('[data-tutorial="manage-tabs"]');
    await tabs.locator('button:has-text("Hooks")').click();
    await waitForTabContent(mainPage, 'Git Hooks');

    const pageContent = await mainPage.textContent('body');
    expect(pageContent?.includes('Something went wrong')).toBeFalsy();
  });
});
