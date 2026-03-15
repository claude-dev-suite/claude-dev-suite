// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';

test.describe('Wizard — Step 3: MCP Servers', () => {
  // Navigate to step 3 before each test (Detection → Agents → MCP Servers)
  test.beforeEach(async ({ mainPage }) => {
    const sidebar = mainPage.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    // Advance through steps 1 and 2 using the actual <button> Continue element
    // (avoid getByRole which also matches agent cards with role="button")
    for (let i = 0; i < 2; i++) {
      const continueBtn = mainPage.locator('button:has-text("Continue")');
      if ((await continueBtn.count()) > 0) {
        await continueBtn.first().click();
        await mainPage.waitForTimeout(2_000);
      }
    }
  });

  test('MCP Servers step loads', async ({ mainPage }) => {
    await mainPage.waitForTimeout(3_000);

    const pageContent = await mainPage.textContent('body');
    const hasMcpContent =
      pageContent?.includes('MCP') ||
      pageContent?.includes('Server') ||
      pageContent?.includes('Configure') ||
      pageContent?.includes('selected');

    expect(hasMcpContent).toBeTruthy();
  });

  test('MCP server list is displayed', async ({ mainPage }) => {
    await mainPage.waitForTimeout(3_000);

    // MCP servers are shown as selectable cards with checkboxes
    const checkboxes = mainPage.locator('input[type="checkbox"]');
    const roleCheckboxes = mainPage.locator('[role="checkbox"]');
    const cards = mainPage.locator('[class*="cursor-pointer"]');

    const interactiveCount =
      (await checkboxes.count()) +
      (await roleCheckboxes.count()) +
      (await cards.count());

    // There should be MCP server cards to select
    expect(interactiveCount).toBeGreaterThan(0);
  });

  test('search input is available', async ({ mainPage }) => {
    await mainPage.waitForTimeout(3_000);

    // The MCP step has a search input with placeholder "Search MCP servers..."
    const searchInput = mainPage.locator('input[placeholder*="Search"]');
    const count = await searchInput.count();
    expect(count).toBeGreaterThan(0);
  });

  test('MCP servers show category badges', async ({ mainPage }) => {
    await mainPage.waitForTimeout(3_000);

    const pageContent = await mainPage.textContent('body');

    // Categories from categoryLabels: Knowledge, Database, API, Git, Quality, Security, etc.
    const categories = ['Knowledge', 'Database', 'API', 'Quality', 'Security', 'General'];
    const hasCategory = categories.some((cat) => pageContent?.includes(cat));
    expect(hasCategory).toBeTruthy();
  });

  test('MCP servers show tool count', async ({ mainPage }) => {
    await mainPage.waitForTimeout(3_000);

    // Each server card shows "N tools"
    const toolsBadges = mainPage.locator('text=/\\d+ tools?/');
    const count = await toolsBadges.count();
    expect(count).toBeGreaterThan(0);
  });
});
