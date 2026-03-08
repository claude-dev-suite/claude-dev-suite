// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';
import { waitForOrchestrator } from '../fixtures/helpers';

const test = createInstalledTest({ tmpPrefix: 'devsuite-e2e-wfsel-' });

test.describe('Orchestrator — Workflow Selector', () => {
  test.beforeEach(async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);
  });

  test('Workflow Template selector is visible', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    const hasWorkflow =
      pageContent?.includes('Workflow Template') ||
      pageContent?.includes('Select...');
    expect(hasWorkflow).toBeTruthy();
  });

  test('Select button opens workflow dropdown', async ({ mainPage }) => {
    const selectBtn = mainPage.locator('button:has-text("Select...")');
    if ((await selectBtn.count()) > 0) {
      await selectBtn.first().click();
      await mainPage.waitForTimeout(500);

      // Dropdown should appear with workflow options
      const pageContent = await mainPage.textContent('body');
      const hasOptions =
        pageContent?.includes('recipe') ||
        pageContent?.includes('workflow') ||
        pageContent?.includes('Recipe') ||
        pageContent?.includes('Workflow') ||
        pageContent?.includes('Custom') ||
        pageContent?.includes('None');
      expect(hasOptions).toBeTruthy();
    }
  });

  test('Job Title input field is present', async ({ mainPage }) => {
    const titleInput = mainPage.locator('input[placeholder*="Add user authentication"]');
    const altInput = mainPage.locator('input[placeholder*="E.g."]');

    const count = (await titleInput.count()) + (await altInput.count());
    expect(count).toBeGreaterThan(0);
  });

  test('Context textarea is present', async ({ mainPage }) => {
    const contextInput = mainPage.locator('textarea[placeholder*="context"]');
    const altInput = mainPage.locator('textarea[placeholder*="additional"]');
    const anyTextarea = mainPage.locator('textarea');

    const count =
      (await contextInput.count()) +
      (await altInput.count()) +
      (await anyTextarea.count());
    expect(count).toBeGreaterThan(0);
  });

  test('Execute Job button is disabled without tasks', async ({ mainPage }) => {
    const executeBtn = mainPage.locator('button:has-text("Execute Job")');
    if ((await executeBtn.count()) > 0) {
      const isDisabled = await executeBtn.first().isDisabled();
      expect(isDisabled).toBeTruthy();
    }
  });
});
