# Playwright Locators

> **Knowledge Base:** Read `knowledge/playwright/locators.md` for complete documentation.

## Recommended Locators

```ts
// By role (best practice)
page.getByRole('button', { name: 'Submit' });
page.getByRole('textbox', { name: 'Email' });
page.getByRole('link', { name: /learn more/i });
page.getByRole('heading', { level: 1 });

// By label
page.getByLabel('Email');
page.getByLabel('Password');

// By placeholder
page.getByPlaceholder('Enter your email');

// By text
page.getByText('Welcome');
page.getByText(/welcome/i); // Regex

// By title
page.getByTitle('Close');

// By alt text
page.getByAltText('Company logo');

// By test ID
page.getByTestId('submit-button');
```

## CSS & XPath

```ts
// CSS selector
page.locator('.submit-btn');
page.locator('#email-input');
page.locator('[data-testid="card"]');
page.locator('button.primary:visible');

// XPath
page.locator('xpath=//button[contains(text(), "Submit")]');
```

## Filtering

```ts
// Filter by text
page.getByRole('listitem').filter({ hasText: 'Product 1' });

// Filter by child locator
page.getByRole('listitem').filter({
  has: page.getByRole('button', { name: 'Buy' })
});

// Filter by not having
page.getByRole('listitem').filter({
  hasNot: page.getByText('Out of stock')
});

// Chain filters
page.getByRole('listitem')
  .filter({ hasText: 'Electronics' })
  .filter({ has: page.getByText('$') });
```

## Multiple Elements

```ts
// Get all matching
const items = page.getByRole('listitem');
await expect(items).toHaveCount(5);

// First, last, nth
await items.first().click();
await items.last().click();
await items.nth(2).click();
```

## Chaining

```ts
// Parent to child
page.getByRole('article').getByRole('button');

// Inside specific container
const card = page.locator('.card').filter({ hasText: 'Featured' });
await card.getByRole('button', { name: 'Buy' }).click();
```

## Frame Locators

```ts
// Locate inside iframe
const frame = page.frameLocator('#my-iframe');
await frame.getByRole('button').click();

// Nested frames
page.frameLocator('#outer').frameLocator('#inner').getByText('Hello');
```

## Waiting

```ts
// Auto-waits for visible and enabled
await page.getByRole('button').click();

// Explicit wait
await page.getByRole('dialog').waitFor();
await page.getByRole('dialog').waitFor({ state: 'hidden' });

// Wait for condition
await expect(page.getByRole('button')).toBeEnabled();
await expect(page.getByRole('button')).toBeVisible();
```

## Best Practices

```html
<!-- Add test IDs for complex elements -->
<button data-testid="checkout-button">Checkout</button>

<!-- Use accessible names -->
<button aria-label="Close dialog">X</button>

<!-- Labels for form fields -->
<label for="email">Email</label>
<input id="email" type="email" />
```

**Official docs:** https://playwright.dev/docs/locators
