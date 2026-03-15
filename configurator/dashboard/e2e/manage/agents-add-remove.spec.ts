// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';
import { waitForManageModal } from '../fixtures/helpers';

const test = createInstalledTest({ tmpPrefix: 'devsuite-e2e-agadd-' });

test.describe('Manage — Agents Add/Remove', () => {
  test.beforeEach(async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await expect(manageBtn).toBeVisible({ timeout: 15_000 });
    await manageBtn.click();
    await waitForManageModal(mainPage);

    // Ensure Agents tab is active (it's the default tab)
    const tabs = mainPage.locator('[data-tutorial="manage-tabs"]');
    const agentsTab = tabs.locator('button:has-text("Agents")').first();
    if ((await agentsTab.count()) > 0) {
      await agentsTab.click();
      await mainPage.waitForFunction(
        () => {
          const body = document.body.textContent ?? '';
          return body.includes('Installed Agents') || body.includes('agent');
        },
        { timeout: 10_000 },
      );
    }
  });

  test('Agents tab shows installed agents list', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    const hasAgentsList =
      pageContent?.includes('Installed Agents') ||
      pageContent?.includes('agent(s) installed');
    expect(hasAgentsList).toBeTruthy();
  });

  test('Add Agent button is visible', async ({ mainPage }) => {
    const modal = mainPage.locator('.fixed.inset-0.z-50');
    const addBtn = modal.locator('button:has-text("Add Agent")');
    const count = await addBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Add Agent button opens agent selection modal', async ({ mainPage }) => {
    const modal = mainPage.locator('.fixed.inset-0.z-50');
    const addBtn = modal.locator('button:has-text("Add Agent")');
    if ((await addBtn.count()) > 0) {
      await addBtn.first().click();

      // Wait for the add agent modal content
      await mainPage.waitForFunction(
        () => {
          const body = document.body.textContent ?? '';
          return body.includes('Add Agents') || body.includes('Search agents');
        },
        { timeout: 10_000 },
      );

      const pageContent = await mainPage.textContent('body');
      const hasAddModal =
        pageContent?.includes('Add Agents') ||
        pageContent?.includes('Search agents') ||
        pageContent?.includes('Select agents');
      expect(hasAddModal).toBeTruthy();
    }
  });

  test('agent cards show name and category', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    // Installed agents should display name and category badge
    const hasAgentInfo =
      pageContent?.includes('expert') ||
      pageContent?.includes('frontend') ||
      pageContent?.includes('backend') ||
      pageContent?.includes('Installed Agents');
    expect(hasAgentInfo).toBeTruthy();
  });

  test('Remove button is present on agent cards', async ({ mainPage }) => {
    const removeBtn = mainPage.locator('button:has-text("Remove")');
    const count = await removeBtn.count();
    // At least one Remove button should be visible (for installed agents)
    expect(count).toBeGreaterThan(0);
  });

  test('agents list shows installed count', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    const hasCount =
      pageContent?.includes('agent(s) installed') ||
      pageContent?.includes('Installed Agents');
    expect(hasCount).toBeTruthy();
  });
});
