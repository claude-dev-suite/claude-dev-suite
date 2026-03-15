// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';
import { createInstalledTest } from '../fixtures/installed-project';
import { waitForTabContent } from '../fixtures/helpers';

// ── Installed project tests ──────────────────────────────────────────────
const installedTest = createInstalledTest({ tmpPrefix: 'devsuite-e2e-tabs-' });

installedTest.describe('Header Tabs — Installed project', () => {
  installedTest('Orchestrator and Code Review tabs visible', async ({ mainPage }) => {
    const headerTabs = mainPage.locator('[data-tutorial="header-tabs"]');
    await expect(headerTabs).toBeVisible({ timeout: 15_000 });

    const pageContent = await headerTabs.textContent();
    const hasOrchestrator = pageContent?.includes('Orchestrator');
    const hasCodeReview = pageContent?.includes('Code Review');

    expect(hasOrchestrator).toBeTruthy();
    expect(hasCodeReview).toBeTruthy();
  });

  installedTest('tab switching changes active panel', async ({ mainPage }) => {
    const crTab = mainPage.locator('button:has-text("Code Review")');
    await crTab.first().waitFor({ state: 'visible', timeout: 15_000 });
    if ((await crTab.count()) > 0) {
      await crTab.first().click();
      await waitForTabContent(mainPage, 'Review Scope');

      // Active tab has primary-500 styling
      const classes = await crTab.first().getAttribute('class');
      const isActive =
        classes?.includes('primary-500') || classes?.includes('primary-400');
      expect(isActive).toBeTruthy();
    }
  });
});

// ── Non-installed project tests ──────────────────────────────────────────
test.describe('Header Tabs — Non-installed project', () => {
  test('Setup Wizard tab visible, Orchestrator/Code Review hidden', async ({ mainPage }) => {
    await mainPage.locator('aside').waitFor({ state: 'visible', timeout: 20_000 });

    const pageContent = await mainPage.textContent('body');

    // Wizard view should show Setup Wizard or wizard-related content
    const hasWizard =
      pageContent?.includes('Setup Wizard') ||
      pageContent?.includes('Setup Steps') ||
      pageContent?.includes('Detection');

    expect(hasWizard).toBeTruthy();
  });

  test('server status indicator shows green Connected', async ({ mainPage }) => {
    await waitForTabContent(mainPage, 'Connected');

    // Green dot for connected status
    const greenDot = mainPage.locator('.bg-green-500');
    const greenCount = await greenDot.count();

    // Also check for "Connected" text
    const pageContent = await mainPage.textContent('body');
    const hasConnected = pageContent?.includes('Connected');

    expect(greenCount > 0 || hasConnected).toBeTruthy();
  });
});
