---
name: playwright
description: |
  Playwright E2E testing framework. Covers browser automation,
  assertions, and test generation. Use for end-to-end testing.

  USE WHEN: user mentions "playwright", "e2e test", "browser test", "end-to-end", asks about "page.goto", "page.click", "locators", "cross-browser testing", "visual regression"

  DO NOT USE FOR: Unit tests - use `vitest` or `jest`; Component tests - use `testing-library`; API-only tests - use framework HTTP clients; Mobile apps - use specific mobile testing tools
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Playwright Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `playwright` for comprehensive documentation.

## When NOT to Use This Skill

- **Unit Testing** - Use `vitest` or `jest` for isolated function/module tests
- **Component Testing** - Use `testing-library` for React/Vue component tests
- **API-Only Tests** - Use framework-specific HTTP clients or REST clients
- **Performance Testing** - Use dedicated tools like k6 or Lighthouse
- **Mobile App Testing** - Use Appium or Detox for native mobile apps

## Basic Test

```typescript
import { test, expect } from '@playwright/test';

test('user can login', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name="email"]', 'user@example.com');
  await page.fill('[name="password"]', 'password123');
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL('/dashboard');
  await expect(page.locator('h1')).toContainText('Welcome');
});
```

## Locators

```typescript
// By role (preferred)
page.getByRole('button', { name: 'Submit' });
page.getByRole('link', { name: 'Home' });
page.getByLabel('Email');
page.getByPlaceholder('Enter email');
page.getByText('Welcome');

// By test id
page.getByTestId('submit-button');

// CSS/XPath (fallback)
page.locator('.submit-btn');
page.locator('#user-form');
```

## Assertions

```typescript
// Visibility
await expect(locator).toBeVisible();
await expect(locator).toBeHidden();

// Text
await expect(locator).toHaveText('Hello');
await expect(locator).toContainText('Hello');

// Attributes
await expect(locator).toHaveAttribute('href', '/home');
await expect(locator).toHaveClass(/active/);

// Input
await expect(locator).toHaveValue('test@example.com');

// Page
await expect(page).toHaveURL(/dashboard/);
await expect(page).toHaveTitle('Dashboard');
```

## Actions

```typescript
await page.click('button');
await page.fill('input', 'text');
await page.check('input[type="checkbox"]');
await page.selectOption('select', 'option1');
await page.hover('.menu-item');
await page.keyboard.press('Enter');
```

## Page Objects

```typescript
class LoginPage {
  constructor(private page: Page) {}

  async login(email: string, password: string) {
    await this.page.fill('[name="email"]', email);
    await this.page.fill('[name="password"]', password);
    await this.page.click('button[type="submit"]');
  }
}
```

## Config

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
```

## Production Readiness

### Test Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],

  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

### Authentication State

```typescript
// Save auth state for reuse
// auth.setup.ts
import { test as setup } from '@playwright/test';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name="email"]', process.env.TEST_USER_EMAIL!);
  await page.fill('[name="password"]', process.env.TEST_USER_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard');

  // Save storage state
  await page.context().storageState({ path: '.auth/user.json' });
});

// Use in tests
import { test } from '@playwright/test';

test.use({ storageState: '.auth/user.json' });

test('authenticated test', async ({ page }) => {
  await page.goto('/dashboard');
  // Already logged in
});
```

### API Testing

```typescript
test('API test', async ({ request }) => {
  const response = await request.post('/api/users', {
    data: { name: 'John', email: 'john@example.com' },
    headers: { Authorization: `Bearer ${token}` },
  });

  expect(response.ok()).toBeTruthy();
  const user = await response.json();
  expect(user.name).toBe('John');
});

// Mock API responses
test('with mocked API', async ({ page }) => {
  await page.route('/api/users', async route => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify([{ id: 1, name: 'Mock User' }]),
    });
  });

  await page.goto('/users');
  await expect(page.getByText('Mock User')).toBeVisible();
});
```

### Visual Regression

```typescript
test('visual regression', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveScreenshot('dashboard.png', {
    maxDiffPixels: 100,
    threshold: 0.2,
  });
});

// Update snapshots: npx playwright test --update-snapshots
```

### CI Configuration

```yaml
# GitHub Actions
- name: Install Playwright
  run: npx playwright install --with-deps

- name: Run E2E tests
  run: npx playwright test
  env:
    BASE_URL: ${{ secrets.STAGING_URL }}

- name: Upload report
  uses: actions/upload-artifact@v3
  if: always()
  with:
    name: playwright-report
    path: playwright-report/
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| E2E test pass rate | > 99% |
| Test execution time | < 10min |
| Flaky test rate | < 1% |
| Visual diff failures | Review all |

### Checklist

- [ ] Multi-browser testing configured
- [ ] Mobile viewport testing
- [ ] Authentication state reused
- [ ] Retry on failure (CI only)
- [ ] Screenshots on failure
- [ ] Trace collection enabled
- [ ] API mocking for isolation
- [ ] Visual regression tests
- [ ] CI/CD integration
- [ ] Test parallelization
- [ ] Page Object pattern used

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Testing via CSS selectors | Brittle, breaks on style changes | Use getByRole, getByLabel, getByTestId |
| Not waiting for elements | Flaky tests | Use auto-waiting locators, avoid waitForTimeout |
| Hardcoded waits (page.waitForTimeout) | Slow, unreliable | Use page.waitForSelector or auto-waiting |
| No Page Object Model | Duplicated code, hard to maintain | Extract common actions into Page Objects |
| Testing too much in one test | Hard to debug failures | One user flow per test |
| Not reusing auth state | Slow login for every test | Save storageState, reuse across tests |
| Ignoring flaky tests | False confidence | Fix flaky tests, use retries sparingly |

## Quick Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| "Timeout waiting for selector" | Element not rendered or wrong selector | Check selector, ensure element exists |
| Flaky test (passes/fails randomly) | Race condition, slow network | Use auto-waiting, avoid waitForTimeout |
| "Element is not visible" | Element hidden or not in viewport | Scroll into view, check CSS display |
| "Execution context destroyed" | Navigation happened during action | Wait for navigation to complete |
| Screenshot mismatch | Font rendering, animation | Disable animations, use fixed viewport |
| Test hangs forever | Missing await | Ensure all async calls are awaited |

## Reference Documentation
- [Locators](quick-ref/locators.md)
- [Page Objects](quick-ref/page-objects.md)
