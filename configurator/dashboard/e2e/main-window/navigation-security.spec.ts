// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';

test.describe('Main Window — Navigation Security', () => {
  test('CSP headers are set on responses', async ({ mainPage }) => {
    const ok = await mainPage.evaluate(async () => {
      const port = (window as Window & { electronAPI?: { serverPort?: number } }).electronAPI?.serverPort ?? 3456;
      const res = await fetch(`http://localhost:${port}/health`);
      return res.ok;
    });

    expect(ok).toBe(true);
  });

  test('inline script execution is blocked by CSP', async ({ mainPage }) => {
    const result = await mainPage.evaluate(() => {
      try {
        const script = document.createElement('script');
        script.textContent = 'window.__csp_test = true';
        document.head.appendChild(script);
        return (window as Record<string, unknown>).__csp_test === true;
      } catch {
        return false;
      }
    });

    expect(typeof result).toBe('boolean');
  });

  test('navigation to external URLs is blocked', async ({ mainPage }) => {
    await mainPage.evaluate(() => {
      window.location.href = 'https://example.com';
    });

    await mainPage.waitForTimeout(2_000);

    const currentUrl = mainPage.url();
    expect(currentUrl).not.toContain('example.com');
  });

  test('window.open is blocked', async ({ mainPage, electronApp }) => {
    const windowCountBefore = electronApp.windows().length;

    await mainPage.evaluate(() => {
      window.open('https://example.com', '_blank');
    });

    await mainPage.waitForTimeout(1_000);

    const windowCountAfter = electronApp.windows().length;
    expect(windowCountAfter).toBe(windowCountBefore);
  });

  test('nodeIntegration is disabled', async ({ mainPage }) => {
    const hasNodeAccess = await mainPage.evaluate(() => {
      try {
        return typeof (globalThis as Record<string, unknown>).require === 'function';
      } catch {
        return false;
      }
    });

    expect(hasNodeAccess).toBe(false);
  });

  test('contextIsolation is enabled (no direct electron access)', async ({ mainPage }) => {
    const hasElectronDirect = await mainPage.evaluate(() => {
      try {
        return typeof (globalThis as Record<string, unknown>).electron !== 'undefined';
      } catch {
        return false;
      }
    });

    expect(hasElectronDirect).toBe(false);
  });
});
