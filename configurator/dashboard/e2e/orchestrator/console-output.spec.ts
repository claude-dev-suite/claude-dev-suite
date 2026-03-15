// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';
import { waitForOrchestrator } from '../fixtures/helpers';

const test = createInstalledTest({ tmpPrefix: 'devsuite-e2e-console-' });

test.describe('Orchestrator — Console Output', () => {
  test.beforeEach(async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);
  });

  test('console area is visible', async ({ mainPage }) => {
    const console = mainPage.locator('[data-tutorial="console-area"]');
    await expect(console).toBeVisible();
  });

  test('console shows placeholder text', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    const hasPlaceholder =
      pageContent?.includes('Console output will appear here') ||
      pageContent?.includes('Claude Output');
    expect(hasPlaceholder).toBeTruthy();
  });

  test('console resize buttons are present (Small, Medium, Large)', async ({ mainPage }) => {
    // The size buttons use title attributes for their labels
    const smallBtn = mainPage.locator('button[title="Small (200px)"]');
    const mediumBtn = mainPage.locator('button[title="Medium (300px)"]');
    const largeBtn = mainPage.locator('button[title="Large (450px)"]');

    expect(await smallBtn.count()).toBeGreaterThan(0);
    expect(await mediumBtn.count()).toBeGreaterThan(0);
    expect(await largeBtn.count()).toBeGreaterThan(0);
  });

  test('Clear Output button is visible', async ({ mainPage }) => {
    const clearBtn = mainPage.locator('button:has-text("Clear Output")');
    const count = await clearBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  test('fullscreen toggle button is present', async ({ mainPage }) => {
    // The fullscreen button uses ⛶ character
    const fullscreenBtn = mainPage.locator('button:has-text("⛶")');
    const count = await fullscreenBtn.count();
    expect(count).toBeGreaterThan(0);
  });
});
