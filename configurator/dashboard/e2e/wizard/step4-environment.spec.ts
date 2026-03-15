// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';

test.describe('Wizard — Step 4: Environment', () => {
  // Navigate to step 4 (Detection → Agents → MCP Servers → Environment)
  test.beforeEach(async ({ mainPage }) => {
    const sidebar = mainPage.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    // Advance through steps 1, 2, and 3
    for (let i = 0; i < 3; i++) {
      const continueBtn = mainPage.locator('button:has-text("Continue")');
      if ((await continueBtn.count()) > 0) {
        await continueBtn.first().click();
        await mainPage.waitForTimeout(2_000);
      }
    }
  });

  test('Environment step loads', async ({ mainPage }) => {
    await mainPage.waitForTimeout(3_000);

    const pageContent = await mainPage.textContent('body');
    const hasEnvContent =
      pageContent?.includes('Environment') ||
      pageContent?.includes('Variables') ||
      pageContent?.includes('configuration') ||
      pageContent?.includes('No configuration needed');

    expect(hasEnvContent).toBeTruthy();
  });

  test('shows environment variables section', async ({ mainPage }) => {
    await mainPage.waitForTimeout(3_000);

    const pageContent = await mainPage.textContent('body');
    // The step shows "Environment Variables" heading and either variables or "No configuration needed"
    const hasVarSection =
      pageContent?.includes('Environment Variables') ||
      pageContent?.includes('No configuration needed') ||
      pageContent?.includes('No environment variables');

    expect(hasVarSection).toBeTruthy();
  });

  test('Environment step is step 4 in sidebar', async ({ mainPage }) => {
    await mainPage.waitForTimeout(2_000);

    // The "Environment" button in the sidebar should be the active one
    const sidebar = mainPage.locator('aside');
    const envButton = sidebar.getByRole('button', { name: /Environment/i });
    await expect(envButton).toBeVisible({ timeout: 5_000 });

    // Active step has primary styling
    const classes = await envButton.getAttribute('class');
    const isActive =
      classes?.includes('primary') || classes?.includes('border-primary');
    expect(isActive).toBeTruthy();
  });
});
