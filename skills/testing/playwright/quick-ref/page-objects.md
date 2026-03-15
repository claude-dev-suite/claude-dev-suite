# Playwright Page Objects

> **Knowledge Base:** Read `knowledge/playwright/page-objects.md` for complete documentation.

## Basic Page Object

```ts
// pages/LoginPage.ts
import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign in' });
    this.errorMessage = page.getByRole('alert');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectError(message: string) {
    await expect(this.errorMessage).toContainText(message);
  }
}
```

## Using Page Objects

```ts
// tests/login.spec.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

test.describe('Login', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('successful login', async ({ page }) => {
    await loginPage.login('user@example.com', 'password123');
    await expect(page).toHaveURL('/dashboard');
  });

  test('invalid credentials', async () => {
    await loginPage.login('wrong@example.com', 'wrong');
    await loginPage.expectError('Invalid credentials');
  });
});
```

## Page Object with Components

```ts
// components/Header.ts
export class Header {
  constructor(private page: Page) {}

  get userMenu() {
    return this.page.getByRole('button', { name: 'User menu' });
  }

  get logoutButton() {
    return this.page.getByRole('menuitem', { name: 'Logout' });
  }

  async logout() {
    await this.userMenu.click();
    await this.logoutButton.click();
  }
}

// pages/DashboardPage.ts
export class DashboardPage {
  readonly header: Header;

  constructor(page: Page) {
    this.page = page;
    this.header = new Header(page);
  }
}
```

## Fixture Integration

```ts
// fixtures.ts
import { test as base } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';

type Pages = {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
};

export const test = base.extend<Pages>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
});

export { expect } from '@playwright/test';
```

```ts
// tests/dashboard.spec.ts
import { test, expect } from './fixtures';

test('dashboard shows user data', async ({ loginPage, dashboardPage }) => {
  await loginPage.goto();
  await loginPage.login('user@example.com', 'password');

  await expect(dashboardPage.welcomeMessage).toBeVisible();
});
```

## Abstract Base Page

```ts
// pages/BasePage.ts
export abstract class BasePage {
  constructor(protected page: Page) {}

  async waitForPageLoad() {
    await this.page.waitForLoadState('networkidle');
  }

  get header() {
    return new Header(this.page);
  }

  get footer() {
    return new Footer(this.page);
  }
}

// pages/ProductPage.ts
export class ProductPage extends BasePage {
  readonly addToCartButton: Locator;

  constructor(page: Page) {
    super(page);
    this.addToCartButton = page.getByRole('button', { name: 'Add to cart' });
  }
}
```

**Official docs:** https://playwright.dev/docs/pom
