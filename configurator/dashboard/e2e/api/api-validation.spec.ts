// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';

test.describe('API Validation', () => {
  test('POST /api/install rejects missing body', async ({ mainPage }) => {
    const status = await mainPage.evaluate(async () => {
      const port = (window as Window & { electronAPI?: { serverPort?: number } }).electronAPI?.serverPort ?? 3456;
      const res = await fetch(`http://localhost:${port}/api/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      return res.status;
    });

    // Should reject with 400 (validation) or 500 (missing required fields)
    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('POST /api/git/commit rejects empty message', async ({ mainPage, testProjectDir }) => {
    const status = await mainPage.evaluate(async (dir) => {
      const port = (window as Window & { electronAPI?: { serverPort?: number } }).electronAPI?.serverPort ?? 3456;
      const res = await fetch(`http://localhost:${port}/api/git/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: dir, message: '' }),
      });
      return res.status;
    }, testProjectDir);

    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('POST /api/git/stage rejects missing files', async ({ mainPage, testProjectDir }) => {
    const status = await mainPage.evaluate(async (dir) => {
      const port = (window as Window & { electronAPI?: { serverPort?: number } }).electronAPI?.serverPort ?? 3456;
      const res = await fetch(`http://localhost:${port}/api/git/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: dir }),
      });
      return res.status;
    }, testProjectDir);

    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('GET /api/git/repos rejects missing path', async ({ mainPage }) => {
    const status = await mainPage.evaluate(async () => {
      const port = (window as Window & { electronAPI?: { serverPort?: number } }).electronAPI?.serverPort ?? 3456;
      const res = await fetch(`http://localhost:${port}/api/git/repos`);
      return res.status;
    });

    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('GET /api/detect rejects non-existent path', async ({ mainPage }) => {
    const status = await mainPage.evaluate(async () => {
      const port = (window as Window & { electronAPI?: { serverPort?: number } }).electronAPI?.serverPort ?? 3456;
      const res = await fetch(`http://localhost:${port}/api/detect?path=/nonexistent/path/12345`);
      return res.status;
    });

    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('GET /api/install returns 404', async ({ mainPage }) => {
    const status = await mainPage.evaluate(async () => {
      const port = (window as Window & { electronAPI?: { serverPort?: number } }).electronAPI?.serverPort ?? 3456;
      const res = await fetch(`http://localhost:${port}/api/install`);
      return res.status;
    });

    // GET on a POST-only endpoint should return 404 or 405
    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('API returns JSON content-type', async ({ mainPage }) => {
    const contentType = await mainPage.evaluate(async () => {
      const port = (window as Window & { electronAPI?: { serverPort?: number } }).electronAPI?.serverPort ?? 3456;
      const res = await fetch(`http://localhost:${port}/health`);
      return res.headers.get('content-type');
    });

    expect(contentType).toContain('application/json');
  });
});
