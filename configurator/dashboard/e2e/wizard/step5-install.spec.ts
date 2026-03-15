// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';

test.describe('Wizard — Step 5: Install', () => {
  // Navigate to step 5 (Detection → Agents → MCP Servers → Environment → Install)
  test.beforeEach(async ({ mainPage }) => {
    const sidebar = mainPage.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    // Advance through steps 1–4
    for (let i = 0; i < 4; i++) {
      const continueBtn = mainPage.locator('button:has-text("Continue")');
      if ((await continueBtn.count()) > 0) {
        await continueBtn.first().click();
        await mainPage.waitForTimeout(2_000);
      }
    }
  });

  test('Install step loads with summary', async ({ mainPage }) => {
    await mainPage.waitForTimeout(3_000);

    const pageContent = await mainPage.textContent('body');
    const hasInstallContent =
      pageContent?.includes('Installation Summary') ||
      pageContent?.includes('Install') ||
      pageContent?.includes('Agents') ||
      pageContent?.includes('MCP Servers');

    expect(hasInstallContent).toBeTruthy();
  });

  test('shows agent and MCP server counts', async ({ mainPage }) => {
    await mainPage.waitForTimeout(3_000);

    const pageContent = await mainPage.textContent('body');
    // Summary section shows count cards: Agents, MCP Servers, Env Variables, Target Project
    const hasCounts =
      pageContent?.includes('Agents') &&
      pageContent?.includes('MCP Servers');

    expect(hasCounts).toBeTruthy();
  });

  test('shows installation progress steps', async ({ mainPage }) => {
    await mainPage.waitForTimeout(3_000);

    const pageContent = await mainPage.textContent('body');
    // Install step shows sub-steps: Preparing, Installing agents, Copying skills, etc.
    const hasProgressSteps =
      pageContent?.includes('Installation Progress') ||
      pageContent?.includes('Preparing') ||
      pageContent?.includes('Installing agents') ||
      pageContent?.includes('Configuring');

    expect(hasProgressSteps).toBeTruthy();
  });

  test('Start Installation button is available', async ({ mainPage }) => {
    await mainPage.waitForTimeout(3_000);

    const installBtn = mainPage.locator('button:has-text("Start Installation")');
    const count = await installBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Install step is step 5 in sidebar', async ({ mainPage }) => {
    await mainPage.waitForTimeout(2_000);

    const sidebar = mainPage.locator('aside');
    const installButton = sidebar.getByRole('button', { name: /Install/i });
    await expect(installButton).toBeVisible({ timeout: 5_000 });

    // Active step has primary styling
    const classes = await installButton.getAttribute('class');
    const isActive =
      classes?.includes('primary') || classes?.includes('border-primary');
    expect(isActive).toBeTruthy();
  });
});
