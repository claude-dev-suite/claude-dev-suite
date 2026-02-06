---
name: vitest
description: |
  Vitest testing framework. Covers unit tests, mocking, and coverage.
  Use for testing Vite-based and Node.js projects.

  USE WHEN: user mentions "vitest", "vite test", "unit test", asks about "vi.fn", "vi.mock", "test coverage", "mock functions", "test vite project"

  DO NOT USE FOR: E2E tests - use `playwright` instead; React component testing - combine with `testing-library`; Jest projects - use `jest` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Vitest Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `vitest` for comprehensive documentation.

## When NOT to Use This Skill

- **E2E Testing** - Use `playwright` or `cypress` for browser-based end-to-end tests
- **React Component Testing** - Combine this skill with `testing-library` for component tests
- **Jest Migration** - If project uses Jest, use `jest` skill instead (syntax is similar but not identical)
- **API Integration Tests** - Use framework-specific integration test skills (spring-boot-integration, etc.)

## Basic Test

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { calculateTotal } from './utils';

describe('calculateTotal', () => {
  it('should sum array of numbers', () => {
    expect(calculateTotal([1, 2, 3])).toBe(6);
  });

  it('should return 0 for empty array', () => {
    expect(calculateTotal([])).toBe(0);
  });
});
```

## Matchers

```typescript
// Equality
expect(value).toBe(exact);
expect(value).toEqual(deepEqual);
expect(value).toMatchObject(partial);

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeDefined();

// Numbers
expect(value).toBeGreaterThan(n);
expect(value).toBeCloseTo(0.3, 5);

// Strings
expect(str).toMatch(/pattern/);
expect(str).toContain('substring');

// Arrays
expect(arr).toContain(item);
expect(arr).toHaveLength(3);

// Errors
expect(() => fn()).toThrow();
expect(() => fn()).toThrowError('message');
```

## Mocking

```typescript
// Mock function
const mockFn = vi.fn();
mockFn.mockReturnValue(42);
mockFn.mockResolvedValue({ data: [] });

// Mock module
vi.mock('./api', () => ({
  fetchUsers: vi.fn().mockResolvedValue([])
}));

// Spy
const spy = vi.spyOn(object, 'method');
expect(spy).toHaveBeenCalledWith('arg');

// Reset
vi.clearAllMocks();
vi.resetAllMocks();
```

## Async Tests

```typescript
it('should fetch data', async () => {
  const data = await fetchUsers();
  expect(data).toHaveLength(3);
});

it('should reject', async () => {
  await expect(fetchFail()).rejects.toThrow('Error');
});
```

## Config

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: { provider: 'v8', reporter: ['text', 'html'] }
  }
});
```

## Production Readiness

### Test Organization

```typescript
// Proper test structure
describe('UserService', () => {
  // Setup/teardown at appropriate level
  let service: UserService;
  let mockDb: MockedObject<Database>;

  beforeAll(async () => {
    // Expensive setup once
    await setupTestDatabase();
  });

  beforeEach(() => {
    // Reset state before each test
    mockDb = vi.mocked(new Database());
    service = new UserService(mockDb);
    vi.clearAllMocks();
  });

  afterAll(async () => {
    // Cleanup
    await teardownTestDatabase();
  });

  describe('create', () => {
    it('should create user with valid data', async () => {
      // Arrange
      const input = { name: 'John', email: 'john@example.com' };
      mockDb.insert.mockResolvedValue({ id: '1', ...input });

      // Act
      const result = await service.create(input);

      // Assert
      expect(result).toMatchObject(input);
      expect(mockDb.insert).toHaveBeenCalledWith('users', input);
    });

    it('should throw on duplicate email', async () => {
      mockDb.insert.mockRejectedValue(new UniqueConstraintError());
      await expect(service.create(input)).rejects.toThrow('Email already exists');
    });
  });
});
```

### Coverage Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/types/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
```

### CI Configuration

```yaml
# GitHub Actions
- name: Run tests
  run: npm run test:ci

- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
    fail_ci_if_error: true
```

```json
// package.json scripts
{
  "scripts": {
    "test": "vitest",
    "test:ci": "vitest run --coverage --reporter=junit --outputFile=test-results.xml",
    "test:watch": "vitest --watch"
  }
}
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Line coverage | > 80% |
| Branch coverage | > 75% |
| Test execution time | < 60s |
| Flaky test rate | 0% |

### Checklist

- [ ] Arrange-Act-Assert pattern
- [ ] Isolated tests (no shared state)
- [ ] Meaningful test descriptions
- [ ] Coverage thresholds enforced
- [ ] CI/CD integration
- [ ] No console.log in tests
- [ ] Mocks reset between tests
- [ ] Async tests properly awaited
- [ ] Edge cases covered
- [ ] Error paths tested

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Testing implementation details | Tests break on refactor | Test behavior, not internals |
| Sharing state between tests | Flaky, order-dependent tests | Use beforeEach, isolated setup |
| Arbitrary waits (setTimeout) | Slow, unreliable tests | Use waitFor or async utilities |
| Not resetting mocks | Previous test affects next | vi.clearAllMocks() in beforeEach |
| Testing private methods | Tight coupling to implementation | Test through public API |
| One giant test | Hard to debug failures | One assertion per test (ideally) |
| No error case tests | Production bugs slip through | Test happy path AND error paths |

## Quick Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| "Cannot find module" | Missing mock setup | Check vi.mock() path matches import |
| Test timeout | Async not awaited | Ensure all async operations use await |
| "Expected 0 calls, received 1" | Mock not cleared | Add vi.clearAllMocks() in beforeEach |
| Flaky tests | Shared state or timing | Isolate setup, avoid setTimeout |
| Coverage not updating | Cache issue | Run with --no-cache flag |
| "TypeError: vi.fn is not a function" | Missing import | Import { vi } from 'vitest' |

## Reference Documentation
- [Mocking](quick-ref/mocking.md)
- [Coverage](quick-ref/coverage.md)
