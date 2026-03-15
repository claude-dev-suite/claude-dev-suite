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

/**
 * Wait for the orchestrator panel to fully load (installed project).
 * Replaces `waitForTimeout(8_000)` in orchestrator tests.
 */
export async function waitForOrchestrator(page: Page, timeout = 20_000): Promise<void> {
  await page.locator('[data-tutorial="console-area"]').waitFor({ state: 'visible', timeout });
}

/**
 * Wait for the Manage modal content to load after opening.
 * Replaces `waitForTimeout(3_000)` after clicking manage-btn.
 */
export async function waitForManageModal(page: Page, timeout = 15_000): Promise<void> {
  await page.locator('.fixed.inset-0.z-50').waitFor({ state: 'visible', timeout });
  // Wait for tabs to render inside the modal
  await page.locator('[data-tutorial="manage-tabs"]').waitFor({ state: 'visible', timeout });
}

/**
 * Wait for a manage sub-tab to load after clicking it.
 * Replaces `waitForTimeout(3_000-5_000)` after tab click.
 */
export async function waitForTabContent(page: Page, contentText: string, timeout = 15_000): Promise<void> {
  await page.waitForFunction(
    (text) => document.body.textContent?.includes(text) ?? false,
    contentText,
    { timeout },
  );
}

/**
 * Wait for the git panel to load after opening.
 * Replaces `waitForTimeout(3_000-5_000)` after clicking git-tool-btn.
 */
export async function waitForGitPanel(page: Page, timeout = 15_000): Promise<void> {
  await page.locator('[data-tutorial="git-panel"]').waitFor({ state: 'visible', timeout });
  // Wait for branch info to load
  await page.waitForFunction(
    () => {
      const body = document.body.textContent ?? '';
      return body.includes('master') || body.includes('main');
    },
    { timeout },
  );
}
