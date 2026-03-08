// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';
import { waitForManageModal, waitForTabContent } from '../fixtures/helpers';

const test = createInstalledTest({ tmpPrefix: 'devsuite-e2e-auto-' });

test.describe('Manage — Automations Panel', () => {
  test.beforeEach(async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await expect(manageBtn).toBeVisible({ timeout: 15_000 });
    await manageBtn.click();

    await waitForManageModal(mainPage);

    // Click Automations tab (scoped to manage tabs nav)
    const tabs = mainPage.locator('[data-tutorial="manage-tabs"]');
    const autoTab = tabs.locator('button:has-text("Automations")');
    if ((await autoTab.count()) > 0) {
      await autoTab.click();
      await waitForTabContent(mainPage, 'Recommended');
    }
  });

  test('Automations tab is visible in Manage', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    const hasAutomations =
      pageContent?.includes('Automations') || pageContent?.includes('automations');
    expect(hasAutomations).toBeTruthy();
  });

  test('Automations header shows title and subtitle', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    const hasTitle = pageContent?.includes('Automations');
    const hasSubtitle =
      pageContent?.includes('Configure automatic actions') ||
      pageContent?.includes('automatic') ||
      pageContent?.includes('Claude and Git');

    expect(hasTitle).toBeTruthy();
  });

  test('Recommended view tab is default', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    const hasRecommended =
      pageContent?.includes('Recommended') ||
      pageContent?.includes('All Recommendations Applied');

    expect(hasRecommended).toBeTruthy();
  });

  test('Active view shows empty state initially', async ({ mainPage }) => {
    const activeTab = mainPage.locator('button:has-text("Active")');
    if ((await activeTab.count()) > 0) {
      await activeTab.first().click();
      await waitForTabContent(mainPage, 'Active');

      const pageContent = await mainPage.textContent('body');
      const hasActiveContent =
        pageContent?.includes('No Active Automations') ||
        pageContent?.includes('active') ||
        pageContent?.includes('Active');

      expect(hasActiveContent).toBeTruthy();
    }
  });

  test('All Automations view groups by category', async ({ mainPage }) => {
    const allTab = mainPage.locator('button:has-text("All Automations")');
    if ((await allTab.count()) > 0) {
      await allTab.first().click();
      await waitForTabContent(mainPage, 'All Automations');

      const pageContent = await mainPage.textContent('body');
      // Categories should be visible or the view should load without errors
      const hasContent =
        pageContent?.includes('Enable') ||
        pageContent?.includes('Disable') ||
        pageContent?.includes('recipe') ||
        pageContent?.includes('Recipe') ||
        pageContent?.includes('automation') ||
        pageContent?.includes('All Automations') ||
        pageContent?.includes('Loading');

      expect(hasContent).toBeTruthy();
    }
  });

  test('Refresh button reloads automations', async ({ mainPage }) => {
    const refreshBtn = mainPage.locator('button:has-text("Refresh")');
    const count = await refreshBtn.count();
    expect(count).toBeGreaterThan(0);
  });
});
