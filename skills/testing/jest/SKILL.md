---
name: jest
description: |
  Jest testing framework. Covers unit tests, mocking, and snapshots.
  Use for testing React and Node.js projects.

  USE WHEN: user mentions "jest", "jest test", "snapshot test", asks about "jest.fn", "jest.mock", "toMatchSnapshot", "React testing"

  DO NOT USE FOR: E2E tests - use `playwright` or `cypress`; Vite projects - use `vitest` instead; React component testing alone - combine with `testing-library`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Jest Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `jest` for comprehensive documentation.

## When NOT to Use This Skill

- **E2E Testing** - Use `playwright` or `cypress` for browser automation
- **Vite Projects** - Use `vitest` which is faster and Vite-native
- **Component Testing Alone** - Combine with `testing-library` for React/Vue components
- **API Integration Tests** - Use framework-specific skills (spring-boot-integration, etc.)

## Basic Test

```typescript
describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    service = new UserService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create user', async () => {
    const user = await service.create({ name: 'John' });
    expect(user.name).toBe('John');
  });
});
```

## Mocking

```typescript
// Mock function
const mockFn = jest.fn();
mockFn.mockReturnValue(42);
mockFn.mockResolvedValue({ data: [] });

// Mock module
jest.mock('./api', () => ({
  fetchUsers: jest.fn().mockResolvedValue([])
}));

// Spy
const spy = jest.spyOn(console, 'log');
expect(spy).toHaveBeenCalledWith('message');

// Mock implementation
mockFn.mockImplementation((x) => x * 2);
```

## Matchers

```typescript
// Same as Vitest, Jest-compatible
expect(value).toBe(exact);
expect(value).toEqual(deepEqual);
expect(obj).toMatchObject({ name: 'John' });
expect(arr).toContainEqual({ id: 1 });
```

## Snapshots

```typescript
it('should match snapshot', () => {
  const component = render(<UserCard user={user} />);
  expect(component).toMatchSnapshot();
});

it('should match inline snapshot', () => {
  expect(formatDate(date)).toMatchInlineSnapshot(`"2024-01-15"`);
});
```

## Async Testing

```typescript
it('should resolve', async () => {
  await expect(fetchData()).resolves.toEqual({ data: [] });
});

it('should reject', async () => {
  await expect(fetchFail()).rejects.toThrow('Error');
});
```

## Config

```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' }
};
```

## Production Readiness

### Test Organization

```typescript
// Isolated tests with proper setup/teardown
describe('OrderService', () => {
  let service: OrderService;
  let mockRepository: jest.Mocked<OrderRepository>;

  beforeEach(() => {
    mockRepository = {
      findById: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    } as jest.Mocked<OrderRepository>;

    service = new OrderService(mockRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processOrder', () => {
    it('should process valid order', async () => {
      // Arrange
      const order = createTestOrder({ status: 'pending' });
      mockRepository.findById.mockResolvedValue(order);
      mockRepository.save.mockResolvedValue({ ...order, status: 'processed' });

      // Act
      const result = await service.processOrder(order.id);

      // Assert
      expect(result.status).toBe('processed');
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'processed' })
      );
    });
  });
});
```

### Coverage Configuration

```javascript
// jest.config.js
module.exports = {
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/**/*.stories.tsx',
  ],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],
};
```

### CI Integration

```yaml
# GitHub Actions
- name: Run tests
  run: npm test -- --ci --coverage --reporters=default --reporters=jest-junit
  env:
    JEST_JUNIT_OUTPUT_DIR: ./reports

- name: Upload coverage
  uses: codecov/codecov-action@v3
```

```json
// package.json
{
  "scripts": {
    "test": "jest",
    "test:ci": "jest --ci --coverage --maxWorkers=2",
    "test:watch": "jest --watch"
  }
}
```

### Performance Optimization

```javascript
// jest.config.js - Speed up tests
module.exports = {
  // Run tests in parallel
  maxWorkers: '50%',

  // Cache transformations
  cacheDirectory: '<rootDir>/.jest-cache',

  // Only run affected tests
  onlyChanged: true,

  // Fail fast in CI
  bail: process.env.CI ? 1 : 0,
};
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Line coverage | > 80% |
| Branch coverage | > 75% |
| Test execution time | < 120s |
| Flaky test rate | 0% |

### Checklist

- [ ] Arrange-Act-Assert pattern
- [ ] Isolated tests (no shared state)
- [ ] Coverage thresholds enforced
- [ ] CI/CD integration with reporting
- [ ] jest.clearAllMocks() in afterEach
- [ ] Meaningful test descriptions
- [ ] Async tests properly awaited
- [ ] Snapshot tests reviewed
- [ ] Test data factories
- [ ] Error scenarios covered

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Over-using snapshots | Tests pass without validation | Use snapshots sparingly, prefer explicit assertions |
| Not reviewing snapshot changes | Bugs slip into snapshots | Always review snapshot diffs manually |
| Testing implementation details | Brittle tests | Test user-facing behavior |
| Shared mutable state | Flaky tests | Isolate setup with beforeEach |
| Skipping error paths | Production failures | Test both success and error scenarios |
| Large snapshot files | Hard to review | Break into smaller focused snapshots |
| No mock cleanup | Tests affect each other | jest.clearAllMocks() in afterEach |

## Quick Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| "Cannot find module" | Mock path incorrect | Ensure mock path matches import exactly |
| Test timeout | Missing await | Add await to all async operations |
| "Received: serializes to same string" | Object reference comparison | Use toEqual() not toBe() for objects |
| Snapshot mismatch | Intentional code change | Review diff, update with -u flag if correct |
| "expect().resolves is not a function" | Old Jest version | Update to Jest 27+ or use async/await |
| Tests pass locally, fail in CI | Timezone/locale differences | Mock Date, use fixed timezones |

## Reference Documentation
- [Mocking](quick-ref/mocking.md)
- [Snapshots](quick-ref/snapshots.md)
