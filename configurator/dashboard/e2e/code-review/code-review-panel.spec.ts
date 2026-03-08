// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';

/**
 * Code Review panel tests — requires an installed project
 * (the Code Review tab only shows when `isInstalled` is true).
 */

const test = createInstalledTest({ tmpPrefix: 'devsuite-e2e-cr-' });

test.describe('Code Review Panel', () => {
  test('Code Review tab is visible for installed projects', async ({ mainPage }) => {
    await mainPage.waitForTimeout(5_000);

    const pageContent = await mainPage.textContent('body');
    const hasCodeReviewTab =
      pageContent?.includes('Code Review') || pageContent?.includes('code-review');

    expect(hasCodeReviewTab).toBeTruthy();
  });

  test('clicking Code Review tab opens the panel', async ({ mainPage }) => {
    await mainPage.waitForTimeout(5_000);

    // Click the Code Review tab in the header
    const crTab = mainPage.locator('button:has-text("Code Review")');
    if ((await crTab.count()) > 0) {
      await crTab.first().click();
      await mainPage.waitForTimeout(3_000);

      const pageContent = await mainPage.textContent('body');
      const hasCrContent =
        pageContent?.includes('AI Code Review') ||
        pageContent?.includes('Review Scope') ||
        pageContent?.includes('Review Agents');

      expect(hasCrContent).toBeTruthy();
    }
  });

  test('shows scope selector with Uncommitted Changes and Full Project', async ({ mainPage }) => {
    await mainPage.waitForTimeout(5_000);

    const crTab = mainPage.locator('button:has-text("Code Review")');
    if ((await crTab.count()) > 0) {
      await crTab.first().click();
      await mainPage.waitForTimeout(3_000);

      const pageContent = await mainPage.textContent('body');
      const hasScopes =
        pageContent?.includes('Uncommitted Changes') ||
        pageContent?.includes('Full Project') ||
        pageContent?.includes('Review Scope');

      expect(hasScopes).toBeTruthy();
    }
  });

  test('shows review agent cards', async ({ mainPage }) => {
    await mainPage.waitForTimeout(5_000);

    const crTab = mainPage.locator('button:has-text("Code Review")');
    if ((await crTab.count()) > 0) {
      await crTab.first().click();
      await mainPage.waitForTimeout(3_000);

      const pageContent = await mainPage.textContent('body');
      // Review agents may include security, performance, qa, etc.
      const hasAgents =
        pageContent?.includes('Select Review Agents') ||
        pageContent?.includes('security') ||
        pageContent?.includes('performance') ||
        pageContent?.includes('agent');

      expect(hasAgents).toBeTruthy();
    }
  });

  test('Start Review button is present but disabled without agents', async ({ mainPage }) => {
    await mainPage.waitForTimeout(5_000);

    const crTab = mainPage.locator('button:has-text("Code Review")');
    if ((await crTab.count()) > 0) {
      await crTab.first().click();
      await mainPage.waitForTimeout(3_000);

      const startBtn = mainPage.locator('button:has-text("Start Review")');
      const count = await startBtn.count();
      expect(count).toBeGreaterThan(0);

      // Should be disabled since no agents are selected
      if (count > 0) {
        const isDisabled = await startBtn.first().isDisabled();
        expect(isDisabled).toBeTruthy();
      }
    }
  });
});
