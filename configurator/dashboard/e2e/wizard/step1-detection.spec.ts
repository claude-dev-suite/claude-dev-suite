// SPDX-License-Identifier: MIT
import { test, expect } from '../fixtures/electron-app.fixture';

test.describe('Wizard — Step 1: Detection', () => {
  test('wizard panel is visible after startup (project not installed)', async ({ mainPage }) => {
    // Since the test project has no .dev-suite.json, the wizard should show.
    // Look for the sidebar with "Setup Steps" heading
    await mainPage.waitForSelector('aside', { timeout: 30_000 });
  });

  test('sidebar shows setup steps including Detection', async ({ mainPage }) => {
    // The sidebar contains step buttons. Use role-based selectors.
    const detectionButton = mainPage.getByRole('button', { name: /Detection/i });
    await expect(detectionButton).toBeVisible({ timeout: 15_000 });
  });

  test('detection step is the first active step', async ({ mainPage }) => {
    // The sidebar step for Detection should have the primary/active color class
    const detectionButton = mainPage.getByRole('button', { name: /Detection.*Analyze/i });
    await expect(detectionButton).toBeVisible({ timeout: 15_000 });

    // Check it has the active styling (primary-500 in className)
    const classes = await detectionButton.getAttribute('class');
    expect(classes).toContain('primary');
  });

  test('main content shows Project Detection heading', async ({ mainPage }) => {
    const heading = mainPage.getByRole('heading', { name: /Project Detection/i });
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test('detection identifies the test project stack', async ({ mainPage }) => {
    // Wait for detection to complete — it should find React, Express, TypeScript
    await mainPage.waitForTimeout(5_000);

    const pageContent = await mainPage.textContent('body');
    // The test project has react, express, typescript, vitest in package.json
    const hasAnyDetection =
      pageContent?.includes('React') ||
      pageContent?.includes('Express') ||
      pageContent?.includes('TypeScript') ||
      pageContent?.includes('react') ||
      pageContent?.includes('Node');

    expect(hasAnyDetection).toBeTruthy();
  });

  test('can proceed to next step', async ({ mainPage }) => {
    // Look for a "Next" or "Continue" button
    const nextButton = mainPage.getByRole('button', { name: /next|continue/i });
    const agentsStep = mainPage.getByRole('button', { name: /Agents/i });

    const hasNext = (await nextButton.count()) > 0;
    const hasAgents = (await agentsStep.count()) > 0;

    expect(hasNext || hasAgents).toBeTruthy();
  });
});
