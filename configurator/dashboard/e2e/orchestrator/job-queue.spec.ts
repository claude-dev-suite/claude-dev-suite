// SPDX-License-Identifier: MIT
import { createInstalledTest, expect } from '../fixtures/installed-project';
import { waitForOrchestrator } from '../fixtures/helpers';

const test = createInstalledTest({ tmpPrefix: 'devsuite-e2e-queue-' });

test.describe('Orchestrator — Job Queue', () => {
  test('Job Queue panel is visible', async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);

    const pageContent = await mainPage.textContent('body');
    const hasQueue =
      pageContent?.includes('Queue') ||
      pageContent?.includes('queue') ||
      pageContent?.includes('Job');

    expect(hasQueue).toBeTruthy();
  });

  test('empty queue shows Queue is empty when expanded', async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);

    // Queue is collapsed by default — click header to expand
    const queueHeader = mainPage.locator('button:has-text("Job Queue")');
    if ((await queueHeader.count()) > 0) {
      await queueHeader.click();
      await mainPage.waitForFunction(
        () => {
          const body = document.body.textContent ?? '';
          return (
            body.includes('Queue is empty') ||
            body.includes('No jobs running') ||
            body.includes('No jobs') ||
            body.includes('Refresh')
          );
        },
        { timeout: 10_000 },
      );
    }

    const pageContent = await mainPage.textContent('body');
    const hasEmpty =
      pageContent?.includes('Queue is empty') ||
      pageContent?.includes('No jobs running') ||
      pageContent?.includes('No jobs');

    expect(hasEmpty).toBeTruthy();
  });

  test('expanded queue has Refresh button', async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);

    // Expand the queue panel
    const queueHeader = mainPage.locator('button:has-text("Job Queue")');
    if ((await queueHeader.count()) > 0) {
      await queueHeader.click();
      await mainPage.waitForFunction(
        () => {
          const body = document.body.textContent ?? '';
          return body.includes('Refresh') || body.includes('Queue is empty');
        },
        { timeout: 10_000 },
      );
    }

    const refreshBtn = mainPage.locator('button:has-text("Refresh")');
    const count = await refreshBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  test('expanded queue has Clear Queue button', async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);

    // Expand the queue panel
    const queueHeader = mainPage.locator('button:has-text("Job Queue")');
    if ((await queueHeader.count()) > 0) {
      await queueHeader.click();
      await mainPage.waitForFunction(
        () => {
          const body = document.body.textContent ?? '';
          return body.includes('Clear') || body.includes('Queue is empty');
        },
        { timeout: 10_000 },
      );
    }

    const pageContent = await mainPage.textContent('body');
    const hasClear =
      pageContent?.includes('Clear Queue') || pageContent?.includes('Clear');

    expect(hasClear).toBeTruthy();
  });

  test('expanded queue has Force Unstick button', async ({ mainPage }) => {
    await waitForOrchestrator(mainPage);

    // Expand the queue panel
    const queueHeader = mainPage.locator('button:has-text("Job Queue")');
    if ((await queueHeader.count()) > 0) {
      await queueHeader.click();
      await mainPage.waitForFunction(
        () => {
          const body = document.body.textContent ?? '';
          return body.includes('Unstick') || body.includes('Queue is empty');
        },
        { timeout: 10_000 },
      );
    }

    const pageContent = await mainPage.textContent('body');
    const hasForceUnstick =
      pageContent?.includes('Force Unstick') || pageContent?.includes('Unstick');

    expect(hasForceUnstick).toBeTruthy();
  });
});
