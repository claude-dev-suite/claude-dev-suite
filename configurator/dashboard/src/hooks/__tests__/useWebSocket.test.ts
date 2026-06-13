// SPDX-License-Identifier: MIT
/**
 * Tests for useWebSocket hook
 *
 * Tests WebSocket connection, message sending, subscription, and disconnection.
 * Simplified tests focusing on core functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useWebSocket } from '../useWebSocket';

// Mock WebSocket class
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    // Simulate async connection
    setTimeout(() => this.simulateOpen(), 10);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code: 1000 }));
    }
  }

  // Helper methods for testing
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event('open'));
    }
  }

  simulateMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  simulateError() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code: 1006 }));
    }
  }
}

describe('useWebSocket', () => {
  let mockWsInstance: MockWebSocket | null = null;
  let wsInstances: MockWebSocket[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    wsInstances = [];

    // Create a proper WebSocket mock class that can be used as constructor
    class WebSocketMock {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      url: string;
      readyState: number;
      onopen: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      sentMessages: string[] = [];

      constructor(url: string) {
        this.url = url;
        this.readyState = WebSocketMock.CONNECTING;
        mockWsInstance = this as unknown as MockWebSocket;
        wsInstances.push(mockWsInstance);
        // Simulate async connection
        setTimeout(() => this.simulateOpen(), 10);
      }

      send(data: string) {
        this.sentMessages.push(data);
      }

      close() {
        this.readyState = WebSocketMock.CLOSED;
        if (this.onclose) {
          this.onclose(new CloseEvent('close', { code: 1000 }));
        }
      }

      simulateOpen() {
        this.readyState = WebSocketMock.OPEN;
        if (this.onopen) {
          this.onopen(new Event('open'));
        }
      }

      simulateMessage(data: unknown) {
        if (this.onmessage) {
          this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
        }
      }

      simulateError() {
        this.readyState = WebSocketMock.CLOSED;
        if (this.onerror) {
          this.onerror(new Event('error'));
        }
        if (this.onclose) {
          this.onclose(new CloseEvent('close', { code: 1006 }));
        }
      }
    }

    global.WebSocket = WebSocketMock as unknown as typeof WebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    mockWsInstance = null;
    wsInstances = [];
    vi.restoreAllMocks();
  });

  it('should initialize with disconnected state', () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:3457', 'token')
    );

    expect(result.current.connected).toBe(false);
    expect(result.current.lastMessage).toBe(null);
  });

  it('should connect without the token in the URL and authenticate via the first message', async () => {
    const url = 'ws://localhost:3457';
    const token = 'test-token';

    renderHook(() => useWebSocket(url, token));

    // Verify the WebSocket was created WITHOUT the token in the URL
    // (the token must not leak into logs/history — it is sent as the first frame instead).
    expect(wsInstances.length).toBeGreaterThan(0);
    const lastInstance = wsInstances[wsInstances.length - 1];
    expect(lastInstance?.url).toBe(url);
    expect(lastInstance?.url).not.toContain('token');

    // After the socket opens, the first message sent must be the auth frame.
    await act(async () => {
      lastInstance?.simulateOpen();
    });

    expect(lastInstance?.sentMessages.length).toBeGreaterThan(0);
    const firstFrame = JSON.parse(lastInstance!.sentMessages[0]);
    expect(firstFrame).toMatchObject({ type: 'auth', token });
  });

  it('should update connected state when WebSocket opens', async () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:3457', 'token')
    );

    expect(result.current.connected).toBe(false);

    // Advance timers to trigger connection
    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
    });
  });

  it('should handle incoming messages', async () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:3457', 'token')
    );

    // Wait for connection
    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    // Simulate incoming message
    const testMessage = { type: 'chat_output', data: 'Hello' };
    act(() => {
      mockWsInstance?.simulateMessage(testMessage);
    });

    expect(result.current.lastMessage).toEqual(testMessage);
  });

  it('should send messages when connected', async () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:3457', 'token')
    );

    // Wait for connection
    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
    });

    // Send message
    const message = { type: 'chat_message' as const, payload: 'Test' };
    act(() => {
      result.current.send(message);
    });

    expect(mockWsInstance?.sentMessages).toContainEqual(JSON.stringify(message));
  });

  it('should handle subscription to message types', async () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:3457', 'token')
    );

    // Wait for connection
    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    // Subscribe to a specific message type
    const handler = vi.fn();
    let unsubscribe: (() => void) | undefined;
    act(() => {
      unsubscribe = result.current.subscribe('job_complete', handler);
    });

    // Simulate matching message (handler receives payload, not full message)
    const payload = { jobId: '123', status: 'completed' };
    act(() => {
      mockWsInstance?.simulateMessage({ type: 'job_complete', payload });
    });

    expect(handler).toHaveBeenCalledWith(payload);

    // Simulate non-matching message
    handler.mockClear();
    act(() => {
      mockWsInstance?.simulateMessage({ type: 'other_type', payload: { data: 'test' } });
    });

    expect(handler).not.toHaveBeenCalled();

    // Cleanup
    unsubscribe?.();
  });

  it('should allow unsubscribing from message types', async () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:3457', 'token')
    );

    // Wait for connection
    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    // Subscribe and then unsubscribe
    const handler = vi.fn();
    let unsubscribe: (() => void) | undefined;
    act(() => {
      unsubscribe = result.current.subscribe('job_complete', handler);
    });

    // Unsubscribe
    act(() => {
      unsubscribe?.();
    });

    // Message should not trigger handler
    act(() => {
      mockWsInstance?.simulateMessage({ type: 'job_complete', payload: { jobId: '123' } });
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle disconnect', async () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:3457', 'token')
    );

    // Wait for connection
    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
    });

    // Disconnect
    act(() => {
      result.current.disconnect();
    });

    expect(result.current.connected).toBe(false);
  });

  it('should clean up on unmount', async () => {
    const { result, unmount } = renderHook(() =>
      useWebSocket('ws://localhost:3457', 'token')
    );

    // Wait for connection
    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
    });

    // Unmount
    unmount();

    // WebSocket should be closed
    expect(mockWsInstance?.readyState).toBe(MockWebSocket.CLOSED);
  });

  it('should handle WebSocket errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:3457', 'token')
    );

    // Wait for connection
    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    // Simulate error
    act(() => {
      mockWsInstance?.simulateError();
    });

    // Connection should be broken after error
    expect(result.current.connected).toBe(false);

    consoleErrorSpy.mockRestore();
  });

  it('should support multiple subscriptions for same type', async () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:3457', 'token')
    );

    // Wait for connection
    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    // Subscribe with two handlers
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    act(() => {
      result.current.subscribe('job_complete', handler1);
      result.current.subscribe('job_complete', handler2);
    });

    // Both handlers should be called with payload
    const payload = { jobId: '123' };
    act(() => {
      mockWsInstance?.simulateMessage({ type: 'job_complete', payload });
    });

    expect(handler1).toHaveBeenCalledWith(payload);
    expect(handler2).toHaveBeenCalledWith(payload);
  });
});
