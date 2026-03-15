# Vitest Coverage

> **Knowledge Base:** Read `knowledge/vitest/coverage.md` for complete documentation.

## Setup

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8', // or 'istanbul'
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules',
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/types/**',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
});
```

## Running Coverage

```bash
# Generate coverage report
vitest run --coverage

# Watch mode with coverage
vitest --coverage

# Coverage for specific files
vitest run --coverage src/utils/
```

## Coverage Report

```
----------|---------|----------|---------|---------|-------------------
File      | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------|---------|----------|---------|---------|-------------------
All files |   85.71 |    75.00 |   90.00 |   85.71 |
 utils.ts |   85.71 |    75.00 |   90.00 |   85.71 | 15-20
----------|---------|----------|---------|---------|-------------------
```

## Thresholds

```ts
// Fail if coverage drops below thresholds
coverage: {
  thresholds: {
    // Global thresholds
    lines: 80,
    branches: 80,
    functions: 80,
    statements: 80,

    // Per-file thresholds
    perFile: true,

    // Auto-update (use current as minimum)
    autoUpdate: true,
  },
}
```

## Ignoring Code

```ts
// Ignore next line
/* v8 ignore next */
if (process.env.DEBUG) console.log('debug');

// Ignore block
/* v8 ignore start */
function debugOnly() {
  // Not covered
}
/* v8 ignore stop */

// Istanbul syntax also works
/* istanbul ignore next */
if (process.env.NODE_ENV === 'development') {}
```

## CI Integration

```yaml
# GitHub Actions
- name: Run tests with coverage
  run: npm run test:coverage

- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/coverage-final.json
    fail_ci_if_error: true
```

## Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:coverage:watch": "vitest --coverage"
  }
}
```

**Official docs:** https://vitest.dev/guide/coverage.html
