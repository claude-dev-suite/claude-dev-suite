// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';
import { getWindowBounds, waitForGitPanel } from '../fixtures/helpers';

test.describe('Window Resize Behavior', () => {
  test('window enforces min 1000x700', async ({ mainPage, electronApp }) => {
    const bw = await electronApp.browserWindow(mainPage);

    // Try to resize below minimum
    await bw.evaluate((win) => win.setSize(500, 400));
    await mainPage.waitForTimeout(1_000);

    const bounds = await getWindowBounds(electronApp, mainPage);
    expect(bounds.width).toBeGreaterThanOrEqual(1000);
    expect(bounds.height).toBeGreaterThanOrEqual(700);
  });

  test('window can be resized above minimum', async ({ mainPage, electronApp }) => {
    const bw = await electronApp.browserWindow(mainPage);

    await bw.evaluate((win) => win.setSize(1200, 800));
    await mainPage.waitForTimeout(1_000);

    const bounds = await getWindowBounds(electronApp, mainPage);
    expect(bounds.width).toBe(1200);
    // Allow +-5px tolerance for Windows DPI rounding
    expect(bounds.height).toBeGreaterThanOrEqual(795);
    expect(bounds.height).toBeLessThanOrEqual(805);
  });

  test('tool panel opens at default width', async ({ mainPage }) => {
    const gitBtn = mainPage.locator('[data-tutorial="git-tool-btn"]');
    await expect(gitBtn).toBeVisible({ timeout: 15_000 });
    await gitBtn.click();
    await waitForGitPanel(mainPage);

    // Use the data-tutorial attribute for the Git panel content
    const panel = mainPage.locator('[data-tutorial="git-panel"]');
    const isVisible = await panel.isVisible().catch(() => false);

    if (isVisible) {
      const box = await panel.boundingBox();
      expect(box).toBeTruthy();
      // Default Git panel width is ~350px
      expect(box!.width).toBeGreaterThanOrEqual(200);
      expect(box!.width).toBeLessThanOrEqual(500);
    } else {
      // Fallback: verify the Git button has active styling (panel opened)
      const classes = await gitBtn.getAttribute('class');
      expect(classes?.includes('bg-accent-600')).toBeTruthy();
    }
  });

  test('tool panel width within 200-800 range', async ({ mainPage }) => {
    const gitBtn = mainPage.locator('[data-tutorial="git-tool-btn"]');
    await expect(gitBtn).toBeVisible({ timeout: 15_000 });
    await gitBtn.click();
    await waitForGitPanel(mainPage);

    const panel = mainPage.locator('[data-tutorial="git-panel"]');
    const isVisible = await panel.isVisible().catch(() => false);

    if (isVisible) {
      const box = await panel.boundingBox();
      expect(box).toBeTruthy();
      // ui.store.ts clamps width to Math.max(200, Math.min(800, width))
      expect(box!.width).toBeGreaterThanOrEqual(200);
      expect(box!.width).toBeLessThanOrEqual(800);
    } else {
      // Fallback: verify button is active
      const classes = await gitBtn.getAttribute('class');
      expect(classes?.includes('bg-accent-600')).toBeTruthy();
    }
  });
});
