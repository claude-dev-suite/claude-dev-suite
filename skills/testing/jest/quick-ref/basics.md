# Jest Basics Quick Reference

> **Knowledge Base:** Read `knowledge/jest/basics.md` for complete documentation.

## Test Structure

```javascript
// Basic test
test('adds 1 + 2 to equal 3', () => {
  expect(1 + 2).toBe(3);
});

// Describe blocks
describe('Calculator', () => {
  describe('add', () => {
    test('adds positive numbers', () => {
      expect(add(1, 2)).toBe(3);
    });

    test('adds negative numbers', () => {
      expect(add(-1, -2)).toBe(-3);
    });
  });
});

// Skip and only
test.skip('skipped test', () => {});
test.only('only this runs', () => {});
describe.skip('skipped suite', () => {});
```

## Common Matchers

```javascript
// Equality
expect(value).toBe(3);              // Strict equality (===)
expect(obj).toEqual({ a: 1 });      // Deep equality
expect(obj).toStrictEqual({ a: 1 }); // Strict deep equality

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();
expect(value).toBeDefined();

// Numbers
expect(value).toBeGreaterThan(3);
expect(value).toBeGreaterThanOrEqual(3);
expect(value).toBeLessThan(5);
expect(value).toBeCloseTo(0.3, 5);  // Float comparison

// Strings
expect(str).toMatch(/pattern/);
expect(str).toContain('substring');

// Arrays & Iterables
expect(array).toContain('item');
expect(array).toHaveLength(3);
expect(array).toContainEqual({ a: 1 });

// Objects
expect(obj).toHaveProperty('key');
expect(obj).toHaveProperty('nested.key', 'value');
expect(obj).toMatchObject({ subset: true });

// Negation
expect(value).not.toBe(3);
```

## Async Testing

```javascript
// Promises
test('async with promise', () => {
  return fetchData().then(data => {
    expect(data).toBe('data');
  });
});

// Async/await
test('async with await', async () => {
  const data = await fetchData();
  expect(data).toBe('data');
});

// Resolves/Rejects
test('resolves', () => {
  return expect(fetchData()).resolves.toBe('data');
});

test('rejects', () => {
  return expect(fetchBadData()).rejects.toThrow('error');
});

// Callbacks (done)
test('callback', done => {
  fetchData(data => {
    expect(data).toBe('data');
    done();
  });
});
```

## Setup & Teardown

```javascript
// Run before/after each test
beforeEach(() => {
  initializeDatabase();
});

afterEach(() => {
  clearDatabase();
});

// Run once per describe block
beforeAll(() => {
  return connectToDatabase();
});

afterAll(() => {
  return disconnectFromDatabase();
});

// Scoped to describe
describe('with database', () => {
  beforeEach(() => { /* setup */ });
  afterEach(() => { /* cleanup */ });

  test('test 1', () => {});
  test('test 2', () => {});
});
```

## Exceptions

```javascript
// Test for thrown errors
test('throws error', () => {
  expect(() => {
    throw new Error('wrong');
  }).toThrow();
});

test('throws specific error', () => {
  expect(() => throwError()).toThrow('specific message');
  expect(() => throwError()).toThrow(/pattern/);
  expect(() => throwError()).toThrow(CustomError);
});

// Async errors
test('async throws', async () => {
  await expect(asyncThrow()).rejects.toThrow('error');
});
```

## CLI Commands

```bash
# Run all tests
npx jest

# Run specific file
npx jest path/to/test.js

# Run tests matching pattern
npx jest --testNamePattern="pattern"

# Watch mode
npx jest --watch
npx jest --watchAll

# Coverage
npx jest --coverage

# Verbose output
npx jest --verbose

# Update snapshots
npx jest --updateSnapshot
```

**Official docs:** https://jestjs.io/docs/getting-started
