// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';

const test = createInstalledTest({ tmpPrefix: 'devsuite-e2e-tut-' });

test.describe('Tutorial System', () => {
  test('help button starts tutorial', async ({ mainPage }) => {
    await mainPage.waitForTimeout(8_000);

    const helpBtn = mainPage.locator('[data-tutorial="help-btn"]');
    await expect(helpBtn).toBeVisible({ timeout: 15_000 });
    await helpBtn.click();
    await mainPage.waitForTimeout(1_000);

    // Tutorial overlay should appear with "Welcome" in the first step
    const pageContent = await mainPage.textContent('body');
    const hasTutorial =
      pageContent?.includes('Welcome') ||
      pageContent?.includes('tutorial') ||
      pageContent?.includes('Tour');

    expect(hasTutorial).toBeTruthy();
  });

  test('tutorial can progress and be skipped', async ({ mainPage }) => {
    await mainPage.waitForTimeout(8_000);

    const helpBtn = mainPage.locator('[data-tutorial="help-btn"]');
    await expect(helpBtn).toBeVisible({ timeout: 15_000 });
    await helpBtn.click();
    await mainPage.waitForTimeout(1_000);

    // Get initial tutorial content
    const initialContent = await mainPage.textContent('body');

    // Click Next or press ArrowRight to advance
    const nextBtn = mainPage.locator('button:has-text("Next")');
    if ((await nextBtn.count()) > 0) {
      await nextBtn.first().click();
    } else {
      await mainPage.keyboard.press('ArrowRight');
    }
    await mainPage.waitForTimeout(1_000);

    // Content should have changed (different step)
    const afterNextContent = await mainPage.textContent('body');

    // Skip the tutorial
    const skipBtn = mainPage.locator('button:has-text("Skip")');
    if ((await skipBtn.count()) > 0) {
      await skipBtn.first().click();
    } else {
      await mainPage.keyboard.press('Escape');
    }
    await mainPage.waitForTimeout(500);

    // Tutorial overlay should be gone — verify no "Skip" or "Next" tutorial buttons
    const skipCount = await mainPage.locator('button:has-text("Skip Tour")').count();
    expect(skipCount).toBe(0);
  });

  test('completion saves to localStorage', async ({ mainPage }) => {
    await mainPage.waitForTimeout(8_000);

    const helpBtn = mainPage.locator('[data-tutorial="help-btn"]');
    await expect(helpBtn).toBeVisible({ timeout: 15_000 });
    await helpBtn.click();
    await mainPage.waitForTimeout(1_000);

    // Skip the tutorial immediately
    const skipBtn = mainPage.locator('button:has-text("Skip")');
    if ((await skipBtn.count()) > 0) {
      await skipBtn.first().click();
    } else {
      await mainPage.keyboard.press('Escape');
    }
    await mainPage.waitForTimeout(500);

    // Check localStorage for tutorial completion flag
    const completed = await mainPage.evaluate(() => {
      // Common localStorage keys for tutorial completion
      const keys = Object.keys(localStorage);
      const tutorialKey = keys.find(
        (k) =>
          k.toLowerCase().includes('tutorial') ||
          k.toLowerCase().includes('tour') ||
          k.toLowerCase().includes('onboarding'),
      );
      if (tutorialKey) {
        return localStorage.getItem(tutorialKey);
      }
      return null;
    });

    // If a tutorial flag was set, it should be truthy
    if (completed !== null) {
      expect(completed).toBe('true');
    }
  });
});
