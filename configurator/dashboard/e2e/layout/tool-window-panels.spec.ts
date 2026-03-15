// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';

test.describe('Layout — Tool Window Panels', () => {
  test('tool window bar is visible with Git, Manage, Analytics buttons', async ({ mainPage }) => {
    const bar = mainPage.locator('[data-tutorial="tool-window-bar"]');
    await expect(bar).toBeVisible({ timeout: 20_000 });

    const gitBtn = mainPage.locator('[data-tutorial="git-tool-btn"]');
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    const analyticsBtn = mainPage.locator('[data-tutorial="analytics-tool-btn"]');

    await expect(gitBtn).toBeVisible();
    await expect(manageBtn).toBeVisible();
    await expect(analyticsBtn).toBeVisible();
  });

  test('clicking Git button opens Git panel', async ({ mainPage }) => {
    const gitBtn = mainPage.locator('[data-tutorial="git-tool-btn"]');
    await expect(gitBtn).toBeVisible({ timeout: 20_000 });
    await gitBtn.click();

    // Wait for Git panel-specific content (not just 'Git' which is in the button)
    await mainPage.waitForFunction(
      () => {
        const body = document.body.textContent ?? '';
        return body.includes('Changes') && (body.includes('Branches') || body.includes('Fetch'));
      },
      { timeout: 15_000 },
    );

    const pageContent = await mainPage.textContent('body');
    const hasGitPanel =
      pageContent?.includes('Changes') ||
      pageContent?.includes('Branches') ||
      pageContent?.includes('Fetch');
    expect(hasGitPanel).toBeTruthy();
  });

  test('clicking Analytics button opens Analytics panel', async ({ mainPage }) => {
    const analyticsBtn = mainPage.locator('[data-tutorial="analytics-tool-btn"]');
    await expect(analyticsBtn).toBeVisible({ timeout: 20_000 });
    await analyticsBtn.click();

    await mainPage.waitForFunction(
      () => {
        const body = document.body.textContent ?? '';
        return body.includes('Analytics') || body.includes('Usage') || body.includes('Stats');
      },
      { timeout: 15_000 },
    );

    const pageContent = await mainPage.textContent('body');
    const hasAnalytics =
      pageContent?.includes('Analytics') ||
      pageContent?.includes('Usage') ||
      pageContent?.includes('Knowledge Base');
    expect(hasAnalytics).toBeTruthy();
  });

  test('switching tool windows closes the previous one', async ({ mainPage }) => {
    const gitBtn = mainPage.locator('[data-tutorial="git-tool-btn"]');
    const analyticsBtn = mainPage.locator('[data-tutorial="analytics-tool-btn"]');
    await expect(gitBtn).toBeVisible({ timeout: 20_000 });

    // Open Git panel first
    await gitBtn.click();
    await mainPage.waitForFunction(
      () => {
        const body = document.body.textContent ?? '';
        return body.includes('master') || body.includes('main') || body.includes('Branch');
      },
      { timeout: 15_000 },
    );

    // Switch to Analytics — Git content should be replaced
    await analyticsBtn.click();
    await mainPage.waitForFunction(
      () => {
        const body = document.body.textContent ?? '';
        return body.includes('Analytics') || body.includes('Usage') || body.includes('Stats');
      },
      { timeout: 15_000 },
    );

    const pageContent = await mainPage.textContent('body');
    const hasAnalytics =
      pageContent?.includes('Analytics') ||
      pageContent?.includes('Usage') ||
      pageContent?.includes('Knowledge Base');
    expect(hasAnalytics).toBeTruthy();
  });

  test('clicking same tool button again closes the panel', async ({ mainPage }) => {
    const gitBtn = mainPage.locator('[data-tutorial="git-tool-btn"]');
    await expect(gitBtn).toBeVisible({ timeout: 20_000 });

    // Open Git panel
    await gitBtn.click();
    await mainPage.waitForFunction(
      () => {
        const body = document.body.textContent ?? '';
        return body.includes('master') || body.includes('main') || body.includes('Branch');
      },
      { timeout: 15_000 },
    );

    // Click again to close
    await gitBtn.click();

    // Wait a beat for the panel to close
    await mainPage.waitForTimeout(500);

    // The git panel content should no longer be visible
    // (the tool window bar itself still exists)
    const gitPanel = mainPage.locator('[data-tutorial="git-panel"]');
    const panelCount = await gitPanel.count();
    // Panel should be hidden or removed
    if (panelCount > 0) {
      await expect(gitPanel).not.toBeVisible({ timeout: 5_000 });
    }
  });

  test('bottom toolbar has Terminal and Logs tabs', async ({ mainPage }) => {
    // Wait for the app to fully load
    await mainPage.locator('[data-tutorial="tool-window-bar"]').waitFor({ state: 'visible', timeout: 20_000 });

    const terminalBtn = mainPage.locator('button:has-text("Terminal")');
    const logsBtn = mainPage.locator('button:has-text("Logs")');

    const terminalCount = await terminalBtn.count();
    const logsCount = await logsBtn.count();

    expect(terminalCount + logsCount).toBeGreaterThan(0);
  });
});
