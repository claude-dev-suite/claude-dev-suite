// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';

test.describe('Electron IPC API', () => {
  test('electronAPI is exposed', async ({ mainPage }) => {
    const hasApi = await mainPage.evaluate(() => {
      return typeof (window as Record<string, unknown>).electronAPI === 'object';
    });

    expect(hasApi).toBe(true);
  });

  test('getVersion returns semver', async ({ mainPage }) => {
    const version = await mainPage.evaluate(async () => {
      const api = (window as Record<string, unknown>).electronAPI as
        | Record<string, (() => Promise<string>) | unknown>
        | undefined;
      if (!api || typeof api.getVersion !== 'function') return null;
      return api.getVersion();
    });

    expect(version).toBeTruthy();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('getProjectPath returns test dir path', async ({ mainPage }) => {
    const projectPath = await mainPage.evaluate(async () => {
      const api = (window as Record<string, unknown>).electronAPI as
        | Record<string, (() => Promise<string>) | unknown>
        | undefined;
      if (!api || typeof api.getProjectPath !== 'function') return null;
      return api.getProjectPath();
    });

    expect(projectPath).toBeTruthy();
    expect(typeof projectPath).toBe('string');
    expect((projectPath as string).length).toBeGreaterThan(0);
  });

  test('platform matches win32', async ({ mainPage }) => {
    const platform = await mainPage.evaluate(() => {
      const api = (window as Record<string, unknown>).electronAPI as
        | Record<string, unknown>
        | undefined;
      return api?.platform;
    });

    expect(platform).toBe('win32');
  });

  test('versions has node, chrome, and electron', async ({ mainPage }) => {
    const versions = await mainPage.evaluate(() => {
      const api = (window as Record<string, unknown>).electronAPI as
        | Record<string, unknown>
        | undefined;
      return api?.versions as Record<string, string> | undefined;
    });

    expect(versions).toBeTruthy();
    expect(typeof versions!.node).toBe('string');
    expect(typeof versions!.chrome).toBe('string');
    expect(typeof versions!.electron).toBe('string');
    expect(versions!.node.length).toBeGreaterThan(0);
    expect(versions!.chrome.length).toBeGreaterThan(0);
    expect(versions!.electron.length).toBeGreaterThan(0);
  });
});
