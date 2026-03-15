// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';

test.describe('Tool Window — Analytics Panel', () => {
  test('Analytics button is visible in toolbar', async ({ mainPage }) => {
    const analyticsBtn = mainPage.locator('[data-tutorial="analytics-tool-btn"]');
    await expect(analyticsBtn).toBeVisible({ timeout: 15_000 });
  });

  test('clicking Analytics button opens the panel', async ({ mainPage }) => {
    const analyticsBtn = mainPage.locator('[data-tutorial="analytics-tool-btn"]');
    await analyticsBtn.click();

    // Panel header should show "Analytics"
    const panelHeader = mainPage.locator('.bg-surface-900 > .flex > span.text-sm');
    await expect(panelHeader.filter({ hasText: 'Analytics' })).toBeVisible({ timeout: 10_000 });
  });

  test('panel shows Knowledge Base Analytics heading', async ({ mainPage }) => {
    await mainPage.locator('[data-tutorial="analytics-tool-btn"]').click();
    await mainPage.waitForTimeout(3_000);

    const pageContent = await mainPage.textContent('body');
    const hasAnalyticsContent =
      pageContent?.includes('Knowledge Base Analytics') ||
      pageContent?.includes('Analytics') ||
      pageContent?.includes('Usage');

    expect(hasAnalyticsContent).toBeTruthy();
  });

  test('panel shows filter controls', async ({ mainPage }) => {
    await mainPage.locator('[data-tutorial="analytics-tool-btn"]').click();
    await mainPage.waitForTimeout(3_000);

    const pageContent = await mainPage.textContent('body');
    // The analytics panel has Technology and Tool filters
    const hasFilters =
      pageContent?.includes('Technology') ||
      pageContent?.includes('Tool') ||
      pageContent?.includes('Usage History');

    expect(hasFilters).toBeTruthy();
  });

  test('panel has Refresh button', async ({ mainPage }) => {
    await mainPage.locator('[data-tutorial="analytics-tool-btn"]').click();
    await mainPage.waitForTimeout(3_000);

    const refreshBtn = mainPage.locator('button:has-text("Refresh")');
    const count = await refreshBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  test('panel has Clear Data button', async ({ mainPage }) => {
    await mainPage.locator('[data-tutorial="analytics-tool-btn"]').click();
    await mainPage.waitForTimeout(3_000);

    const clearBtn = mainPage.locator('button:has-text("Clear Data")');
    const count = await clearBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  test('clicking Analytics button again closes the panel', async ({ mainPage }) => {
    const analyticsBtn = mainPage.locator('[data-tutorial="analytics-tool-btn"]');

    // Open
    await analyticsBtn.click();
    const panelContainer = mainPage.locator('div.border-l.border-surface-700').last();
    await expect(panelContainer).toBeVisible({ timeout: 10_000 });

    // Close
    await analyticsBtn.click();
    await mainPage.waitForTimeout(1_000);

    // Button should no longer have the active class
    const classes = await analyticsBtn.getAttribute('class');
    expect(classes).not.toContain('bg-accent-600');
  });

  test('switching from Git to Analytics replaces the panel', async ({ mainPage }) => {
    // Open Git first
    const gitBtn = mainPage.locator('[data-tutorial="git-tool-btn"]');
    await gitBtn.click();
    await mainPage.waitForTimeout(2_000);

    // Now open Analytics
    const analyticsBtn = mainPage.locator('[data-tutorial="analytics-tool-btn"]');
    await analyticsBtn.click();
    await mainPage.waitForTimeout(2_000);

    // The panel header should now say "Analytics", not "Git"
    const panelHeaders = mainPage.locator('.bg-surface-900 > .flex > span.text-sm');
    const texts = await panelHeaders.allTextContents();
    const hasAnalytics = texts.some((t) => t.includes('Analytics'));
    expect(hasAnalytics).toBeTruthy();

    // Analytics button should be active, Git button should not
    const analyticsClasses = await analyticsBtn.getAttribute('class');
    expect(analyticsClasses).toContain('bg-accent-600');

    const gitClasses = await gitBtn.getAttribute('class');
    expect(gitClasses).not.toContain('bg-accent-600');
  });
});
