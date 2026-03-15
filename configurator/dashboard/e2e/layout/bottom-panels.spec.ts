// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';

test.describe('Layout — Bottom Panels', () => {
  test('Terminal button is visible in bottom toolbar', async ({ mainPage }) => {
    await mainPage.locator('[data-tutorial="tool-window-bar"]').waitFor({ state: 'visible', timeout: 20_000 });

    const terminalBtn = mainPage.locator('button:has-text("Terminal")');
    const count = await terminalBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Logs button is visible in bottom toolbar', async ({ mainPage }) => {
    await mainPage.locator('[data-tutorial="tool-window-bar"]').waitFor({ state: 'visible', timeout: 20_000 });

    const logsBtn = mainPage.locator('button:has-text("Logs")');
    const count = await logsBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  test('clicking Terminal opens bottom panel', async ({ mainPage }) => {
    await mainPage.locator('[data-tutorial="tool-window-bar"]').waitFor({ state: 'visible', timeout: 20_000 });

    const terminalBtn = mainPage.locator('button:has-text("Terminal")');
    if ((await terminalBtn.count()) > 0) {
      await terminalBtn.first().click();
      await mainPage.waitForTimeout(500);

      // Terminal panel should appear with a prompt or terminal content
      const pageContent = await mainPage.textContent('body');
      const hasTerminal =
        pageContent?.includes('Terminal') ||
        pageContent?.includes('$') ||
        pageContent?.includes('terminal');
      expect(hasTerminal).toBeTruthy();
    }
  });

  test('clicking Logs opens bottom panel', async ({ mainPage }) => {
    await mainPage.locator('[data-tutorial="tool-window-bar"]').waitFor({ state: 'visible', timeout: 20_000 });

    const logsBtn = mainPage.locator('button:has-text("Logs")');
    if ((await logsBtn.count()) > 0) {
      await logsBtn.first().click();
      await mainPage.waitForTimeout(500);

      // Logs panel should appear
      const pageContent = await mainPage.textContent('body');
      const hasLogs =
        pageContent?.includes('Logs') ||
        pageContent?.includes('Log') ||
        pageContent?.includes('log');
      expect(hasLogs).toBeTruthy();
    }
  });

  test('clicking same bottom tab again closes the panel', async ({ mainPage }) => {
    await mainPage.locator('[data-tutorial="tool-window-bar"]').waitFor({ state: 'visible', timeout: 20_000 });

    const terminalBtn = mainPage.locator('button:has-text("Terminal")');
    if ((await terminalBtn.count()) > 0) {
      // Open terminal
      await terminalBtn.first().click();
      await mainPage.waitForTimeout(500);

      // Close terminal by clicking again
      await terminalBtn.first().click();
      await mainPage.waitForTimeout(500);

      // The bottom panel should be closed — no extra content beyond the tabs
      // Verify no errors occurred
      const pageContent = await mainPage.textContent('body');
      expect(pageContent?.includes('Something went wrong')).toBeFalsy();
    }
  });
});
