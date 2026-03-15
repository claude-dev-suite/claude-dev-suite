// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';
import { waitForWindowCount } from '../fixtures/helpers';

test.describe('Splash Screen — Start Flow', () => {
  test('clicking Start begins the initialization sequence', async ({
    splashPage,
    electronApp,
  }) => {
    const startBtn = splashPage.locator('#btnStart');
    await startBtn.click();

    // Button should become disabled and show "Starting..."
    await expect(startBtn).toBeDisabled();
    await expect(startBtn).toHaveText('Starting...');

    // Path selector should hide
    const pathSelector = splashPage.locator('#pathSelector');
    await expect(pathSelector).toHaveClass(/hidden/, { timeout: 5_000 });
  });

  test('early steps progress through pending → active → done', async ({
    splashPage,
    electronApp,
  }) => {
    // Click Start
    await splashPage.locator('#btnStart').click();

    // Step 0 (Select project) should go to "done"
    const step0 = splashPage.locator('[data-step="0"]');
    await expect(step0).toHaveClass(/done/, { timeout: 10_000 });
    const step0Text = step0.locator('.step-text');
    await expect(step0Text).toHaveText('Project selected');

    // Step 1 (Node.js runtime) should become active then done
    const step1 = splashPage.locator('[data-step="1"]');
    await expect(step1).toHaveClass(/done/, { timeout: 10_000 });
    const step1Text = step1.locator('.step-text');
    await expect(step1Text).toHaveText('Runtime ready');

    // Steps 2-3 (Server, Dashboard) happen fast and the splash closes
    // once the main window appears. We verify the full flow completes
    // by checking the main window opens rather than observing every step
    // on the splash (which is a race condition).
    const mainPage = await electronApp.waitForEvent('window', { timeout: 90_000 });
    await mainPage.waitForLoadState('domcontentloaded');
    // If we get here, steps 2-3 completed successfully
    expect(mainPage).toBeTruthy();
  });

  test('main window opens after all steps complete', async ({ splashPage, electronApp }) => {
    // Click Start and wait for the full startup sequence
    await splashPage.locator('#btnStart').click();

    // Wait for the main window to appear
    const mainPage = await electronApp.waitForEvent('window', {
      timeout: 90_000,
    });

    // Main window should eventually become visible
    await mainPage.waitForLoadState('domcontentloaded');

    // Should have at most 2 windows briefly, then splash closes → 1 window
    // Wait for splash to close
    await waitForWindowCount(electronApp, 1, 30_000);

    // The remaining window is the main dashboard
    const windows = electronApp.windows();
    expect(windows).toHaveLength(1);
  });

  test('splash closes after main window is ready', async ({ splashPage, electronApp }) => {
    await splashPage.locator('#btnStart').click();

    // Wait for main window
    await electronApp.waitForEvent('window', { timeout: 90_000 });

    // Splash should close
    await waitForWindowCount(electronApp, 1, 30_000);

    // Verify splash is gone by checking that the remaining window is NOT the splash
    const remainingPage = electronApp.windows()[0];
    const url = remainingPage.url();
    expect(url).not.toContain('splash.html');
  });
});
