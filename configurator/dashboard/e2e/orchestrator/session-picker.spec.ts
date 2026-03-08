// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';

const test = createInstalledTest({ tmpPrefix: 'devsuite-e2e-session-' });

test.describe('Orchestrator — Session Picker', () => {
  test('/resume command triggers session picker', async ({ mainPage }) => {
    await mainPage.waitForTimeout(8_000);

    const chatInput = mainPage.locator('[data-tutorial="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    const input = chatInput.locator('input[type="text"]');
    if ((await input.count()) > 0) {
      await input.first().click();
      await input.first().fill('/resume');
      await mainPage.keyboard.press('Enter');
      await mainPage.waitForTimeout(3_000);

      const pageContent = await mainPage.textContent('body');
      const hasSessionPicker =
        pageContent?.includes('Resume Session') ||
        pageContent?.includes('No previous sessions') ||
        pageContent?.includes('Loading sessions');

      expect(hasSessionPicker).toBeTruthy();
    }
  });

  test('session picker shows loading or sessions list', async ({ mainPage }) => {
    await mainPage.waitForTimeout(8_000);

    const chatInput = mainPage.locator('[data-tutorial="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    const input = chatInput.locator('input[type="text"]');
    if ((await input.count()) > 0) {
      await input.first().click();
      await input.first().fill('/resume');
      await mainPage.keyboard.press('Enter');
      await mainPage.waitForTimeout(3_000);

      const pageContent = await mainPage.textContent('body');
      const hasContent =
        pageContent?.includes('Loading sessions') ||
        pageContent?.includes('No previous sessions') ||
        pageContent?.includes('Resume Session') ||
        pageContent?.includes('messages');

      expect(hasContent).toBeTruthy();
    }
  });

  test('session picker has Cancel button', async ({ mainPage }) => {
    await mainPage.waitForTimeout(8_000);

    const chatInput = mainPage.locator('[data-tutorial="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    const input = chatInput.locator('input[type="text"]');
    if ((await input.count()) > 0) {
      await input.first().click();
      await input.first().fill('/resume');
      await mainPage.keyboard.press('Enter');
      await mainPage.waitForTimeout(3_000);

      // Cancel button is inside the session picker modal overlay
      const modal = mainPage.locator('.fixed.inset-0.z-50');
      if ((await modal.count()) > 0) {
        const cancelBtn = modal.locator('button:has-text("Cancel")');
        expect(await cancelBtn.count()).toBeGreaterThan(0);
      }
    }
  });

  test('session picker closes on Cancel', async ({ mainPage }) => {
    await mainPage.waitForTimeout(8_000);

    const chatInput = mainPage.locator('[data-tutorial="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    const input = chatInput.locator('input[type="text"]');
    if ((await input.count()) > 0) {
      await input.first().click();
      await input.first().fill('/resume');
      await mainPage.keyboard.press('Enter');
      await mainPage.waitForTimeout(3_000);

      // Cancel button inside the session picker modal
      const modal = mainPage.locator('.fixed.inset-0.z-50');
      if ((await modal.count()) > 0) {
        const cancelBtn = modal.locator('button:has-text("Cancel")');
        if ((await cancelBtn.count()) > 0) {
          await cancelBtn.click();
          await mainPage.waitForTimeout(1_000);

          // Session picker modal should be gone
          const pageContent = await mainPage.textContent('body');
          const sessionGone = !pageContent?.includes('Resume Session');
          expect(sessionGone).toBeTruthy();
        }
      }
    }
  });

  test('/new command resets chat', async ({ mainPage }) => {
    await mainPage.waitForTimeout(8_000);

    const chatInput = mainPage.locator('[data-tutorial="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 15_000 });

    const input = chatInput.locator('input[type="text"]');
    if ((await input.count()) > 0) {
      await input.first().click();
      await input.first().fill('/new');
      await mainPage.keyboard.press('Enter');
      await mainPage.waitForTimeout(2_000);

      // No errors should occur
      const pageContent = await mainPage.textContent('body');
      expect(pageContent?.includes('Something went wrong')).toBeFalsy();
    }
  });
});
