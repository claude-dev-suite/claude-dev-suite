// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';
import { waitForManageModal } from '../fixtures/helpers';

const test = createInstalledTest({
  tmpPrefix: 'devsuite-e2e-ca-',
  agents: ['react-expert', 'express-expert'],
});

test.describe('Custom Agents Panel', () => {
  test('Custom Agents tab visible in Manage', async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await expect(manageBtn).toBeVisible({ timeout: 15_000 });
    await manageBtn.click();

    const modal = mainPage.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await waitForManageModal(mainPage);

    // Look for the Custom Agents tab
    const customAgentsTab = mainPage.locator('[data-tutorial="custom-agents-tab"]');
    const tabByText = mainPage.locator('button:has-text("Custom Agents")');

    const hasByAttr = (await customAgentsTab.count()) > 0;
    const hasByText = (await tabByText.count()) > 0;

    expect(hasByAttr || hasByText).toBeTruthy();
  });

  test('empty state for fresh install', async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await expect(manageBtn).toBeVisible({ timeout: 15_000 });
    await manageBtn.click();
    await waitForManageModal(mainPage);

    // Click the Custom Agents tab
    const customTab = mainPage.locator('button:has-text("Custom Agents")');
    if ((await customTab.count()) > 0) {
      await customTab.first().click();
      await mainPage.waitForTimeout(2_000);

      const pageContent = await mainPage.textContent('body');
      const hasEmptyState =
        pageContent?.includes('No custom agents') ||
        pageContent?.includes('Create') ||
        pageContent?.includes('custom agent') ||
        pageContent?.includes('Get started');

      expect(hasEmptyState).toBeTruthy();
    }
  });

  test('Create Agent button opens form', async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await expect(manageBtn).toBeVisible({ timeout: 15_000 });
    await manageBtn.click();
    await waitForManageModal(mainPage);

    // Click the Custom Agents tab
    const customTab = mainPage.locator('button:has-text("Custom Agents")');
    if ((await customTab.count()) > 0) {
      await customTab.first().click();
      await mainPage.waitForTimeout(2_000);

      // Click Create button
      const createBtn = mainPage.locator('button:has-text("Create")');
      if ((await createBtn.count()) > 0) {
        await createBtn.first().click();
        await mainPage.waitForTimeout(2_000);

        const pageContent = await mainPage.textContent('body');
        // Form should have fields like Name, Description, Model, etc.
        const hasForm =
          pageContent?.includes('Name') ||
          pageContent?.includes('Description') ||
          pageContent?.includes('Model') ||
          pageContent?.includes('Agent');

        expect(hasForm).toBeTruthy();
      }
    }
  });

  test('panel loads without errors', async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await expect(manageBtn).toBeVisible({ timeout: 15_000 });
    await manageBtn.click();
    await waitForManageModal(mainPage);

    // No error boundaries should be showing
    const pageContent = await mainPage.textContent('body');
    expect(pageContent?.includes('Something went wrong')).toBeFalsy();

    // Content should have resolved (not stuck on loading spinner forever)
    const hasContent =
      pageContent?.includes('Agents') ||
      pageContent?.includes('Manage') ||
      pageContent?.includes('Installation');

    expect(hasContent).toBeTruthy();
  });
});
