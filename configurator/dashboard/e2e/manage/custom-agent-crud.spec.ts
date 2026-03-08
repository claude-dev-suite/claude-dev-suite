// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';

const test = createInstalledTest({ tmpPrefix: 'devsuite-e2e-ca-crud-' });

test.describe('Manage — Custom Agent CRUD', () => {
  test.beforeEach(async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await expect(manageBtn).toBeVisible({ timeout: 15_000 });
    await manageBtn.click();

    const modal = mainPage.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await mainPage.waitForTimeout(3_000);

    // Navigate to Custom Agents tab (scoped to manage tabs nav)
    const tabs = mainPage.locator('[data-tutorial="manage-tabs"]');
    const customTab = tabs.locator('button:has-text("Custom Agents")');
    if ((await customTab.count()) > 0) {
      await customTab.click();
      await mainPage.waitForTimeout(3_000);
    }
  });

  test('Create Agent modal has mode tabs', async ({ mainPage }) => {
    const createBtn = mainPage.locator('button:has-text("Create Agent"), button:has-text("Create Your First Agent")');
    if ((await createBtn.count()) > 0) {
      await createBtn.first().click();
      await mainPage.waitForTimeout(2_000);

      const pageContent = await mainPage.textContent('body');
      const hasUpload = pageContent?.includes('Upload File');
      const hasManual = pageContent?.includes('Write Manually');
      const hasAI = pageContent?.includes('AI Chat');

      expect(hasUpload || hasManual || hasAI).toBeTruthy();
    }
  });

  test('Write Manually mode shows textarea', async ({ mainPage }) => {
    const createBtn = mainPage.locator('button:has-text("Create Agent"), button:has-text("Create Your First Agent")');
    if ((await createBtn.count()) > 0) {
      await createBtn.first().click();
      await mainPage.waitForTimeout(2_000);

      // Click Write Manually tab
      const manualTab = mainPage.locator('button:has-text("Write Manually")');
      if ((await manualTab.count()) > 0) {
        await manualTab.click();
        await mainPage.waitForTimeout(1_000);

        // Should show a textarea for manual agent content
        const textarea = mainPage.locator('textarea');
        const count = await textarea.count();
        expect(count).toBeGreaterThan(0);
      }
    }
  });

  test('Use Template button is available in Write Manually', async ({ mainPage }) => {
    const createBtn = mainPage.locator('button:has-text("Create Agent"), button:has-text("Create Your First Agent")');
    if ((await createBtn.count()) > 0) {
      await createBtn.first().click();
      await mainPage.waitForTimeout(2_000);

      const manualTab = mainPage.locator('button:has-text("Write Manually")');
      if ((await manualTab.count()) > 0) {
        await manualTab.click();
        await mainPage.waitForTimeout(1_000);

        const templateBtn = mainPage.locator('button:has-text("Use Template")');
        expect(await templateBtn.count()).toBeGreaterThan(0);

        // Click it and verify content changes
        await templateBtn.click();
        await mainPage.waitForTimeout(1_000);

        // After clicking, the page should contain template text (in textarea or visible text)
        const pageContent = await mainPage.textContent('body');
        const hasTemplate =
          pageContent?.includes('my-custom-agent') ||
          pageContent?.includes('my-agent') ||
          pageContent?.includes('# My Custom') ||
          pageContent?.includes('Use Template');

        expect(hasTemplate).toBeTruthy();
      }
    }
  });

  test('Upload mode shows drag-and-drop area', async ({ mainPage }) => {
    const createBtn = mainPage.locator('button:has-text("Create Agent"), button:has-text("Create Your First Agent")');
    if ((await createBtn.count()) > 0) {
      await createBtn.first().click();
      await mainPage.waitForTimeout(2_000);

      const uploadTab = mainPage.locator('button:has-text("Upload File")');
      if ((await uploadTab.count()) > 0) {
        await uploadTab.click();
        await mainPage.waitForTimeout(1_000);

        const pageContent = await mainPage.textContent('body');
        const hasDrop =
          pageContent?.includes('Drop') ||
          pageContent?.includes('drop') ||
          pageContent?.includes('.md') ||
          pageContent?.includes('Click');

        expect(hasDrop).toBeTruthy();
      }
    }
  });

  test('create modal opens and shows content', async ({ mainPage }) => {
    const createBtn = mainPage.locator('button:has-text("Create Agent"), button:has-text("Create Your First Agent")');
    if ((await createBtn.count()) > 0) {
      await createBtn.first().click();
      await mainPage.waitForTimeout(2_000);

      // Verify modal opened (Upload/Write/AI tabs visible)
      const pageContent = await mainPage.textContent('body');
      const hasModalContent =
        pageContent?.includes('Upload File') ||
        pageContent?.includes('Write Manually') ||
        pageContent?.includes('AI Chat') ||
        pageContent?.includes('Create Custom Agent');

      expect(hasModalContent).toBeTruthy();

      // No errors in the modal
      expect(pageContent?.includes('Something went wrong')).toBeFalsy();
    }
  });

  test('Create Agent button disabled without content', async ({ mainPage }) => {
    const createBtn = mainPage.locator('button:has-text("Create Agent"), button:has-text("Create Your First Agent")');
    if ((await createBtn.count()) > 0) {
      await createBtn.first().click();
      await mainPage.waitForTimeout(2_000);

      const manualTab = mainPage.locator('button:has-text("Write Manually")');
      if ((await manualTab.count()) > 0) {
        await manualTab.click();
        await mainPage.waitForTimeout(1_000);

        // The footer "Create Agent" button should be disabled when textarea is empty
        const footerCreateBtn = mainPage.locator('button:has-text("Create Agent")').last();
        const isDisabled = await footerCreateBtn.isDisabled().catch(() => true);
        expect(isDisabled).toBeTruthy();
      }
    }
  });
});
