---
name: clean-code
description: |
  Clean code principles. Covers naming, functions, and readability.
  Use when writing or reviewing code for quality.

  USE WHEN: user mentions "code quality", "readability", "refactor", "clean up code", "naming", "magic numbers",
  asks about "how to write better code", "code smells", "DRY", "KISS", "YAGNI", "single responsibility"

  DO NOT USE FOR: SOLID principles - use `solid-principles` instead,
  Git workflow - use `git-workflow` instead,
  Performance optimization - use `performance` instead
allowed-tools: Read, Grep, Glob
---
# Clean Code Core Principles

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `clean-code` for comprehensive documentation.

## Naming

```typescript
// ❌ Bad
const d = new Date();
const yyyymmdd = formatDate(d);
function calc(a, b) { return a + b; }
const list = users.filter(x => x.active);

// ✅ Good
const currentDate = new Date();
const formattedDate = formatDate(currentDate);
function calculateTotal(price, quantity) { return price * quantity; }
const activeUsers = users.filter(user => user.isActive);
```

## Functions

```typescript
// ❌ Bad - Too many responsibilities
function processUser(user) {
  validateUser(user);
  saveToDatabase(user);
  sendWelcomeEmail(user);
  updateAnalytics(user);
}

// ✅ Good - Single responsibility
function createUser(userData: UserInput): User {
  const user = validateAndBuildUser(userData);
  return userRepository.save(user);
}

// Separately handle side effects
async function onUserCreated(user: User) {
  await sendWelcomeEmail(user);
  await analytics.trackSignup(user);
}
```

## Early Returns

```typescript
// ❌ Bad - Nested conditions
function getDiscount(user) {
  if (user) {
    if (user.isPremium) {
      if (user.yearsActive > 2) {
        return 0.2;
      } else {
        return 0.1;
      }
    } else {
      return 0;
    }
  }
  return 0;
}

// ✅ Good - Early returns
function getDiscount(user: User | null): number {
  if (!user) return 0;
  if (!user.isPremium) return 0;
  if (user.yearsActive > 2) return 0.2;
  return 0.1;
}
```

## Avoid Magic Numbers

```typescript
// ❌ Bad
if (user.age >= 18 && items.length <= 10) { ... }
setTimeout(callback, 86400000);

// ✅ Good
const MINIMUM_AGE = 18;
const MAX_CART_ITEMS = 10;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

if (user.age >= MINIMUM_AGE && items.length <= MAX_CART_ITEMS) { ... }
setTimeout(callback, ONE_DAY_MS);
```

## Principles Summary

| Principle | Description |
|-----------|-------------|
| **DRY** | Don't Repeat Yourself |
| **KISS** | Keep It Simple, Stupid |
| **YAGNI** | You Aren't Gonna Need It |
| **SRP** | Single Responsibility Principle |
| **Composition** | Favor composition over inheritance |

## When NOT to Use This Skill

This skill is focused on code-level quality. Do NOT use for:

- **SOLID principles** - Use `solid-principles` skill for OOP design principles
- **Git commit quality** - Use `git-workflow` skill for version control best practices
- **Performance optimization** - Use `performance` skill for speed/memory optimization
- **Security vulnerabilities** - Use OWASP or security-specific skills
- **Build/tooling configuration** - Use framework-specific skills (e.g., `biome`, `vite`)

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Clean Code Solution |
|--------------|--------------|---------------------|
| **God Object** | Class with too many responsibilities | Split into focused classes (SRP) |
| **Magic Numbers** | Hard to understand context | Use named constants |
| **Deep Nesting** | Difficult to follow logic | Early returns, extract functions |
| **Long Parameter Lists** | Hard to use and maintain | Parameter objects or builder pattern |
| **Copy-Paste Code** | Duplicate bugs, hard to maintain | Extract shared functions (DRY) |
| **Vague Names** | `data`, `temp`, `x` | Intention-revealing names |
| **Side Effects in Getters** | Unexpected behavior | Pure functions, separate queries from commands |
| **Comments Instead of Code** | Outdated comments, cluttered | Self-documenting code with clear names |

## Quick Troubleshooting

| Issue | Check | Solution |
|-------|-------|----------|
| **Complex function** | Cyclomatic complexity > 10 | Extract smaller functions, use early returns |
| **Unreadable code** | Need comments to explain | Rename variables/functions, extract logic |
| **Duplicated logic** | Copy-paste across files | Extract to shared utility/service |
| **Long file** | > 300 lines | Split by responsibility, separate concerns |
| **Unclear variable** | Name doesn't reveal intent | Rename to describe what it contains/represents |
| **Magic number appearing** | Unexplained literal values | Define const with descriptive name |

## Authoritative Sources
- **Clean Code** by Robert C. Martin - https://www.oreilly.com/library/view/clean-code-a/9780136083238/
- **Refactoring Catalog** by Martin Fowler - https://refactoring.com/catalog/

## Production Readiness

### Code Quality Gates

```javascript
// eslint.config.js
export default [
  {
    rules: {
      // Complexity limits
      complexity: ['error', { max: 10 }],
      'max-depth': ['error', 4],
      'max-lines-per-function': ['warn', { max: 50 }],
      'max-params': ['warn', { max: 4 }],

      // Maintainability
      'no-duplicate-imports': 'error',
      'no-else-return': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];

// biome.json
{
  "linter": {
    "rules": {
      "complexity": {
        "noExcessiveCognitiveComplexity": {
          "level": "error",
          "options": { "maxAllowedComplexity": 15 }
        }
      }
    }
  }
}
```

### Error Handling Patterns

```typescript
// Custom error hierarchy
class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404);
  }
}

// Error boundary pattern
async function handleRequest<T>(operation: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (error) {
    if (error instanceof AppError && error.isOperational) {
      return { success: false, error };
    }
    // Log unexpected errors
    logger.error('Unexpected error', { error });
    throw error; // Re-throw for crash recovery
  }
}
```

### Code Review Automation

```yaml
# .github/workflows/code-quality.yml
name: Code Quality

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: SonarCloud Scan
        uses: SonarSource/sonarcloud-github-action@master
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}

      - name: Check cognitive complexity
        run: npx @biomejs/biome check --diagnostic-level=error .

      - name: Detect code duplication
        run: npx jscpd src/ --threshold 5
```

### Testing Standards

```typescript
// Test naming convention
describe('UserService', () => {
  describe('createUser', () => {
    it('should create user with valid data', async () => {
      // Arrange
      const userData = { name: 'John', email: 'john@example.com' };

      // Act
      const user = await userService.createUser(userData);

      // Assert
      expect(user.id).toBeDefined();
      expect(user.name).toBe('John');
    });

    it('should throw ValidationError for invalid email', async () => {
      // Arrange
      const invalidData = { name: 'John', email: 'invalid' };

      // Act & Assert
      await expect(userService.createUser(invalidData))
        .rejects.toThrow(ValidationError);
    });
  });
});

// Test coverage thresholds
// vitest.config.ts
{
  test: {
    coverage: {
      provider: 'v8',
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
}
```

### Documentation Standards

```typescript
/**
 * Creates a new user in the system.
 *
 * @param data - User creation data
 * @returns The created user with generated ID
 * @throws {ValidationError} If the data is invalid
 * @throws {ConflictError} If email already exists
 *
 * @example
 * ```ts
 * const user = await createUser({
 *   name: 'John Doe',
 *   email: 'john@example.com'
 * });
 * ```
 */
async function createUser(data: CreateUserData): Promise<User> {
  // Implementation
}

// README template for modules
/**
 * # User Module
 *
 * ## Overview
 * Handles user management including CRUD operations.
 *
 * ## Usage
 * ```ts
 * import { UserService } from './user';
 * const service = new UserService(repository);
 * ```
 *
 * ## API
 * - `createUser(data)` - Creates a new user
 * - `getUser(id)` - Retrieves user by ID
 * - `updateUser(id, data)` - Updates user data
 */
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Cognitive complexity | < 15 |
| Cyclomatic complexity | < 10 |
| Code duplication | < 5% |
| Test coverage | > 80% |
| Technical debt ratio | < 5% |

### Checklist

- [ ] Meaningful variable/function names
- [ ] Single responsibility functions
- [ ] Early returns to reduce nesting
- [ ] Constants for magic numbers
- [ ] Consistent error handling
- [ ] Complexity limits in linter
- [ ] Test coverage thresholds
- [ ] JSDoc for public APIs
- [ ] Code duplication detection
- [ ] SonarQube quality gate

## Reference Documentation
- [SOLID Principles](../solid-principles/SKILL.md)
- [Design Patterns](../design-patterns/SKILL.md)
- [Quality Principles (Consolidated)](../../quality/common/SKILL.md)
