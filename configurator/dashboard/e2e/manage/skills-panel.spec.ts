// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';
import { waitForManageModal } from '../fixtures/helpers';

const test = createInstalledTest({ tmpPrefix: 'devsuite-e2e-skills-' });

test.describe('Manage — Skills Panel', () => {
  test.beforeEach(async ({ mainPage }) => {
    const manageBtn = mainPage.locator('[data-tutorial="manage-btn"]');
    await expect(manageBtn).toBeVisible({ timeout: 15_000 });
    await manageBtn.click();
    await waitForManageModal(mainPage);

    // Click Skills tab
    const tabs = mainPage.locator('[data-tutorial="manage-tabs"]');
    const skillsTab = tabs.locator('button:has-text("Skills")');
    if ((await skillsTab.count()) > 0) {
      await skillsTab.first().click();
      await mainPage.waitForFunction(
        () => {
          const body = document.body.textContent ?? '';
          return body.includes('Custom Skills') || body.includes('No Custom Skills');
        },
        { timeout: 10_000 },
      );
    }
  });

  test('Skills tab shows Custom Skills heading', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    const hasHeading =
      pageContent?.includes('Custom Skills') ||
      pageContent?.includes('Reusable skill definitions');
    expect(hasHeading).toBeTruthy();
  });

  test('empty state shows No Custom Skills message', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    // Fresh install has no custom skills
    const hasEmptyState =
      pageContent?.includes('No Custom Skills') ||
      pageContent?.includes('Create Your First Skill') ||
      pageContent?.includes('Create custom skills');
    expect(hasEmptyState).toBeTruthy();
  });

  test('Create Skill button is visible', async ({ mainPage }) => {
    const modal = mainPage.locator('.fixed.inset-0.z-50');
    const createBtn = modal.locator('button:has-text("Create Skill")');
    const firstBtn = modal.locator('button:has-text("Create Your First Skill")');

    const count = (await createBtn.count()) + (await firstBtn.count());
    expect(count).toBeGreaterThan(0);
  });

  test('description mentions agent frontmatter reference', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    const hasReference =
      pageContent?.includes('custom/') ||
      pageContent?.includes('agent') ||
      pageContent?.includes('Reusable skill definitions');
    expect(hasReference).toBeTruthy();
  });

  test('Skills panel loads without errors', async ({ mainPage }) => {
    const pageContent = await mainPage.textContent('body');
    expect(pageContent?.includes('Something went wrong')).toBeFalsy();
  });
});
