// SPDX-License-Identifier: MIT
/**
 * Shared helpers for E2E tests.
 */

import type { ElectronApplication, Page } from '@playwright/test';

/**
 * Evaluate an expression in the Electron main process.
 */
export async function mainProcessEval<T>(
  app: ElectronApplication,
  fn: (electron: typeof import('electron')) => T,
): Promise<T> {
  return app.evaluate(fn as never);
}

/**
 * Get the BrowserWindow bounds for a page.
 */
export async function getWindowBounds(app: ElectronApplication, page: Page) {
  const bw = await app.browserWindow(page);
  return bw.evaluate((win) => win.getBounds());
}

/**
 * Get the BrowserWindow title for a page.
 */
export async function getWindowTitle(app: ElectronApplication, page: Page) {
  const bw = await app.browserWindow(page);
  return bw.evaluate((win) => win.getTitle());
}

/**
 * Check if a BrowserWindow is visible.
 */
export async function isWindowVisible(app: ElectronApplication, page: Page) {
  const bw = await app.browserWindow(page);
  return bw.evaluate((win) => win.isVisible());
}

/**
 * Check if a BrowserWindow is frameless.
 */
export async function isWindowFrameless(app: ElectronApplication, page: Page) {
  const bw = await app.browserWindow(page);
  // Frameless windows have no menu bar
  return bw.evaluate((win) => {
    // On Windows, frameless = no native frame
    const bounds = win.getBounds();
    const contentBounds = win.getContentBounds();
    // If bounds equals content bounds, it's frameless
    return bounds.width === contentBounds.width && bounds.height === contentBounds.height;
  });
}

/**
 * Wait for a specific number of windows to be open.
 */
export async function waitForWindowCount(
  app: ElectronApplication,
  count: number,
  timeout = 30_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (app.windows().length === count) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Expected ${count} windows, got ${app.windows().length} after ${timeout}ms`);
}

/**
 * Get all console messages from a page (for debugging).
 */
export function collectConsoleLogs(page: Page): string[] {
  const logs: string[] = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  return logs;
}
