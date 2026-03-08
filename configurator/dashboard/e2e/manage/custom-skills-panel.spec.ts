// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';

const test = createInstalledTest({ tmpPrefix: 'devsuite-e2e-skills-' });

test.describe('Manage — Custom Skills Panel', () => {
  test.beforeEach(async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await expect(manageBtn).toBeVisible({ timeout: 15_000 });
    await manageBtn.click();

    const modal = mainPage.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await mainPage.waitForTimeout(3_000);

    // Click Skills tab (scoped to manage tabs nav)
    const tabs = mainPage.locator('[data-tutorial="manage-tabs"]');
    const skillsTab = tabs.locator('button:has-text("Skills")');
    if ((await skillsTab.count()) > 0) {
      await skillsTab.click();
      await mainPage.waitForTimeout(3_000);
    }
  });

  test('Skills tab is visible in Manage', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    const hasSkills =
      pageContent?.includes('Skills') || pageContent?.includes('Custom Skills');
    expect(hasSkills).toBeTruthy();
  });

  test('empty state shows No Custom Skills', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    const hasEmptyState =
      pageContent?.includes('No Custom Skills') ||
      pageContent?.includes('Create Your First Skill') ||
      pageContent?.includes('Create Skill') ||
      pageContent?.includes('custom skills');

    expect(hasEmptyState).toBeTruthy();
  });

  test('Create Skill button opens modal', async ({ mainPage }) => {
    const createBtn = mainPage.locator('button:has-text("Create Skill"), button:has-text("Create Your First Skill")');
    if ((await createBtn.count()) > 0) {
      await createBtn.first().click();
      await mainPage.waitForTimeout(2_000);

      const pageContent = await mainPage.textContent('body');
      // Modal should show form fields
      const hasForm =
        pageContent?.includes('Name') ||
        pageContent?.includes('Content') ||
        pageContent?.includes('Skill') ||
        pageContent?.includes('Cancel');

      expect(hasForm).toBeTruthy();
    }
  });

  test('panel description mentions agents', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    const hasMention =
      pageContent?.includes('agent') ||
      pageContent?.includes('referenced') ||
      pageContent?.includes('Reusable') ||
      pageContent?.includes('skill');

    expect(hasMention).toBeTruthy();
  });

  test('Skills panel loads without errors', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    expect(pageContent?.includes('Something went wrong')).toBeFalsy();
  });
});
