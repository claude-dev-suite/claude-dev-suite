---
name: cypress
description: |
  Cypress E2E testing framework. Covers commands, assertions, and
  component testing. Use for end-to-end testing.

  USE WHEN: user mentions "cypress", "e2e test", "cy.get", "cy.visit", asks about "cypress intercept", "component testing", "cypress commands"

  DO NOT USE FOR: Unit tests - use `vitest` or `jest`; Multi-tab scenarios - Cypress doesn't support; Native mobile apps - use Appium; Performance testing - use dedicated tools
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Cypress Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `cypress` for comprehensive documentation.

## When NOT to Use This Skill

- **Unit Testing** - Use `vitest` or `jest` for isolated tests
- **Multi-Tab Scenarios** - Cypress doesn't support multiple tabs
- **Native Mobile Apps** - Use Appium or Detox
- **Multi-Browser Testing** - Limited browser support compared to Playwright
- **Performance Testing** - Use k6, Lighthouse, or dedicated tools

## Basic Test

```typescript
describe('Login', () => {
  beforeEach(() => {
    cy.visit('/login');
  });

  it('should login successfully', () => {
    cy.get('[data-testid="email"]').type('user@example.com');
    cy.get('[data-testid="password"]').type('password123');
    cy.get('button[type="submit"]').click();

    cy.url().should('include', '/dashboard');
    cy.contains('Welcome back').should('be.visible');
  });

  it('should show error for invalid credentials', () => {
    cy.get('[data-testid="email"]').type('wrong@example.com');
    cy.get('[data-testid="password"]').type('wrong');
    cy.get('button[type="submit"]').click();

    cy.contains('Invalid credentials').should('be.visible');
  });
});
```

## Commands

```typescript
// Selection
cy.get('.class');
cy.get('#id');
cy.get('[data-testid="element"]');
cy.contains('text');
cy.find('.child');

// Actions
cy.click();
cy.type('text');
cy.clear();
cy.check();
cy.select('option');
cy.scrollIntoView();

// Navigation
cy.visit('/page');
cy.go('back');
cy.reload();
```

## Assertions

```typescript
cy.get('element')
  .should('be.visible')
  .should('have.text', 'Hello')
  .should('have.class', 'active')
  .should('have.attr', 'href', '/home')
  .should('have.length', 3)
  .should('contain', 'text')
  .should('not.exist');

// Chained
cy.get('input').should('have.value', 'test').and('be.disabled');
```

## Custom Commands

```typescript
// cypress/support/commands.ts
Cypress.Commands.add('login', (email: string, password: string) => {
  cy.visit('/login');
  cy.get('[data-testid="email"]').type(email);
  cy.get('[data-testid="password"]').type(password);
  cy.get('button[type="submit"]').click();
});

// Usage
cy.login('user@example.com', 'password');
```

## Intercept API

```typescript
cy.intercept('GET', '/api/users', { fixture: 'users.json' }).as('getUsers');
cy.visit('/users');
cy.wait('@getUsers');

cy.intercept('POST', '/api/users', { statusCode: 201 }).as('createUser');
```

## Production Readiness

### Configuration

```typescript
// cypress.config.ts
import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: true,
    screenshotOnRunFailure: true,
    retries: {
      runMode: 2,      // CI retries
      openMode: 0,     // Local retries
    },
    env: {
      apiUrl: 'http://localhost:3000/api',
    },
  },
  component: {
    devServer: {
      framework: 'react',
      bundler: 'vite',
    },
  },
});
```

### Authentication

```typescript
// cypress/support/commands.ts
Cypress.Commands.add('login', (email: string, password: string) => {
  // Programmatic login (faster than UI)
  cy.request({
    method: 'POST',
    url: '/api/auth/login',
    body: { email, password },
  }).then(({ body }) => {
    window.localStorage.setItem('token', body.token);
  });
});

// Preserve auth between tests
Cypress.Commands.add('preserveAuth', () => {
  cy.getCookie('session').then(cookie => {
    if (cookie) {
      Cypress.Cookies.preserveOnce('session');
    }
  });
});

// Usage
beforeEach(() => {
  cy.login(Cypress.env('TEST_USER'), Cypress.env('TEST_PASS'));
});
```

### API Testing & Mocking

```typescript
// Intercept and mock
cy.intercept('GET', '/api/users', { fixture: 'users.json' }).as('getUsers');
cy.intercept('POST', '/api/users', (req) => {
  req.reply({
    statusCode: 201,
    body: { id: '123', ...req.body },
  });
}).as('createUser');

// Wait for API calls
cy.wait('@getUsers').its('response.statusCode').should('eq', 200);

// Spy without mocking
cy.intercept('GET', '/api/users').as('getUsers');
cy.wait('@getUsers').then((interception) => {
  expect(interception.response.body).to.have.length.greaterThan(0);
});
```

### CI Configuration

```yaml
# GitHub Actions
- name: Cypress run
  uses: cypress-io/github-action@v5
  with:
    build: npm run build
    start: npm start
    wait-on: 'http://localhost:3000'
    record: true
  env:
    CYPRESS_RECORD_KEY: ${{ secrets.CYPRESS_RECORD_KEY }}

- name: Upload screenshots
  uses: actions/upload-artifact@v3
  if: failure()
  with:
    name: cypress-screenshots
    path: cypress/screenshots
```

### Network Handling

```typescript
// Handle slow networks
cy.intercept('/api/**', (req) => {
  req.on('response', (res) => {
    res.setDelay(1000); // Simulate slow response
  });
});

// Handle offline
cy.intercept('/api/**', { forceNetworkError: true });

// Retry failed requests
cy.request({
  url: '/api/data',
  retryOnStatusCodeFailure: true,
  retryOnNetworkFailure: true,
});
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| E2E test pass rate | > 99% |
| Test execution time | < 15min |
| Flaky test rate | < 1% |
| Video review on failure | 100% |

### Best Practices

```typescript
// Use data-testid for stable selectors
cy.get('[data-testid="submit-btn"]').click();

// Avoid arbitrary waits
// BAD: cy.wait(5000)
// GOOD: cy.get('[data-testid="result"]').should('be.visible')

// Chain assertions
cy.get('form')
  .should('be.visible')
  .find('input')
  .should('have.length', 3);

// Custom assertions
cy.get('@createUser')
  .its('request.body')
  .should('deep.include', { name: 'John' });
```

### Checklist

- [ ] Programmatic login (not UI)
- [ ] API interception for isolation
- [ ] Retry configuration for CI
- [ ] Video recording enabled
- [ ] Screenshots on failure
- [ ] data-testid for selectors
- [ ] No arbitrary cy.wait()
- [ ] Custom commands for reuse
- [ ] CI/CD with Cypress Dashboard
- [ ] Environment variables secured

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Arbitrary cy.wait(5000) | Slow, unreliable | Use cy.intercept aliases and cy.wait('@alias') |
| Testing login UI every test | Extremely slow | Use programmatic login or cy.session |
| Selecting by text content | Brittle, breaks on copy changes | Use data-testid or semantic selectors |
| Not using cy.intercept | Tests depend on real API | Mock API responses for speed and reliability |
| Chaining too many assertions | Hard to debug which failed | Break into separate assertions |
| Not cleaning up data | Tests pollute each other | Reset DB state before/after tests |
| Using .then() unnecessarily | Breaks Cypress retry logic | Use built-in commands when possible |

## Quick Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| "element is detached from DOM" | Element re-rendered during action | Use cy.get() again, not stored reference |
| "Timed out retrying" | Element not found or condition not met | Check selector, increase timeout if needed |
| Flaky test | Race condition with API or DOM | Use cy.intercept, wait for specific state |
| "CypressError: cy.visit() failed" | Server not running or wrong URL | Verify baseUrl in config, check server |
| Test passes locally, fails in CI | Timing differences | Add explicit waits for network requests |
| "Cannot read property of undefined" | Async command not properly chained | Ensure commands are chained with .then() |

## Reference Documentation
- [Commands](quick-ref/commands.md)
- [Fixtures](quick-ref/fixtures.md)
