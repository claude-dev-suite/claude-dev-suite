// SPDX-License-Identifier: MIT
/**
 * Vitest global test setup
 *
 * Configures Testing Library, mocks browser APIs, and sets up global test utilities.
 */

import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Mock crypto.randomUUID
if (typeof global.crypto === 'undefined') {
  global.crypto = {} as Crypto;
}
if (typeof global.crypto.randomUUID === 'undefined') {
  global.crypto.randomUUID = () => Math.random().toString(36).substring(2, 15);
}

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
});

// Mock fetch globally - tests can override with specific implementations
global.fetch = vi.fn() as any;

// Mock WebSocket globally
global.WebSocket = vi.fn() as unknown as typeof WebSocket;

// Mock logger module to prevent initialization issues
// Note: vi.mock is hoisted, so factory must be self-contained
vi.mock('@/utils/logger', () => {
  const createMockLogger = (): Record<string, unknown> => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    time: vi.fn(() => vi.fn()),
    withContext: vi.fn(function(this: Record<string, unknown>) { return this; }),
  });

  const mockLogger = createMockLogger();
  return {
    default: mockLogger,
    logger: mockLogger,
    apiLogger: createMockLogger(),
    wsLogger: createMockLogger(),
    uiLogger: createMockLogger(),
    getLogger: vi.fn(() => createMockLogger()),
    getSessionId: vi.fn(() => 'test-session-id'),
  };
});

// Mock console methods to reduce noise in tests
const originalError = console.error;
const originalWarn = console.warn;

global.console = {
  ...console,
  error: vi.fn((message, ...args) => {
    // Only suppress expected React errors
    if (
      typeof message === 'string' &&
      (message.includes('ReactDOM.render') ||
        message.includes('Not implemented: HTMLFormElement.prototype.submit'))
    ) {
      return;
    }
    originalError(message, ...args);
  }),
  warn: vi.fn((message, ...args) => {
    // Only suppress expected warnings
    if (typeof message === 'string' && message.includes('ReactDOM.render')) {
      return;
    }
    originalWarn(message, ...args);
  }),
};

// Add custom matchers
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});
