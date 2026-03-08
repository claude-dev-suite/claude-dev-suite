// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';

const test = createInstalledTest({ tmpPrefix: 'devsuite-e2e-console-' });

test.describe('Orchestrator — Console Controls', () => {
  test('console header shows Claude Output', async ({ mainPage }) => {
    await mainPage.waitForTimeout(8_000);

    const consoleArea = mainPage.locator('[data-tutorial="console-area"]');
    await expect(consoleArea).toBeVisible({ timeout: 15_000 });

    const pageContent = await consoleArea.textContent();
    const hasLabel =
      pageContent?.includes('Claude Output') || pageContent?.includes('Console');

    expect(hasLabel).toBeTruthy();
  });

  test('console size buttons are visible', async ({ mainPage }) => {
    await mainPage.waitForTimeout(8_000);

    const consoleArea = mainPage.locator('[data-tutorial="console-area"]');
    await expect(consoleArea).toBeVisible({ timeout: 15_000 });

    // Traffic-light style size buttons
    const smallBtn = mainPage.locator('[title="Small (200px)"]');
    const medBtn = mainPage.locator('[title="Medium (300px)"]');
    const largeBtn = mainPage.locator('[title="Large (450px)"]');

    const totalCount =
      (await smallBtn.count()) + (await medBtn.count()) + (await largeBtn.count());

    expect(totalCount).toBeGreaterThanOrEqual(3);
  });

  test('fullscreen toggle button exists', async ({ mainPage }) => {
    await mainPage.waitForTimeout(8_000);

    const fullscreenBtn = mainPage.locator('[title="Toggle Fullscreen"]');
    const count = await fullscreenBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Execute Job button is present', async ({ mainPage }) => {
    await mainPage.waitForTimeout(8_000);

    const executeBtn = mainPage.locator('button:has-text("Execute Job")');
    const count = await executeBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Reset button is present', async ({ mainPage }) => {
    await mainPage.waitForTimeout(8_000);

    const resetBtn = mainPage.locator('button:has-text("Reset")');
    const count = await resetBtn.count();
    expect(count).toBeGreaterThan(0);
  });
});
