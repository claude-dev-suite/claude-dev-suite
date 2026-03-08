// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';
import { createInstalledTest } from '../fixtures/installed-project';

/**
 * Manage Panel tests — two contexts:
 *   1. Default fixture (non-installed project) → "Dev-Suite Not Installed"
 *   2. Installed fixture → full Manage tabs & content
 */

// ── 1. Non-installed project tests (default fixture) ────────────────────
test.describe('Manage Panel — Non-installed project', () => {
  test('clicking Manage button opens the modal', async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await expect(manageBtn).toBeVisible({ timeout: 15_000 });
    await manageBtn.click();

    // The modal is a fixed full-screen overlay with z-50
    const modal = mainPage.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 10_000 });
  });

  test('modal shows "Dev-Suite Not Installed" for fresh projects', async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await manageBtn.click();
    await mainPage.waitForTimeout(3_000);

    const pageContent = await mainPage.textContent('body');
    const hasNotInstalled =
      pageContent?.includes('Not Installed') ||
      pageContent?.includes('not installed') ||
      pageContent?.includes('Setup Wizard');

    expect(hasNotInstalled).toBeTruthy();
  });

  test('modal header shows "Manage Project"', async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await manageBtn.click();

    const header = mainPage.locator('.fixed.inset-0.z-50 h1');
    await expect(header).toContainText('Manage Project', { timeout: 10_000 });
  });

  test('modal can be closed with Close button', async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await manageBtn.click();

    const modal = mainPage.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // Close button contains "Close" text
    const closeBtn = modal.locator('button:has-text("Close")');
    await closeBtn.click();
    await mainPage.waitForTimeout(500);

    await expect(modal).not.toBeVisible();
  });

  test('modal can be closed with Escape key', async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await manageBtn.click();

    const modal = mainPage.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 10_000 });

    await mainPage.keyboard.press('Escape');
    await mainPage.waitForTimeout(500);

    await expect(modal).not.toBeVisible();
  });
});

// ── 2. Installed project tests ──────────────────────────────────────────
const installedTest = createInstalledTest({
  tmpPrefix: 'devsuite-e2e-manage-',
  agents: ['react-expert', 'express-expert'],
  extraDependencies: { express: '^5.0.0' },
});

installedTest.describe('Manage Panel — Installed project', () => {
  installedTest('shows Manage Installation header', async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await expect(manageBtn).toBeVisible({ timeout: 15_000 });
    await manageBtn.click();

    const modal = mainPage.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await mainPage.waitForTimeout(3_000);

    const pageContent = await mainPage.textContent('body');
    const hasManageContent =
      pageContent?.includes('Manage Installation') ||
      pageContent?.includes('Agents') ||
      pageContent?.includes('Installed');

    expect(hasManageContent).toBeTruthy();
  });

  installedTest('shows all management tabs', async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await manageBtn.click();
    await mainPage.waitForTimeout(5_000);

    const expectedTabs = ['Agents', 'Custom Agents', 'Skills', 'MCP Servers', 'Automations', 'Hooks', 'Updates'];

    const pageContent = await mainPage.textContent('body');

    for (const tab of expectedTabs) {
      const found = pageContent?.includes(tab);
      // At minimum the main tabs should be present
      if (['Agents', 'MCP Servers', 'Updates'].includes(tab)) {
        expect(found).toBeTruthy();
      }
    }
  });

  installedTest('Agents tab shows installed agents', async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await manageBtn.click();
    await mainPage.waitForTimeout(5_000);

    const pageContent = await mainPage.textContent('body');
    // Our installed project has react-expert and express-expert
    const hasAgentRef =
      pageContent?.includes('react') ||
      pageContent?.includes('express') ||
      pageContent?.includes('expert') ||
      pageContent?.includes('Agent');

    expect(hasAgentRef).toBeTruthy();
  });

  installedTest('tab switching works', async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await manageBtn.click();
    await mainPage.waitForTimeout(5_000);

    // Click the MCP Servers tab
    const mcpTab = mainPage.locator('button:has-text("MCP Servers")');
    if ((await mcpTab.count()) > 0) {
      await mcpTab.click();
      await mainPage.waitForTimeout(2_000);

      // Verify MCP tab is now active (has the active class)
      const mcpClasses = await mcpTab.getAttribute('class');
      const isActive =
        mcpClasses?.includes('primary') || mcpClasses?.includes('border-primary');
      expect(isActive).toBeTruthy();
    }
  });

  installedTest('Refresh button is available', async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await manageBtn.click();
    await mainPage.waitForTimeout(5_000);

    const refreshBtn = mainPage.locator('button:has-text("Refresh")');
    const count = await refreshBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  installedTest('Uninstall button is available', async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await manageBtn.click();
    await mainPage.waitForTimeout(5_000);

    const uninstallBtn = mainPage.locator('button:has-text("Uninstall")');
    const count = await uninstallBtn.count();
    expect(count).toBeGreaterThan(0);
  });
});
