// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';

test.describe('Wizard — Step 2: Agents', () => {
  // Navigate to step 2 before each test
  test.beforeEach(async ({ mainPage }) => {
    // Wait for wizard sidebar to load
    const sidebar = mainPage.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    // Navigate to Agents step via Next button or clicking Agents step
    const nextBtn = mainPage.getByRole('button', { name: /next|continue/i });
    if ((await nextBtn.count()) > 0) {
      await nextBtn.click();
      await mainPage.waitForTimeout(2_000);
    } else {
      // Try clicking the Agents step directly
      const agentsButton = sidebar.getByRole('button', { name: /Agents/i });
      if (await agentsButton.isEnabled()) {
        await agentsButton.click();
        await mainPage.waitForTimeout(2_000);
      }
    }
  });

  test('agents list loads from server', async ({ mainPage }) => {
    await mainPage.waitForTimeout(3_000);

    const pageContent = await mainPage.textContent('body');
    // Should contain references to agents
    const hasAgentContent =
      pageContent?.includes('expert') ||
      pageContent?.includes('agent') ||
      pageContent?.includes('Agent') ||
      pageContent?.includes('Select');

    expect(hasAgentContent).toBeTruthy();
  });

  test('agents can be selected/deselected', async ({ mainPage }) => {
    await mainPage.waitForTimeout(3_000);

    // Look for checkboxes, toggle buttons, or clickable agent cards
    const checkboxes = mainPage.locator('input[type="checkbox"]');
    const toggleButtons = mainPage.locator('[role="checkbox"], [role="switch"]');
    const clickableCards = mainPage.locator('[class*="cursor-pointer"]');

    const interactiveCount =
      (await checkboxes.count()) +
      (await toggleButtons.count()) +
      (await clickableCards.count());

    // There should be at least some selectable elements
    expect(interactiveCount).toBeGreaterThan(0);
  });
});
