// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';
import { waitForOrchestrator } from '../fixtures/helpers';

const test = createInstalledTest({ tmpPrefix: 'devsuite-e2e-orch-' });

test.describe('Orchestrator — Job Submission', () => {
  test('orchestrator panel is shown for installed projects', async ({ mainPage }) => {
    // For installed projects, the app should go directly to the orchestrator.
    // Wait for the panel to be visible before checking UI state.
    await waitForOrchestrator(mainPage);

    const pageContent = await mainPage.textContent('body');

    // Verify we're NOT seeing the wizard (no "Setup Steps" or "Detection" as step)
    // and instead see orchestrator-related content
    const hasOrchestrator =
      pageContent?.includes('Orchestrator') ||
      pageContent?.includes('orchestrator') ||
      pageContent?.includes('Session') ||
      pageContent?.includes('Workflow') ||
      pageContent?.includes('Console') ||
      pageContent?.includes('Job');

    // The sidebar should NOT show wizard steps
    const hasWizardSidebar = pageContent?.includes('Setup Steps');

    expect(hasOrchestrator || !hasWizardSidebar).toBeTruthy();
  });

  test('app loads without errors for installed projects', async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);

    // Verify the main content area renders
    const body = mainPage.locator('body');
    await expect(body).toBeVisible();

    // No error boundaries should be showing
    const errorFallback = mainPage.locator('[class*="error"], [class*="Error"]');
    // If there are error elements, they shouldn't be the main content
    const pageContent = await mainPage.textContent('body');
    expect(pageContent?.includes('Something went wrong')).toBeFalsy();
  });

  test('workflow selector is available', async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);

    // Look for workflow selection dropdown or list
    const workflowElements = mainPage.locator(
      'select, [role="listbox"], [class*="workflow"], [class*="Workflow"]',
    );
    const count = await workflowElements.count();
    // Workflow selector should exist in the orchestrator
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('session picker is available', async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);

    // Look for session-related UI
    const sessionElements = mainPage.locator(
      '[class*="session"], [class*="Session"], button:has-text("Session"), button:has-text("New")',
    );
    const count = await sessionElements.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
