// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';
import { waitForTabContent } from '../fixtures/helpers';

/**
 * Integration test: wizard flow navigation and state transitions.
 */
test.describe('Integration — Wizard to Orchestrator', () => {
  test('completing all wizard steps reaches Install step', async ({ mainPage }) => {
    const sidebar = mainPage.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 20_000 });

    // Step 1 → 2 → 3 → 4 → 5: click Continue 4 times
    for (let i = 0; i < 4; i++) {
      const continueBtn = mainPage.locator('button:has-text("Continue")');
      if ((await continueBtn.count()) > 0) {
        await continueBtn.first().click();
        await mainPage.waitForTimeout(2_000);
      }
    }

    // Should now be on step 5 (Install)
    const pageContent = await mainPage.textContent('body');
    const isOnInstall =
      pageContent?.includes('Install') ||
      pageContent?.includes('Start Installation') ||
      pageContent?.includes('Review') ||
      pageContent?.includes('Summary');
    expect(isOnInstall).toBeTruthy();
  });

  test('wizard sidebar updates completed steps', async ({ mainPage }) => {
    const sidebar = mainPage.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 20_000 });

    // Advance one step
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

      // Step 1 (Detection) should now be completed (not disabled)
      const detectionStep = sidebar.locator('button:has-text("Detection")');
      if ((await detectionStep.count()) > 0) {
        const isDisabled = await detectionStep.first().isDisabled();
        expect(isDisabled).toBeFalsy();
      }
    }
  });

  test('Back button is enabled on step 2', async ({ mainPage }) => {
    const sidebar = mainPage.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 20_000 });

    // Advance to step 2
    const continueBtn = mainPage.locator('button:has-text("Continue")');
    await continueBtn.first().click();
    await mainPage.waitForFunction(
      () => {
        const body = document.body.textContent ?? '';
        return body.includes('Recommended Agents') || body.includes('expert');
      },
      { timeout: 10_000 },
    );

    // Back button should be present and enabled (not disabled)
    const backBtn = mainPage.locator('button:has-text("Back")');
    const count = await backBtn.count();
    expect(count).toBeGreaterThan(0);

    if (count > 0) {
      const isDisabled = await backBtn.first().isDisabled();
      expect(isDisabled).toBeFalsy();
    }
  });

  test('wizard shows detection results after auto-detect', async ({ mainPage }) => {
    await mainPage.locator('aside').waitFor({ state: 'visible', timeout: 20_000 });

    // Wait for detection to complete (project type shows up)
    await mainPage.waitForFunction(
      () => {
        const body = document.body.textContent ?? '';
        return body.includes('fullstack') || body.includes('Project Type') || body.includes('react');
      },
      { timeout: 15_000 },
    );

    const pageContent = await mainPage.textContent('body');
    const hasDetection =
      pageContent?.includes('Project Type') ||
      pageContent?.includes('fullstack') ||
      pageContent?.includes('react');
    expect(hasDetection).toBeTruthy();
  });

  test('server stays connected throughout wizard navigation', async ({ mainPage }) => {
    // Wait for Connected status to appear
    await waitForTabContent(mainPage, 'Connected');

    const pageContent = await mainPage.textContent('body');
    expect(pageContent?.includes('Connected')).toBeTruthy();

    // Navigate forward
    const continueBtn = mainPage.locator('button:has-text("Continue")');
    await continueBtn.first().click();
    await mainPage.waitForTimeout(2_000);

    // Still connected after navigation
    const newContent = await mainPage.textContent('body');
    expect(newContent?.includes('Connected')).toBeTruthy();
  });
});
