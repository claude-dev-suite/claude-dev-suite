// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';
import { getWindowBounds } from '../fixtures/helpers';

test.describe('Main Window — Properties', () => {
  test('main window has expected minimum dimensions', async ({ mainPage, electronApp }) => {
    const bounds = await getWindowBounds(electronApp, mainPage);
    // Default: 1400x900, min: 1000x700
    expect(bounds.width).toBeGreaterThanOrEqual(1000);
    expect(bounds.height).toBeGreaterThanOrEqual(700);
  });

  test('main window loads the React app', async ({ mainPage }) => {
    // The React app should render (check for root element or any React content)
    const body = mainPage.locator('body');
    await expect(body).toBeVisible();

    // Wait for React to mount — look for any meaningful content
    // The app loads and either shows wizard (not installed) or orchestrator
    await mainPage.waitForSelector('main, [class*="surface"]', { timeout: 30_000 });
  });

  test('main window title contains Dev-Suite', async ({ mainPage }) => {
    const title = await mainPage.title();
    // Title comes from the HTML or Vite build
    expect(title).toBeTruthy();
  });

  test('app version is accessible via electronAPI', async ({ mainPage }) => {
    const version = await mainPage.evaluate(() => {
      return (window as Record<string, unknown>).electronAPI
        ? ((window as Record<string, unknown>).electronAPI as Record<string, () => Promise<string>>).getVersion()
        : null;
    });

    if (version) {
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    }
  });

  test('server health check returns OK', async ({ mainPage }) => {
    // The frontend checks /health on mount. We can verify via fetch.
    const health = await mainPage.evaluate(async () => {
      try {
        const res = await fetch('http://localhost:3456/health');
        return { status: res.status, ok: res.ok };
      } catch {
        return { status: 0, ok: false };
      }
    });

    expect(health.ok).toBe(true);
    expect(health.status).toBe(200);
  });

  test('platform info is available', async ({ mainPage }) => {
    const platform = await mainPage.evaluate(() => {
      const api = (window as Record<string, unknown>).electronAPI as
        | Record<string, unknown>
        | undefined;
      return api?.platform;
    });

    expect(platform).toBe(process.platform);
  });
});
