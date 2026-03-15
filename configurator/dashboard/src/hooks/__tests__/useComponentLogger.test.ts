// SPDX-License-Identifier: MIT
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useComponentLogger, useComponentLoggerQuiet } from '../useComponentLogger';
import { getLogger } from '@/utils/logger';

// Logger is already mocked globally in setup.ts

describe('useComponentLogger', () => {
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    time: ReturnType<typeof vi.fn>;
    withContext: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      log: vi.fn(),
      time: vi.fn(() => vi.fn()),
      withContext: vi.fn(),
    };
    vi.mocked(getLogger).mockReturnValue(mockLogger);
  });

  it('should return a logger instance', () => {
    const { result } = renderHook(() => useComponentLogger('TestComponent'));

    expect(result.current).toBeDefined();
    expect(result.current.info).toBeDefined();
    expect(result.current.error).toBeDefined();
  });

  it('should call getLogger with component name prefix', () => {
    renderHook(() => useComponentLogger('TestComponent'));

    expect(getLogger).toHaveBeenCalledWith('Component/TestComponent');
  });

  it('should log component mount by default', () => {
    renderHook(() => useComponentLogger('TestComponent'));

    expect(mockLogger.debug).toHaveBeenCalledWith('Mounted');
  });

  it('should log component unmount by default', () => {
    const { unmount } = renderHook(() => useComponentLogger('TestComponent'));

    mockLogger.debug.mockClear();
    unmount();

    expect(mockLogger.debug).toHaveBeenCalledWith('Unmounting');
  });

  it('should allow disabling mount logging', () => {
    renderHook(() => useComponentLogger('TestComponent', {
      logMount: false,
    }));

    // debug should not be called for mount
    const mountCalls = mockLogger.debug.mock.calls.filter(
      call => call[0] === 'Mounted'
    );
    expect(mountCalls.length).toBe(0);
  });

  it('should allow disabling unmount logging', () => {
    const { unmount } = renderHook(() => useComponentLogger('TestComponent', {
      logUnmount: false,
    }));

    mockLogger.debug.mockClear();
    unmount();

    const unmountCalls = mockLogger.debug.mock.calls.filter(
      call => call[0] === 'Unmounting'
    );
    expect(unmountCalls.length).toBe(0);
  });

  it('should return logger methods that can be called', () => {
    const { result } = renderHook(() => useComponentLogger('TestComponent'));

    // Call the returned logger methods
    result.current.info('Test message');
    result.current.error('Error message');
    result.current.debug('Debug message');

    expect(mockLogger.info).toHaveBeenCalledWith('Test message');
    expect(mockLogger.error).toHaveBeenCalledWith('Error message');
    expect(mockLogger.debug).toHaveBeenCalledWith('Debug message');
  });

  describe('useComponentLoggerQuiet', () => {
    it('should not log mount', () => {
      renderHook(() => useComponentLoggerQuiet('TestComponent'));

      const mountCalls = mockLogger.debug.mock.calls.filter(
        call => call[0] === 'Mounted'
      );
      expect(mountCalls.length).toBe(0);
    });

    it('should not log unmount', () => {
      const { unmount } = renderHook(() => useComponentLoggerQuiet('TestComponent'));

      mockLogger.debug.mockClear();
      unmount();

      const unmountCalls = mockLogger.debug.mock.calls.filter(
        call => call[0] === 'Unmounting'
      );
      expect(unmountCalls.length).toBe(0);
    });

    it('should still return functional logger', () => {
      const { result } = renderHook(() => useComponentLoggerQuiet('TestComponent'));

      result.current.info('Manual log');

      expect(mockLogger.info).toHaveBeenCalledWith('Manual log');
    });
  });
});
