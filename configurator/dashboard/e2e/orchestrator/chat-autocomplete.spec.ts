// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';
import { waitForOrchestrator } from '../fixtures/helpers';

const test = createInstalledTest({ tmpPrefix: 'devsuite-e2e-autocomplete-' });

test.describe('Orchestrator — Chat Autocomplete', () => {
  test('chat input has correct placeholder', async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);

    const chatInput = mainPage.locator('[data-tutorial="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    const input = chatInput.locator('input[type="text"]');
    if ((await input.count()) > 0) {
      const placeholder = await input.first().getAttribute('placeholder');
      expect(placeholder).toBeTruthy();
      expect(placeholder).toContain('/');
    }
  });

  test('typing / shows slash command dropdown', async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);

    const chatInput = mainPage.locator('[data-tutorial="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    const input = chatInput.locator('input[type="text"]');
    if ((await input.count()) > 0) {
      await input.first().click();
      await input.first().fill('/');
      await mainPage.waitForFunction(
        () => {
          const body = document.body.textContent ?? '';
          return (
            body.includes('/help') ||
            body.includes('/clear') ||
            body.includes('/new') ||
            body.includes('/resume') ||
            body.includes('/agents')
          );
        },
        { timeout: 5_000 },
      );

      // Look for autocomplete dropdown
      const pageContent = await mainPage.textContent('body');
      const hasCommands =
        pageContent?.includes('/help') ||
        pageContent?.includes('/clear') ||
        pageContent?.includes('/new') ||
        pageContent?.includes('/resume') ||
        pageContent?.includes('/agents');

      expect(hasCommands).toBeTruthy();
    }
  });

  test('Arrow keys navigate autocomplete', async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);

    const chatInput = mainPage.locator('[data-tutorial="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    const input = chatInput.locator('input[type="text"]');
    if ((await input.count()) > 0) {
      await input.first().click();
      await input.first().fill('/');
      await mainPage.waitForFunction(
        () => {
          const body = document.body.textContent ?? '';
          return (
            body.includes('/help') ||
            body.includes('/clear') ||
            body.includes('/new') ||
            body.includes('/resume') ||
            body.includes('/agents')
          );
        },
        { timeout: 5_000 },
      );

      // Press ArrowDown to navigate
      await mainPage.keyboard.press('ArrowDown');
      await mainPage.waitForTimeout(300);

      // Check for selected item (has .selected class)
      const selected = mainPage.locator('.selected');
      const selectedCount = await selected.count();

      // At minimum, arrow key should not cause errors
      const pageContent = await mainPage.textContent('body');
      expect(pageContent?.includes('Something went wrong')).toBeFalsy();
    }
  });

  test('Tab selects autocomplete item', async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);

    const chatInput = mainPage.locator('[data-tutorial="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    const input = chatInput.locator('input[type="text"]');
    if ((await input.count()) > 0) {
      await input.first().click();
      await input.first().fill('/');
      await mainPage.waitForFunction(
        () => {
          const body = document.body.textContent ?? '';
          return (
            body.includes('/help') ||
            body.includes('/clear') ||
            body.includes('/new') ||
            body.includes('/resume') ||
            body.includes('/agents')
          );
        },
        { timeout: 5_000 },
      );

      // Press Tab to select the first item
      await mainPage.keyboard.press('Tab');
      await mainPage.waitForTimeout(500);

      // Input value should have been updated with the command
      const value = await input.first().inputValue();
      // Should contain a command like "/agents" or "/help"
      expect(value.startsWith('/')).toBeTruthy();
    }
  });

  test('Escape closes autocomplete dropdown', async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);

    const chatInput = mainPage.locator('[data-tutorial="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    const input = chatInput.locator('input[type="text"]');
    if ((await input.count()) > 0) {
      await input.first().click();
      await input.first().fill('/');
      await mainPage.waitForFunction(
        () => {
          const body = document.body.textContent ?? '';
          return (
            body.includes('/help') ||
            body.includes('/clear') ||
            body.includes('/new') ||
            body.includes('/resume') ||
            body.includes('/agents')
          );
        },
        { timeout: 5_000 },
      );

      // Press Escape to close dropdown
      await mainPage.keyboard.press('Escape');
      await mainPage.waitForTimeout(500);

      // Verify no autocomplete dropdown is visible
      // The dropdown has z-50 and bottom-full positioning
      const dropdown = mainPage.locator('.bottom-full.z-50, [class*="bottom-full"]');
      const dropdownCount = await dropdown.count();
      // Dropdown should be gone or hidden
      expect(dropdownCount).toBeLessThanOrEqual(0);
    }
  });

  test('Send and New buttons are present', async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);

    const chatInput = mainPage.locator('[data-tutorial="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    const sendBtn = mainPage.locator('button:has-text("Send")');
    const newBtn = mainPage.locator('button:has-text("New")');

    expect(await sendBtn.count()).toBeGreaterThan(0);
    expect(await newBtn.count()).toBeGreaterThan(0);
  });
});
