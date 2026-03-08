// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';
import { getWindowBounds, isWindowVisible } from '../fixtures/helpers';

test.describe('Splash Screen — Display', () => {
  test('splash window appears on launch', async ({ splashPage, electronApp }) => {
    // In E2E_HEADLESS mode the window exists but show=false, so check DOM loaded
    const visible = await isWindowVisible(electronApp, splashPage);
    if (!visible) {
      // Window is hidden (headless mode) — verify it still loaded content
      const content = await splashPage.textContent('body');
      expect(content?.includes('Dev-Suite')).toBe(true);
    } else {
      expect(visible).toBe(true);
    }
  });

  test('splash window has correct dimensions (~400x340)', async ({ splashPage, electronApp }) => {
    const bounds = await getWindowBounds(electronApp, splashPage);
    // Allow ±10px tolerance for OS chrome/DPI scaling
    expect(bounds.width).toBeGreaterThanOrEqual(390);
    expect(bounds.width).toBeLessThanOrEqual(410);
    expect(bounds.height).toBeGreaterThanOrEqual(330);
    expect(bounds.height).toBeLessThanOrEqual(350);
  });

  test('splash shows the Dev-Suite logo', async ({ splashPage }) => {
    const logo = splashPage.locator('.logo');
    await expect(logo).toBeVisible();
    await expect(logo).toHaveText('Dev-Suite');
  });

  test('splash shows the tagline', async ({ splashPage }) => {
    const tagline = splashPage.locator('.tagline');
    await expect(tagline).toBeVisible();
    await expect(tagline).toHaveText('Development Toolkit');
  });

  test('splash shows the version', async ({ splashPage }) => {
    const version = splashPage.locator('#version');
    await expect(version).toBeVisible({ timeout: 5_000 });
    const text = await version.textContent();
    // Version should be like "v1.1.0"
    expect(text).toMatch(/^v\d+\.\d+\.\d+/);
  });

  test('splash shows 4 steps', async ({ splashPage }) => {
    const steps = splashPage.locator('.step');
    await expect(steps).toHaveCount(4);
  });

  test('first step is active, others are pending', async ({ splashPage }) => {
    const steps = splashPage.locator('.step');

    // Step 0: active (select project folder)
    await expect(steps.nth(0)).toHaveClass(/active/);
    // Steps 1-3: pending
    await expect(steps.nth(1)).toHaveClass(/pending/);
    await expect(steps.nth(2)).toHaveClass(/pending/);
    await expect(steps.nth(3)).toHaveClass(/pending/);
  });

  test('step texts are correct', async ({ splashPage }) => {
    const stepTexts = splashPage.locator('.step-text');
    await expect(stepTexts.nth(0)).toHaveText('Select project folder');
    await expect(stepTexts.nth(1)).toHaveText('Starting Node.js runtime...');
    await expect(stepTexts.nth(2)).toHaveText('Initializing server...');
    await expect(stepTexts.nth(3)).toHaveText('Loading dashboard...');
  });
});
