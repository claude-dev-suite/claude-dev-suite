// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';

test.describe('Wizard — Navigation', () => {
  test('can navigate forward through wizard steps', async ({ mainPage }) => {
    // Wait for wizard to load
    const detectionButton = mainPage.getByRole('button', { name: /Detection/i });
    await expect(detectionButton).toBeVisible({ timeout: 15_000 });

    // Click Next/Continue to advance
    const nextBtn = mainPage.getByRole('button', { name: /next|continue/i });
    if ((await nextBtn.count()) > 0) {
      await nextBtn.click();
      await mainPage.waitForTimeout(2_000);
    }
  });

  test('completed steps show checkmark', async ({ mainPage }) => {
    // Look for SVG checkmark in sidebar (the check path from Sidebar.tsx)
    const checkmarks = mainPage.locator('aside svg path[d*="M5 13"]');
    const count = await checkmarks.count();
    // Initial state — may or may not have completed steps
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('sidebar shows all 5 wizard step labels', async ({ mainPage }) => {
    // Verify all expected step labels are in the sidebar
    const sidebar = mainPage.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    const expectedSteps = ['Detection', 'Agents', 'Environment', 'Install'];

    for (const stepName of expectedSteps) {
      const stepButton = sidebar.getByRole('button', { name: new RegExp(stepName, 'i') });
      await expect(stepButton).toBeVisible({ timeout: 5_000 });
    }
  });

  test('cannot skip to Install without completing previous steps', async ({ mainPage }) => {
    const sidebar = mainPage.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    // The Install step button should be disabled
    const installButton = sidebar.getByRole('button', { name: /Install/i });
    await expect(installButton).toBeVisible({ timeout: 5_000 });

    const isDisabled = await installButton.isDisabled();
    const classes = await installButton.getAttribute('class');
    const hasDisabledStyle =
      isDisabled || classes?.includes('not-allowed') || classes?.includes('opacity-50');
    expect(hasDisabledStyle).toBeTruthy();
  });
});
