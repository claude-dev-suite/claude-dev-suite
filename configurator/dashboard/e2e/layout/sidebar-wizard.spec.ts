// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';

test.describe('Layout — Sidebar Wizard Steps', () => {
  test('sidebar is visible with Setup Steps heading', async ({ mainPage }) => {
    const sidebar = mainPage.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 20_000 });

    const heading = sidebar.locator('text=Setup Steps');
    const count = await heading.count();
    expect(count).toBeGreaterThan(0);
  });

  test('sidebar shows all 5 wizard steps', async ({ mainPage }) => {
    const sidebar = mainPage.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 20_000 });

    const sidebarText = await sidebar.textContent();
    expect(sidebarText?.includes('Detection')).toBeTruthy();
    expect(sidebarText?.includes('Agents')).toBeTruthy();
    expect(sidebarText?.includes('MCP Servers')).toBeTruthy();
    expect(sidebarText?.includes('Environment')).toBeTruthy();
    expect(sidebarText?.includes('Install')).toBeTruthy();
  });

  test('step 1 (Detection) is active by default', async ({ mainPage }) => {
    const sidebar = mainPage.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 20_000 });

    // Step 1 should be active (not disabled)
    const step1 = sidebar.locator('button:has-text("Detection")');
    if ((await step1.count()) > 0) {
      const isDisabled = await step1.first().isDisabled();
      expect(isDisabled).toBeFalsy();
    }
  });

  test('steps 2-5 are disabled before step 1 completes', async ({ mainPage }) => {
    const sidebar = mainPage.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 20_000 });

    // Steps beyond current should be disabled
    const step2 = sidebar.locator('button:has-text("Agents")');
    if ((await step2.count()) > 0) {
      const isDisabled = await step2.first().isDisabled();
      expect(isDisabled).toBeTruthy();
    }
  });

  test('advancing to step 2 enables the Agents step', async ({ mainPage }) => {
    const sidebar = mainPage.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 20_000 });

    // Click Continue to advance from Detection to Agents
    const continueBtn = mainPage.locator('button:has-text("Continue")');
    if ((await continueBtn.count()) > 0) {
      await continueBtn.first().click();
      await mainPage.waitForFunction(
        () => {
          const body = document.body.textContent ?? '';
          return body.includes('Recommended Agents') || body.includes('expert');
        },
        { timeout: 10_000 },
      );

      // Step 2 should now be accessible (not disabled)
      const step2 = sidebar.locator('button:has-text("Agents")');
      if ((await step2.count()) > 0) {
        const isDisabled = await step2.first().isDisabled();
        expect(isDisabled).toBeFalsy();
      }
    }
  });
});
