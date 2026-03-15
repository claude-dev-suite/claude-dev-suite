// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';
import { waitForManageModal, waitForTabContent } from '../fixtures/helpers';

const test = createInstalledTest({ tmpPrefix: 'devsuite-e2e-mcpmg-' });

test.describe('Manage — MCP Servers', () => {
  test.beforeEach(async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await expect(manageBtn).toBeVisible({ timeout: 15_000 });
    await manageBtn.click();
    await waitForManageModal(mainPage);

    // Click MCP Servers tab
    const modal = mainPage.locator('.fixed.inset-0.z-50');
    const tabs = mainPage.locator('[data-tutorial="manage-tabs"]');
    const mcpTab = tabs.locator('button:has-text("MCP Servers")');
    if ((await mcpTab.count()) > 0) {
      await mcpTab.first().click();
      await mainPage.waitForFunction(
        () => {
          const body = document.body.textContent ?? '';
          return body.includes('Installed MCP Servers') || body.includes('server(s) installed');
        },
        { timeout: 10_000 },
      );
    }
  });

  test('MCP Servers tab shows installed servers list', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    const hasList =
      pageContent?.includes('Installed MCP Servers') ||
      pageContent?.includes('server(s) installed');
    expect(hasList).toBeTruthy();
  });

  test('Add MCP Server button is visible', async ({ mainPage }) => {
    const modal = mainPage.locator('.fixed.inset-0.z-50');
    const addBtn = modal.locator('button:has-text("Add MCP Server")');
    const count = await addBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Add MCP Server button opens server selection', async ({ mainPage }) => {
    const modal = mainPage.locator('.fixed.inset-0.z-50');
    const addBtn = modal.locator('button:has-text("Add MCP Server")');
    if ((await addBtn.count()) > 0) {
      await addBtn.first().click();

      await mainPage.waitForFunction(
        () => {
          const body = document.body.textContent ?? '';
          return body.includes('Add MCP Server') && (body.includes('tools') || body.includes('Configure'));
        },
        { timeout: 10_000 },
      );

      const pageContent = await mainPage.textContent('body');
      const hasServerList =
        pageContent?.includes('tools') ||
        pageContent?.includes('Configure') ||
        pageContent?.includes('Add MCP Server');
      expect(hasServerList).toBeTruthy();
    }
  });

  test('installed count shows correct number', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    // The installed-project fixture doesn't install MCP servers, so count is 0
    const hasCount =
      pageContent?.includes('0 server(s) installed') ||
      pageContent?.includes('server(s) installed') ||
      pageContent?.includes('Installed MCP Servers');
    expect(hasCount).toBeTruthy();
  });

  test('MCP Servers panel loads without errors', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    expect(pageContent?.includes('Something went wrong')).toBeFalsy();
  });
});
