# Jest Mocking Quick Reference

> **Knowledge Base:** Read `knowledge/jest/mocking.md` for complete documentation.

## Mock Functions

```javascript
// Create mock function
const mockFn = jest.fn();
const mockWithReturn = jest.fn(() => 'default');

// Call mock
mockFn('arg1', 'arg2');

// Assertions
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledTimes(1);
expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
expect(mockFn).toHaveBeenLastCalledWith('arg1', 'arg2');
expect(mockFn).toHaveBeenNthCalledWith(1, 'arg1', 'arg2');

// Return values
mockFn.mockReturnValue('value');
mockFn.mockReturnValueOnce('first').mockReturnValueOnce('second');
mockFn.mockResolvedValue('async value');
mockFn.mockRejectedValue(new Error('error'));

// Implementation
mockFn.mockImplementation((x) => x * 2);
mockFn.mockImplementationOnce((x) => x * 3);

// Reset
mockFn.mockClear();      // Clear call history
mockFn.mockReset();      // Clear + reset return values
mockFn.mockRestore();    // Restore original (spyOn only)
```

## Spying on Methods

```javascript
// Spy on object method
const spy = jest.spyOn(object, 'method');

// Spy with implementation
jest.spyOn(object, 'method').mockImplementation(() => 'mocked');

// Spy on getter/setter
jest.spyOn(object, 'property', 'get').mockReturnValue('value');
jest.spyOn(object, 'property', 'set');

// Restore original
spy.mockRestore();

// Example
const video = {
  play() { return true; }
};

const spy = jest.spyOn(video, 'play');
video.play();

expect(spy).toHaveBeenCalled();
spy.mockRestore();
```

## Module Mocking

```javascript
// Mock entire module
jest.mock('./module');

// Mock with factory
jest.mock('./module', () => ({
  fetchData: jest.fn(() => Promise.resolve('mocked')),
  processData: jest.fn()
}));

// Mock default export
jest.mock('./module', () => ({
  __esModule: true,
  default: jest.fn(() => 'mocked default'),
  namedExport: jest.fn()
}));

// Partial mock (keep some real implementations)
jest.mock('./module', () => ({
  ...jest.requireActual('./module'),
  specificFunction: jest.fn()
}));

// Mock in test file
import { fetchData } from './module';
jest.mock('./module');

test('uses mocked module', () => {
  fetchData.mockResolvedValue('data');
  // ...
});
```

## Manual Mocks

```javascript
// __mocks__/axios.js
export default {
  get: jest.fn(() => Promise.resolve({ data: {} })),
  post: jest.fn(() => Promise.resolve({ data: {} }))
};

// Test file
import axios from 'axios';
jest.mock('axios');

test('fetches data', async () => {
  axios.get.mockResolvedValue({ data: { users: [] } });
  const result = await fetchUsers();
  expect(axios.get).toHaveBeenCalledWith('/api/users');
});
```

## Timer Mocks

```javascript
// Enable fake timers
jest.useFakeTimers();

// Advance timers
jest.advanceTimersByTime(1000);  // 1 second
jest.runAllTimers();             // Run all pending
jest.runOnlyPendingTimers();     // Run only currently pending

// Test with timers
test('calls callback after 1s', () => {
  const callback = jest.fn();
  setTimeout(callback, 1000);

  expect(callback).not.toHaveBeenCalled();

  jest.advanceTimersByTime(1000);

  expect(callback).toHaveBeenCalledTimes(1);
});

// Restore real timers
jest.useRealTimers();

// Modern fake timers (recommended)
jest.useFakeTimers({ advanceTimers: true });
```

## Mocking Classes

```javascript
// Mock class
jest.mock('./SoundPlayer');

import SoundPlayer from './SoundPlayer';

test('mock class', () => {
  const player = new SoundPlayer();
  player.playSoundFile('song.mp3');

  expect(SoundPlayer).toHaveBeenCalledTimes(1);
  expect(player.playSoundFile).toHaveBeenCalledWith('song.mp3');
});

// Mock with implementation
jest.mock('./SoundPlayer', () => {
  return jest.fn().mockImplementation(() => ({
    playSoundFile: jest.fn()
  }));
});
```

## Mocking Fetch/Axios

```javascript
// Mock fetch
global.fetch = jest.fn();

beforeEach(() => {
  fetch.mockClear();
});

test('fetches data', async () => {
  fetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: 'result' })
  });

  const result = await fetchData();

  expect(fetch).toHaveBeenCalledWith('/api/data');
  expect(result).toEqual({ data: 'result' });
});

// Mock axios
import axios from 'axios';
jest.mock('axios');

test('posts data', async () => {
  axios.post.mockResolvedValue({ data: { id: 1 } });

  const result = await createUser({ name: 'John' });

  expect(axios.post).toHaveBeenCalledWith('/api/users', { name: 'John' });
});
```

**Official docs:** https://jestjs.io/docs/mock-functions
