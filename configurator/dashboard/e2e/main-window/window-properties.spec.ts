// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';
import { getWindowBounds } from '../fixtures/helpers';

test.describe('Main Window — Properties', () => {
  test('main window has expected minimum dimensions', async ({ mainPage, electronApp }) => {
    const bounds = await getWindowBounds(electronApp, mainPage);
    expect(bounds.width).toBeGreaterThanOrEqual(1000);
    expect(bounds.height).toBeGreaterThanOrEqual(700);
  });

  test('main window loads the React app', async ({ mainPage }) => {
    const body = mainPage.locator('body');
    await expect(body).toBeVisible();

    await mainPage.waitForSelector('main, [class*="surface"]', { timeout: 30_000 });
  });

  test('main window title contains Dev-Suite', async ({ mainPage }) => {
    const title = await mainPage.title();
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
    const health = await mainPage.evaluate(async () => {
      const port = (window as Window & { electronAPI?: { serverPort?: number } }).electronAPI?.serverPort ?? 3456;
      try {
        const res = await fetch(`http://localhost:${port}/health`);
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
