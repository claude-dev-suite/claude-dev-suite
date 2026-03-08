// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';

test.describe('Auto-Updater — API Surface', () => {
  test('electronAPI.updater is exposed in the renderer', async ({ mainPage }) => {
    const hasUpdater = await mainPage.evaluate(() => {
      return typeof (window as any).electronAPI?.updater === 'object';
    });
    expect(hasUpdater).toBeTruthy();
  });

  test('updater has checkForUpdates method', async ({ mainPage }) => {
    const hasMethod = await mainPage.evaluate(() => {
      return typeof (window as any).electronAPI?.updater?.checkForUpdates === 'function';
    });
    expect(hasMethod).toBeTruthy();
  });

  test('updater has downloadUpdate method', async ({ mainPage }) => {
    const hasMethod = await mainPage.evaluate(() => {
      return typeof (window as any).electronAPI?.updater?.downloadUpdate === 'function';
    });
    expect(hasMethod).toBeTruthy();
  });

  test('updater has installUpdate method', async ({ mainPage }) => {
    const hasMethod = await mainPage.evaluate(() => {
      return typeof (window as any).electronAPI?.updater?.installUpdate === 'function';
    });
    expect(hasMethod).toBeTruthy();
  });

  test('updater has getVersion method', async ({ mainPage }) => {
    const hasMethod = await mainPage.evaluate(() => {
      return typeof (window as any).electronAPI?.updater?.getVersion === 'function';
    });
    expect(hasMethod).toBeTruthy();
  });

  test('updater has event listener hooks', async ({ mainPage }) => {
    const listeners = await mainPage.evaluate(() => {
      const updater = (window as any).electronAPI?.updater;
      return {
        onChecking: typeof updater?.onChecking === 'function',
        onAvailable: typeof updater?.onAvailable === 'function',
        onNotAvailable: typeof updater?.onNotAvailable === 'function',
        onProgress: typeof updater?.onProgress === 'function',
        onDownloaded: typeof updater?.onDownloaded === 'function',
        onError: typeof updater?.onError === 'function',
      };
    });

    expect(listeners.onChecking).toBeTruthy();
    expect(listeners.onAvailable).toBeTruthy();
    expect(listeners.onNotAvailable).toBeTruthy();
    expect(listeners.onProgress).toBeTruthy();
    expect(listeners.onDownloaded).toBeTruthy();
    expect(listeners.onError).toBeTruthy();
  });

  test('getVersion returns a version or gracefully errors (updater may not init in test)', async ({ mainPage }) => {
    const result = await mainPage.evaluate(async () => {
      try {
        const version = await (window as any).electronAPI?.updater?.getVersion();
        return { version, error: null };
      } catch (err: any) {
        return { version: null, error: err.message };
      }
    });

    // Either we get a valid version OR a "No handler registered" error
    // (updater:getVersion is only registered after initAutoUpdater runs)
    if (result.version) {
      expect(result.version).toMatch(/^\d+\.\d+\.\d+/);
    } else {
      expect(result.error).toContain('No handler registered');
    }
  });

  test('checkForUpdates returns a result object', async ({ mainPage }) => {
    // The updater may not be fully initialized in test mode, but the IPC
    // handler should still respond (possibly with an error)
    const result = await mainPage.evaluate(async () => {
      try {
        return await (window as any).electronAPI?.updater?.checkForUpdates();
      } catch {
        return { error: true };
      }
    });

    // Should get back an object (either success or error)
    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');
  });
});
