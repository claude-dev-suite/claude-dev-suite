// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';
import { waitForManageModal } from '../fixtures/helpers';

const test = createInstalledTest({ tmpPrefix: 'devsuite-e2e-uninst-' });

test.describe('Manage — Uninstall Flow', () => {
  test.beforeEach(async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await expect(manageBtn).toBeVisible({ timeout: 15_000 });
    await manageBtn.click();
    await waitForManageModal(mainPage);
  });

  test('Uninstall button is visible in Manage header', async ({ mainPage }) => {
    const modal = mainPage.locator('.fixed.inset-0.z-50');
    const uninstallBtn = modal.locator('button:has-text("Uninstall")');
    const count = await uninstallBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Uninstall button has danger styling', async ({ mainPage }) => {
    const modal = mainPage.locator('.fixed.inset-0.z-50');
    const uninstallBtn = modal.locator('button:has-text("Uninstall")');
    if ((await uninstallBtn.count()) > 0) {
      const classes = await uninstallBtn.first().getAttribute('class');
      // Danger buttons have red styling
      const hasDangerStyle =
        classes?.includes('red') ||
        classes?.includes('danger') ||
        classes?.includes('bg-red');
      expect(hasDangerStyle).toBeTruthy();
    }
  });

  test('Refresh button is visible alongside Uninstall', async ({ mainPage }) => {
    const modal = mainPage.locator('.fixed.inset-0.z-50');
    const refreshBtn = modal.locator('button:has-text("Refresh")');
    const count = await refreshBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Manage modal shows project path', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    const hasPath =
      pageContent?.includes('Installed at:') ||
      pageContent?.includes('devsuite-e2e-uninst-');
    expect(hasPath).toBeTruthy();
  });

  test('Close button and Esc hint are visible', async ({ mainPage }) => {
    const modal = mainPage.locator('.fixed.inset-0.z-50');
    const closeBtn = modal.locator('button:has-text("Close")');
    const count = await closeBtn.count();
    expect(count).toBeGreaterThan(0);

    // Esc shortcut hint should be shown
    const pageContent = await modal.textContent();
    expect(pageContent?.includes('Esc')).toBeTruthy();
  });
});
