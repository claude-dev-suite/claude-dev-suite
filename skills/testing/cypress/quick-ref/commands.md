# Cypress Commands Quick Reference

> **Knowledge Base:** Read `knowledge/cypress/commands.md` for complete documentation.

## Basic Commands

```javascript
// Visit page
cy.visit('/');
cy.visit('https://example.com');

// Get elements
cy.get('button');                    // CSS selector
cy.get('[data-testid="submit"]');    // Test ID
cy.get('.class-name');               // Class
cy.get('#id');                       // ID

// Contains
cy.contains('Submit');               // Text content
cy.contains('button', 'Submit');     // Element with text
cy.contains(/regex/i);               // Regex

// Find within element
cy.get('.container').find('button');
cy.get('.list').children();
cy.get('.item').parent();
cy.get('.item').siblings();
cy.get('.item').first();
cy.get('.item').last();
cy.get('.item').eq(2);              // Index
```

## Interactions

```javascript
// Click
cy.get('button').click();
cy.get('button').dblclick();
cy.get('button').rightclick();
cy.get('.menu').click({ force: true });  // Force click

// Type
cy.get('input').type('Hello');
cy.get('input').type('Hello{enter}');    // With special keys
cy.get('input').type('{selectall}{backspace}');
cy.get('input').clear();
cy.get('input').clear().type('New value');

// Special keys: {enter}, {esc}, {backspace}, {del},
// {selectall}, {leftarrow}, {rightarrow}, {uparrow}, {downarrow}

// Select
cy.get('select').select('option-value');
cy.get('select').select(['value1', 'value2']);  // Multi-select

// Checkbox/Radio
cy.get('[type="checkbox"]').check();
cy.get('[type="checkbox"]').uncheck();
cy.get('[type="radio"]').check('value');

// Focus/Blur
cy.get('input').focus();
cy.get('input').blur();

// Scroll
cy.scrollTo('bottom');
cy.get('.element').scrollIntoView();
```

## Assertions

```javascript
// Visibility
cy.get('button').should('be.visible');
cy.get('.modal').should('not.be.visible');
cy.get('.item').should('exist');
cy.get('.item').should('not.exist');

// Text
cy.get('h1').should('have.text', 'Title');
cy.get('p').should('contain', 'partial text');
cy.get('h1').should('include.text', 'partial');

// Value
cy.get('input').should('have.value', 'expected');
cy.get('input').should('be.empty');

// State
cy.get('button').should('be.disabled');
cy.get('input').should('be.enabled');
cy.get('[type="checkbox"]').should('be.checked');
cy.get('input').should('have.focus');

// Classes & Attributes
cy.get('div').should('have.class', 'active');
cy.get('a').should('have.attr', 'href', '/path');
cy.get('div').should('have.css', 'display', 'flex');

// Length
cy.get('.items').should('have.length', 5);
cy.get('.items').should('have.length.greaterThan', 3);

// Chaining assertions
cy.get('button')
  .should('be.visible')
  .and('be.enabled')
  .and('have.text', 'Submit');
```

## Waiting & Timing

```javascript
// Explicit wait
cy.wait(1000);  // Avoid when possible

// Wait for request
cy.intercept('GET', '/api/users').as('getUsers');
cy.wait('@getUsers');

// Wait for element
cy.get('.loading').should('not.exist');
cy.get('.content').should('be.visible');

// Timeout
cy.get('.element', { timeout: 10000 }).should('exist');
```

## Network Requests

```javascript
// Intercept
cy.intercept('GET', '/api/users', { fixture: 'users.json' }).as('getUsers');
cy.intercept('POST', '/api/users', { statusCode: 201 }).as('createUser');

// Wait and assert
cy.wait('@getUsers').its('response.statusCode').should('eq', 200);

// Dynamic response
cy.intercept('GET', '/api/users', (req) => {
  req.reply({
    statusCode: 200,
    body: [{ id: 1, name: 'John' }]
  });
});

// Modify request
cy.intercept('POST', '/api/*', (req) => {
  req.headers['Authorization'] = 'Bearer token';
});

// Assert request body
cy.wait('@createUser').then(({ request }) => {
  expect(request.body).to.have.property('name', 'John');
});
```

## Viewport & Screenshots

```javascript
// Viewport
cy.viewport(1280, 720);
cy.viewport('iphone-x');
cy.viewport('macbook-15');

// Screenshot
cy.screenshot();
cy.screenshot('my-screenshot');
cy.get('.component').screenshot();
```

## Custom Commands

```javascript
// cypress/support/commands.js
Cypress.Commands.add('login', (email, password) => {
  cy.visit('/login');
  cy.get('[data-testid="email"]').type(email);
  cy.get('[data-testid="password"]').type(password);
  cy.get('[data-testid="submit"]').click();
});

// Usage
cy.login('user@example.com', 'password123');
```

**Official docs:** https://docs.cypress.io/api/commands
