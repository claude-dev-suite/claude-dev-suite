# Vitest Mocking

> **Knowledge Base:** Read `knowledge/vitest/mocking.md` for complete documentation.

## Function Mocks

```ts
import { vi, describe, it, expect } from 'vitest';

// Create mock function
const mockFn = vi.fn();
const mockWithReturn = vi.fn(() => 'default');
const mockWithImpl = vi.fn((x: number) => x * 2);

// Assertions
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledWith('arg');
expect(mockFn).toHaveBeenCalledTimes(2);
expect(mockWithImpl(5)).toBe(10);

// Return values
mockFn.mockReturnValue('value');
mockFn.mockReturnValueOnce('first').mockReturnValueOnce('second');
mockFn.mockResolvedValue({ data: 'async' });
mockFn.mockRejectedValue(new Error('failed'));

// Reset
mockFn.mockClear();  // Clear call history
mockFn.mockReset();  // Clear + remove implementation
mockFn.mockRestore(); // Restore original (for spies)
```

## Module Mocks

```ts
// Mock entire module
vi.mock('./api', () => ({
  fetchUsers: vi.fn(() => Promise.resolve([{ id: 1 }])),
  fetchPosts: vi.fn(),
}));

// Partial mock (keep some implementations)
vi.mock('./utils', async () => {
  const actual = await vi.importActual('./utils');
  return {
    ...actual,
    formatDate: vi.fn(() => '2024-01-01'),
  };
});

// Auto-mock all exports
vi.mock('./service');

import { fetchUsers } from './api';
expect(vi.mocked(fetchUsers)).toHaveBeenCalled();
```

## Spying

```ts
const obj = {
  method: (x: number) => x * 2,
};

// Spy without replacing
const spy = vi.spyOn(obj, 'method');
obj.method(5); // Still works normally
expect(spy).toHaveBeenCalledWith(5);

// Spy with mock implementation
vi.spyOn(obj, 'method').mockImplementation(() => 100);

// Spy on prototype
vi.spyOn(Array.prototype, 'push');
```

## Timers

```ts
describe('timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('handles setTimeout', () => {
    const callback = vi.fn();
    setTimeout(callback, 1000);

    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalled();
  });

  it('runs all timers', () => {
    const callback = vi.fn();
    setTimeout(callback, 1000);
    setInterval(callback, 500);

    vi.runAllTimers();
    expect(callback).toHaveBeenCalled();
  });
});
```

## Mocking Globals

```ts
// Mock global
vi.stubGlobal('fetch', vi.fn(() =>
  Promise.resolve({ json: () => Promise.resolve({ data: 'mocked' }) })
));

// Mock environment
vi.stubEnv('API_URL', 'http://test.com');

// Restore
vi.unstubAllGlobals();
vi.unstubAllEnvs();
```

## Hoisted Mocks

```ts
// Hoisted to top of file
vi.hoisted(() => {
  vi.mock('./config', () => ({
    apiUrl: 'http://test.com'
  }));
});
```

**Official docs:** https://vitest.dev/guide/mocking.html
