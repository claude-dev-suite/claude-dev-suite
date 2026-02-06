---
name: axe-core
description: |
  axe-core - accessibility testing engine for automated WCAG compliance checks.

  USE WHEN: user mentions "axe", "automated accessibility testing", "a11y tests", asks about "integrating accessibility checks", "CI/CD accessibility", "Playwright accessibility", "Jest accessibility", "Vitest axe"

  DO NOT USE FOR: manual accessibility audits - use `wcag` skill instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# axe-core - Quick Reference

## When NOT to Use This Skill

- **Manual WCAG compliance audits** - Use the `wcag` skill for understanding guidelines and manual testing
- **Screen reader testing** - axe-core doesn't replace manual screen reader verification
- **Complex ARIA pattern implementation** - Use `wcag` skill for ARIA authoring practices
- **Accessibility strategy planning** - This is for test automation, not accessibility consulting

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `axe-core` for comprehensive documentation on rules, configuration, and integrations.

## Setup Base

```bash
npm install -D @axe-core/react  # For React
npm install -D axe-core         # Core library
```

## Pattern Essenziali

### React DevTools Integration
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';

if (process.env.NODE_ENV !== 'production') {
  import('@axe-core/react').then(axe => {
    axe.default(React, ReactDOM, 1000);
  });
}
```

### Jest/Vitest Integration
```typescript
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

test('should have no accessibility violations', async () => {
  const { container } = render(<MyComponent />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

### Playwright Integration
```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('should not have accessibility issues', async ({ page }) => {
  await page.goto('/');

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});

// With specific rules
test('should pass WCAG AA', async ({ page }) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});
```

### Cypress Integration
```typescript
// cypress/support/commands.ts
import 'cypress-axe';

// In test
describe('Accessibility', () => {
  it('has no violations', () => {
    cy.visit('/');
    cy.injectAxe();
    cy.checkA11y();
  });
});
```

### Programmatic Usage
```typescript
import axe from 'axe-core';

async function checkAccessibility() {
  const results = await axe.run();

  if (results.violations.length > 0) {
    console.log('Violations:', results.violations);
  }
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|-------------|----------------|------------------|
| Running axe on empty/loading states | Tests incomplete DOM, false negatives | Wait for content to load before running axe |
| Ignoring all violations | Defeats purpose of automated testing | Fix violations or document exceptions with reasoning |
| Testing only homepage | Most accessibility issues in complex interactions | Test all critical user flows and components |
| Not configuring WCAG level | Tests against all rules, may be too strict | Set `withTags(['wcag2a', 'wcag2aa'])` for target level |
| Running axe synchronously in loops | Slow test execution | Use `Promise.all()` for parallel execution |
| Committing violations to CI | Prevents catching regressions | Fail builds on new violations |
| Testing hidden/inactive components | Axe tests invisible elements unnecessarily | Use `exclude` parameter for hidden sections |
| No baseline for legacy code | All violations block progress | Create baseline, track improvements incrementally |

## Quick Troubleshooting

| Issue | Diagnosis | Solution |
|-------|-----------|----------|
| axe finds no violations but page is inaccessible | Automated tools catch only ~30-40% of issues | Supplement with manual keyboard and screen reader testing |
| "No violations" but form has issues | axe doesn't test form logic/flow | Test form submission, error handling manually |
| Timeout in Playwright axe tests | Large/complex page takes too long | Increase timeout or analyze specific regions |
| False positive on custom component | axe rule doesn't understand pattern | Use `disableRules` or add proper ARIA to fix |
| Violations in third-party widgets | Can't modify external code | Document exceptions, contact vendor, or replace widget |
| Different results in different browsers | Browser-specific rendering differences | Run axe in multiple browsers, use cross-browser test suite |
| CI fails but local passes | Environment differences (timing, content) | Ensure consistent test data and wait conditions |
| Too many violations to fix at once | Legacy codebase with extensive issues | Create baseline, use `--save` flag to track improvements |
