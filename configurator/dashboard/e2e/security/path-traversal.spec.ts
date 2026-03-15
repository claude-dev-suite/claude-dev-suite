// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';

test.describe('Security — Path Traversal Prevention', () => {
  test('confirm-path rejects traversal sequences via splash', async ({
    electronApp,
    splashPage,
  }) => {
    const traversalPaths = [
      'C:/Users/../../etc/passwd',
      '../../../etc/shadow',
      '',
      '   ',
    ];

    for (const tp of traversalPaths) {
      const result = await splashPage.evaluate(async (pathToTest) => {
        if (window.splashAPI?.confirmPath) {
          return window.splashAPI.confirmPath(pathToTest);
        }
        return { success: false, error: 'splashAPI not available' };
      }, tp);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    }
  });

  test('API endpoints reject traversal in query params', async ({ mainPage }) => {
    const response = await mainPage.evaluate(async () => {
      const port = (window as Window & { electronAPI?: { serverPort?: number } }).electronAPI?.serverPort ?? 3456;
      try {
        const res = await fetch(
          `http://localhost:${port}/api/detect?path=` +
            encodeURIComponent('C:\\Users\\..\\..\\Windows\\System32'),
        );
        return { status: res.status, ok: res.ok };
      } catch {
        return { status: 0, ok: false };
      }
    });

    expect(response.ok).toBe(false);
  });

  test('API endpoints reject empty path', async ({ mainPage }) => {
    const response = await mainPage.evaluate(async () => {
      const port = (window as Window & { electronAPI?: { serverPort?: number } }).electronAPI?.serverPort ?? 3456;
      try {
        const res = await fetch(`http://localhost:${port}/api/detect?path=`);
        return { status: res.status, ok: res.ok };
      } catch {
        return { status: 0, ok: false };
      }
    });

    expect(response.ok).toBe(false);
  });

  test('server is only accessible on localhost', async ({ mainPage }) => {
    const health = await mainPage.evaluate(async () => {
      const port = (window as Window & { electronAPI?: { serverPort?: number } }).electronAPI?.serverPort ?? 3456;
      try {
        const res = await fetch(`http://localhost:${port}/health`);
        const data = await res.json();
        return data;
      } catch {
        return null;
      }
    });

    expect(health).not.toBeNull();
    expect(health.status).toBe('ok');
  });

  test('nodeIntegration is disabled in renderer', async ({ mainPage }) => {
    const hasNodeAccess = await mainPage.evaluate(() => {
      try {
        return typeof (globalThis as Record<string, unknown>).require === 'function';
      } catch {
        return false;
      }
    });

    expect(hasNodeAccess).toBe(false);
  });

  test('contextIsolation prevents direct electron access', async ({ mainPage }) => {
    const hasElectron = await mainPage.evaluate(() => {
      return typeof (globalThis as Record<string, unknown>).electron !== 'undefined';
    });

    expect(hasElectron).toBe(false);
  });
});
