# Cypress Patterns Quick Reference

> **Knowledge Base:** Read `knowledge/cypress/patterns.md` for complete documentation.

## Test Structure

```javascript
describe('Feature', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  context('when logged in', () => {
    beforeEach(() => {
      cy.login('user@example.com', 'password');
    });

    it('shows dashboard', () => {
      cy.get('[data-testid="dashboard"]').should('be.visible');
    });

    it('can update profile', () => {
      cy.get('[data-testid="profile-link"]').click();
      // ...
    });
  });

  context('when logged out', () => {
    it('redirects to login', () => {
      cy.visit('/dashboard');
      cy.url().should('include', '/login');
    });
  });
});
```

## Page Object Pattern

```javascript
// cypress/pages/LoginPage.js
export class LoginPage {
  visit() {
    cy.visit('/login');
  }

  get emailInput() {
    return cy.get('[data-testid="email"]');
  }

  get passwordInput() {
    return cy.get('[data-testid="password"]');
  }

  get submitButton() {
    return cy.get('[data-testid="submit"]');
  }

  login(email, password) {
    this.emailInput.type(email);
    this.passwordInput.type(password);
    this.submitButton.click();
  }
}

// Usage in test
import { LoginPage } from '../pages/LoginPage';

describe('Login', () => {
  const loginPage = new LoginPage();

  it('logs in successfully', () => {
    loginPage.visit();
    loginPage.login('user@example.com', 'password');
    cy.url().should('include', '/dashboard');
  });
});
```

## Authentication

```javascript
// cypress/support/commands.js
Cypress.Commands.add('loginByApi', (email, password) => {
  cy.request({
    method: 'POST',
    url: '/api/auth/login',
    body: { email, password }
  }).then(({ body }) => {
    window.localStorage.setItem('authToken', body.token);
  });
});

// Preserve session between tests
Cypress.Commands.add('loginAndCache', (email, password) => {
  cy.session([email, password], () => {
    cy.loginByApi(email, password);
  });
});

// Usage
beforeEach(() => {
  cy.loginAndCache('user@example.com', 'password');
});
```

## Data-Driven Tests

```javascript
const testCases = [
  { input: '', error: 'Email is required' },
  { input: 'invalid', error: 'Invalid email format' },
  { input: 'valid@example.com', error: null }
];

testCases.forEach(({ input, error }) => {
  it(`validates email: "${input}"`, () => {
    cy.get('[data-testid="email"]').clear().type(input || '{selectall}{backspace}');
    cy.get('[data-testid="submit"]').click();

    if (error) {
      cy.get('[data-testid="error"]').should('contain', error);
    } else {
      cy.get('[data-testid="error"]').should('not.exist');
    }
  });
});
```

## Fixtures

```javascript
// cypress/fixtures/users.json
[
  { "id": 1, "name": "John", "email": "john@example.com" },
  { "id": 2, "name": "Jane", "email": "jane@example.com" }
]

// Test file
describe('Users', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/users', { fixture: 'users.json' }).as('getUsers');
    cy.visit('/users');
    cy.wait('@getUsers');
  });

  it('displays users', () => {
    cy.get('[data-testid="user-row"]').should('have.length', 2);
  });
});

// Load fixture data
cy.fixture('users.json').then((users) => {
  cy.get('[data-testid="user-name"]').first().should('have.text', users[0].name);
});
```

## Error Handling

```javascript
// Test error states
it('handles API errors', () => {
  cy.intercept('GET', '/api/data', {
    statusCode: 500,
    body: { message: 'Server error' }
  }).as('getData');

  cy.visit('/page');
  cy.wait('@getData');

  cy.get('[data-testid="error-message"]')
    .should('be.visible')
    .and('contain', 'Something went wrong');
});

// Test network failure
it('handles network failure', () => {
  cy.intercept('GET', '/api/data', { forceNetworkError: true }).as('getData');

  cy.visit('/page');

  cy.get('[data-testid="offline-message"]').should('be.visible');
});
```

## Environment Variables

```javascript
// cypress.config.js
module.exports = {
  e2e: {
    env: {
      apiUrl: 'http://localhost:3000',
      adminEmail: 'admin@example.com'
    }
  }
};

// Usage
cy.visit(Cypress.env('apiUrl') + '/login');
cy.get('input').type(Cypress.env('adminEmail'));

// CLI override
// npx cypress run --env apiUrl=https://staging.example.com
```

## Visual Testing

```javascript
// Basic screenshot comparison
it('matches screenshot', () => {
  cy.visit('/page');
  cy.matchImageSnapshot('page-screenshot');
});

// Component snapshot
it('renders correctly', () => {
  cy.get('[data-testid="component"]').matchImageSnapshot();
});
```

## Configuration

```javascript
// cypress.config.js
const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    retries: {
      runMode: 2,
      openMode: 0
    }
  }
});
```

**Official docs:** https://docs.cypress.io/guides/references/best-practices
