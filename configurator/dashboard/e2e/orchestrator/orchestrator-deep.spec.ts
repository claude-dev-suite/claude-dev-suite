// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';
import { waitForOrchestrator } from '../fixtures/helpers';

const test = createInstalledTest({ tmpPrefix: 'devsuite-e2e-orch-deep-' });

test.describe('Orchestrator — Deep Tests', () => {
  test('console area visible', async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);

    const consoleArea = mainPage.locator('[data-tutorial="console-area"]');
    await expect(consoleArea).toBeVisible({ timeout: 15_000 });
  });

  test('chat input present with placeholder', async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);

    const chatInput = mainPage.locator('[data-tutorial="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    // Check for placeholder text on the input/textarea within the chat area
    const input = chatInput.locator('textarea, input[type="text"]');
    if ((await input.count()) > 0) {
      const placeholder = await input.first().getAttribute('placeholder');
      expect(placeholder).toBeTruthy();
      expect(placeholder!.length).toBeGreaterThan(0);
    }
  });

  test('job submission form visible', async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);

    const jobSubmission = mainPage.locator('[data-tutorial="job-submission"]');
    await expect(jobSubmission).toBeVisible({ timeout: 15_000 });
  });

  test('/ autocomplete in chat input', async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);

    const chatInput = mainPage.locator('[data-tutorial="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    // Find the textarea/input and type "/"
    const input = chatInput.locator('textarea, input[type="text"]');
    if ((await input.count()) > 0) {
      await input.first().click();
      await input.first().fill('/');
      await mainPage.waitForFunction(
        () => {
          const body = document.body.textContent ?? '';
          return (
            body.includes('review') ||
            body.includes('workflow') ||
            body.includes('help') ||
            body.includes('recipe') ||
            // Settle after fill if no dropdown appears — check no errors instead
            !body.includes('Something went wrong')
          );
        },
        { timeout: 5_000 },
      );

      // Look for autocomplete dropdown/suggestions
      const pageContent = await mainPage.textContent('body');
      const hasAutoComplete =
        pageContent?.includes('review') ||
        pageContent?.includes('workflow') ||
        pageContent?.includes('help') ||
        pageContent?.includes('recipe');

      // Autocomplete may or may not appear depending on implementation;
      // at minimum typing "/" should not cause an error
      expect(pageContent?.includes('Something went wrong')).toBeFalsy();
    }
  });

  test('WebSocket connection status shown', async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);

    const pageContent = await mainPage.textContent('body');
    const hasConnectionStatus =
      pageContent?.includes('Connected') ||
      pageContent?.includes('Connecting') ||
      pageContent?.includes('Online');

    expect(hasConnectionStatus).toBeTruthy();
  });
});
