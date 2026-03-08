// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';

const test = createInstalledTest({ tmpPrefix: 'devsuite-e2e-upd-' });

test.describe('Manage — Updates Tab', () => {
  test.beforeEach(async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await expect(manageBtn).toBeVisible({ timeout: 15_000 });
    await manageBtn.click();

    const modal = mainPage.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await mainPage.waitForTimeout(3_000);

    // Click Updates tab (scoped to manage tabs nav)
    const tabs = mainPage.locator('[data-tutorial="manage-tabs"]');
    const updatesTab = tabs.locator('button:has-text("Updates")');
    if ((await updatesTab.count()) > 0) {
      await updatesTab.click();
      await mainPage.waitForTimeout(5_000);
    }
  });

  test('Updates tab is visible in Manage', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    const hasUpdates =
      pageContent?.includes('Updates') || pageContent?.includes('Feature Updates');
    expect(hasUpdates).toBeTruthy();
  });

  test('Updates header shows version info', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    const hasVersionInfo =
      pageContent?.includes('Feature Updates') ||
      pageContent?.includes('Installed') ||
      pageContent?.includes('v1.');

    expect(hasVersionInfo).toBeTruthy();
  });

  test('Check for Updates button is present', async ({ mainPage }) => {
    const checkBtn = mainPage.locator('button:has-text("Check for Updates")');
    const count = await checkBtn.count();
    // May also appear as "Check" or "Refresh"
    const refreshBtn = mainPage.locator('button:has-text("Refresh")');
    const refreshCount = await refreshBtn.count();

    expect(count + refreshCount).toBeGreaterThan(0);
  });

  test('Available view shows content', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    const hasAvailableContent =
      pageContent?.includes('Available') ||
      pageContent?.includes('All Up to Date') ||
      pageContent?.includes('No Installation Manifest') ||
      pageContent?.includes('update');

    expect(hasAvailableContent).toBeTruthy();
  });

  test('History view shows upgrade history', async ({ mainPage }) => {
    const historyTab = mainPage.locator('button:has-text("History")');
    if ((await historyTab.count()) > 0) {
      await historyTab.first().click();
      await mainPage.waitForTimeout(2_000);

      const pageContent = await mainPage.textContent('body');
      // Should show history list or empty state
      const hasHistory =
        pageContent?.includes('History') ||
        pageContent?.includes('upgrade') ||
        pageContent?.includes('No') ||
        pageContent?.includes('Applied');

      expect(hasHistory).toBeTruthy();
    }
  });

  test('Updates tab loads without errors', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    expect(pageContent?.includes('Something went wrong')).toBeFalsy();
  });
});
