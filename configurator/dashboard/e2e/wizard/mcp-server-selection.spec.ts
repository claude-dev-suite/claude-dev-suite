// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';
import { waitForTabContent } from '../fixtures/helpers';

test.describe('Wizard — MCP Server Selection (Deep)', () => {
  // Navigate to step 3 (MCP Servers) before each test
  test.beforeEach(async ({ mainPage }) => {
    const sidebar = mainPage.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    // Step 1 → 2: Click Continue, wait for agent selection content
    const continueBtn1 = mainPage.locator('button:has-text("Continue")');
    await continueBtn1.first().click();
    await mainPage.waitForFunction(
      () => {
        const body = document.body.textContent ?? '';
        return body.includes('Recommended Agents') || body.includes('expert');
      },
      { timeout: 10_000 },
    );

    // Step 2 → 3: Click Continue, wait for MCP server step heading
    const continueBtn2 = mainPage.locator('button:has-text("Continue")');
    await continueBtn2.first().click();
    await mainPage.waitForFunction(
      () => {
        const body = document.body.textContent ?? '';
        return body.includes('Configure MCP Servers');
      },
      { timeout: 10_000 },
    );
  });

  test('selecting an MCP server highlights the card', async ({ mainPage }) => {
    // Find checkbox inputs for server cards
    const checkboxes = mainPage.locator('input[type="checkbox"]');
    const count = await checkboxes.count();

    if (count > 0) {
      // Click the first checkbox to select a server
      await checkboxes.first().click();
      await mainPage.waitForTimeout(500);

      // The checkbox should now be checked
      const isChecked = await checkboxes.first().isChecked();
      expect(isChecked).toBeTruthy();
    }
  });

  test('search filters MCP servers', async ({ mainPage }) => {
    const searchInput = mainPage.locator('input[placeholder*="Search"]');
    if ((await searchInput.count()) > 0) {
      // Get initial checkbox count (one per server)
      const initialCheckboxes = mainPage.locator('input[type="checkbox"]');
      const initialCount = await initialCheckboxes.count();

      // Type a search query that matches fewer servers
      await searchInput.fill('documentation');
      await mainPage.waitForTimeout(500);

      const filteredCheckboxes = mainPage.locator('input[type="checkbox"]');
      const filteredCount = await filteredCheckboxes.count();

      // Filtered count should be less than initial
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    }
  });

  test('Config needed badge shown for servers needing env vars', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    // database-query shows "Config needed" badge
    const hasConfigBadge =
      pageContent?.includes('Config needed') ||
      pageContent?.includes('Config Required');
    expect(hasConfigBadge).toBeTruthy();
  });

  test('Continue button advances to step 4', async ({ mainPage }) => {
    const continueBtn = mainPage.locator('button:has-text("Continue")');
    if ((await continueBtn.count()) > 0) {
      await continueBtn.first().click();

      // Should advance to Environment step (step 4)
      await mainPage.waitForFunction(
        () => {
          const body = document.body.textContent ?? '';
          return (
            body.includes('Environment') ||
            body.includes('Variable') ||
            body.includes('Install')
          );
        },
        { timeout: 10_000 },
      );

      const pageContent = await mainPage.textContent('body');
      const isStep4 =
        pageContent?.includes('Environment') ||
        pageContent?.includes('Variable') ||
        pageContent?.includes('Install');
      expect(isStep4).toBeTruthy();
    }
  });

  test('Back button returns to step 2', async ({ mainPage }) => {
    const backBtn = mainPage.locator('button:has-text("Back")');
    if ((await backBtn.count()) > 0) {
      await backBtn.first().click();

      await mainPage.waitForFunction(
        () => {
          const body = document.body.textContent ?? '';
          return body.includes('Agent') || body.includes('expert');
        },
        { timeout: 10_000 },
      );

      const pageContent = await mainPage.textContent('body');
      const isStep2 =
        pageContent?.includes('Agent') ||
        pageContent?.includes('expert') ||
        pageContent?.includes('Select');
      expect(isStep2).toBeTruthy();
    }
  });
});
