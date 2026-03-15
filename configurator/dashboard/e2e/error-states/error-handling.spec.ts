// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';

test.describe('Error Handling', () => {
  test('no error boundary in normal operation', async ({ mainPage }) => {
    await mainPage.waitForTimeout(5_000);

    const pageContent = await mainPage.textContent('body');
    expect(pageContent?.includes('Something went wrong')).toBeFalsy();
  });

  test('API returns 400 for empty path', async ({ mainPage }) => {
    const status = await mainPage.evaluate(async () => {
      const res = await fetch('http://localhost:3456/api/detect?path=');
      return res.status;
    });

    expect(status).toBe(400);
  });

  test('API rejects path traversal', async ({ mainPage }) => {
    const status = await mainPage.evaluate(async () => {
      const res = await fetch('http://localhost:3456/api/detect?path=../../../etc/passwd');
      return res.status;
    });

    // Server should reject with 400 (validation) or 500 (path security error)
    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('health endpoint returns 200', async ({ mainPage }) => {
    const result = await mainPage.evaluate(async () => {
      const res = await fetch('http://localhost:3456/health');
      const json = await res.json();
      return { status: res.status, body: json };
    });

    expect(result.status).toBe(200);
    expect(result.body.status).toBe('ok');
  });

  test('server status shows Connected', async ({ mainPage }) => {
    await mainPage.waitForTimeout(5_000);

    // Green dot should be visible (server connected)
    const greenDot = mainPage.locator('.bg-green-500');
    const greenCount = await greenDot.count();

    // Red pulsing dot should NOT be visible
    const redDot = mainPage.locator('.bg-red-500.animate-pulse');
    const redCount = await redDot.count();

    expect(greenCount).toBeGreaterThan(0);
    expect(redCount).toBe(0);
  });
});
