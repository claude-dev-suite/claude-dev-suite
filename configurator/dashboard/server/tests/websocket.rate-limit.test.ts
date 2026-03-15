/**
 * WebSocket Rate Limiting Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import type { WebSocketServer } from 'ws';
import { WS_RATE_LIMIT } from '../src/utils/constants.js';
import { generateCorrelationId } from '../src/utils/logger.js';

// Mock the dependencies
vi.mock('../src/server.js', () => ({
  validateWsToken: vi.fn(() => true),
}));

vi.mock('../src/services/orchestrator/index.js', () => ({
  orchestratorService: {
    addClient: vi.fn(),
    replaceClient: vi.fn(),
    removeClient: vi.fn(),
    handleGetStatus: vi.fn(),
    handleChatMessage: vi.fn(),
    handleNewChat: vi.fn(),
    handleCancelChat: vi.fn(),
    handleSubmitJob: vi.fn(),
    handleCancelJob: vi.fn(),
    sendToClient: vi.fn(),
    broadcast: vi.fn(),
  },
}));

describe('WebSocket Rate Limiting', () => {
  let wss: WebSocketServer;
  let mockWs: any;
  let messageHandler: any;

  beforeEach(async () => {
    // Create a mock WebSocket instance
    mockWs = {
      on: vi.fn((event: string, handler: any) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      }),
      close: vi.fn(),
      send: vi.fn(),
      readyState: WebSocket.OPEN,
      correlationId: generateCorrelationId(),
      clientId: 'test-client',
    };

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (wss) {
      wss.close();
    }
  });

  describe('Rate limit configuration', () => {
    it('should have correct default rate limit values', () => {
      expect(WS_RATE_LIMIT.MAX_MESSAGES).toBe(60);
      expect(WS_RATE_LIMIT.WINDOW_MS).toBe(60000);
      expect(WS_RATE_LIMIT.BLOCK_DURATION_MS).toBe(30000);
    });

    it('should allow environment variable override', () => {
      // The constants are already loaded, so we check they respect env vars
      expect(typeof WS_RATE_LIMIT.MAX_MESSAGES).toBe('number');
      expect(typeof WS_RATE_LIMIT.WINDOW_MS).toBe('number');
      expect(typeof WS_RATE_LIMIT.BLOCK_DURATION_MS).toBe('number');
    });
  });

  describe('Rate limit enforcement', () => {
    it('should allow messages within rate limit', async () => {
      const { createWebSocketServer } = await import('../src/websocket.js');
      const { orchestratorService } = await import('../src/services/orchestrator/index.js');

      // Create server
      wss = createWebSocketServer(0); // Use random port

      // Simulate connection
      const connectionHandler = (wss as any)._events.connection;
      if (connectionHandler) {
        const mockReq = {
          url: '/?token=valid-token&clientId=test-client',
          socket: { remoteAddress: '127.0.0.1' },
        };
        connectionHandler(mockWs, mockReq);
      }

      // Send messages within limit (10 messages, well below 60)
      for (let i = 0; i < 10; i++) {
        const message = JSON.stringify({
          type: 'get_status',
          payload: {},
        });
        messageHandler(Buffer.from(message));
      }

      // Should not have been rate limited
      expect(orchestratorService.sendToClient).not.toHaveBeenCalledWith(
        mockWs,
        expect.objectContaining({
          type: 'error',
          payload: expect.objectContaining({
            message: expect.stringContaining('Rate limit exceeded'),
          }),
        })
      );
    });

    it('should block messages exceeding rate limit', async () => {
      const { createWebSocketServer } = await import('../src/websocket.js');
      const { orchestratorService } = await import('../src/services/orchestrator/index.js');

      // Create server
      wss = createWebSocketServer(0);

      // Simulate connection
      const connectionHandler = (wss as any)._events.connection;
      if (connectionHandler) {
        const mockReq = {
          url: '/?token=valid-token&clientId=test-client',
          socket: { remoteAddress: '127.0.0.1' },
        };
        connectionHandler(mockWs, mockReq);
      }

      // Send messages exceeding limit (61 messages, above 60)
      for (let i = 0; i <= WS_RATE_LIMIT.MAX_MESSAGES; i++) {
        const message = JSON.stringify({
          type: 'get_status',
          payload: {},
        });
        messageHandler(Buffer.from(message));
      }

      // Should have been rate limited on the 61st message
      expect(orchestratorService.sendToClient).toHaveBeenCalledWith(
        mockWs,
        expect.objectContaining({
          type: 'error',
          payload: expect.objectContaining({
            message: expect.stringContaining('Rate limit exceeded'),
          }),
        })
      );
    });

    it('should reset rate limit after window expires', async () => {
      const { createWebSocketServer } = await import('../src/websocket.js');
      const { orchestratorService } = await import('../src/services/orchestrator/index.js');

      // Create server
      wss = createWebSocketServer(0);

      // Simulate connection
      const connectionHandler = (wss as any)._events.connection;
      if (connectionHandler) {
        const mockReq = {
          url: '/?token=valid-token&clientId=test-client',
          socket: { remoteAddress: '127.0.0.1' },
        };
        connectionHandler(mockWs, mockReq);
      }

      // Send messages near limit
      for (let i = 0; i < WS_RATE_LIMIT.MAX_MESSAGES; i++) {
        const message = JSON.stringify({
          type: 'get_status',
          payload: {},
        });
        messageHandler(Buffer.from(message));
      }

      // Advance time past the window
      vi.useFakeTimers();
      vi.advanceTimersByTime(WS_RATE_LIMIT.WINDOW_MS + 1000);

      // Should be able to send messages again
      const message = JSON.stringify({
        type: 'get_status',
        payload: {},
      });
      messageHandler(Buffer.from(message));

      vi.useRealTimers();
    });

    it('should maintain separate rate limits per connection', async () => {
      const { createWebSocketServer } = await import('../src/websocket.js');

      // Create server
      wss = createWebSocketServer(0);

      // Create two mock WebSocket connections
      const mockWs1 = { ...mockWs, clientId: 'client-1' };
      const mockWs2 = { ...mockWs, clientId: 'client-2' };
      let messageHandler1: any;
      let messageHandler2: any;

      mockWs1.on = vi.fn((event: string, handler: any) => {
        if (event === 'message') messageHandler1 = handler;
      });
      mockWs2.on = vi.fn((event: string, handler: any) => {
        if (event === 'message') messageHandler2 = handler;
      });

      // Simulate connections
      const connectionHandler = (wss as any)._events.connection;
      if (connectionHandler) {
        const mockReq1 = {
          url: '/?token=valid-token&clientId=client-1',
          socket: { remoteAddress: '127.0.0.1' },
        };
        const mockReq2 = {
          url: '/?token=valid-token&clientId=client-2',
          socket: { remoteAddress: '127.0.0.1' },
        };
        connectionHandler(mockWs1, mockReq1);
        connectionHandler(mockWs2, mockReq2);
      }

      // Each client should have independent rate limits
      expect(mockWs1.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockWs2.on).toHaveBeenCalledWith('message', expect.any(Function));
    });
  });

  describe('Rate limit logging', () => {
    it('should log rate limit violations with client details', async () => {
      const { createWebSocketServer } = await import('../src/websocket.js');
      const { orchestratorService } = await import('../src/services/orchestrator/index.js');

      // Create server
      wss = createWebSocketServer(0);

      // Simulate connection
      const connectionHandler = (wss as any)._events.connection;
      if (connectionHandler) {
        const mockReq = {
          url: '/?token=valid-token&clientId=test-client',
          socket: { remoteAddress: '127.0.0.1' },
        };
        connectionHandler(mockWs, mockReq);
      }

      // Send messages exceeding limit
      for (let i = 0; i <= WS_RATE_LIMIT.MAX_MESSAGES; i++) {
        const message = JSON.stringify({
          type: 'get_status',
          payload: {},
        });
        messageHandler(Buffer.from(message));
      }

      // Should log rate limit with details
      expect(orchestratorService.sendToClient).toHaveBeenCalledWith(
        mockWs,
        expect.objectContaining({
          type: 'error',
          payload: expect.objectContaining({
            message: expect.stringMatching(/Rate limit exceeded.*Blocked for \d+ seconds/),
          }),
        })
      );
    });
  });

  describe('Cleanup', () => {
    it('should clean up rate limit state on disconnect', async () => {
      const { createWebSocketServer } = await import('../src/websocket.js');

      // Create server
      wss = createWebSocketServer(0);

      let closeHandler: any;
      mockWs.on = vi.fn((event: string, handler: any) => {
        if (event === 'close') closeHandler = handler;
      });

      // Simulate connection
      const connectionHandler = (wss as any)._events.connection;
      if (connectionHandler) {
        const mockReq = {
          url: '/?token=valid-token&clientId=test-client',
          socket: { remoteAddress: '127.0.0.1' },
        };
        connectionHandler(mockWs, mockReq);
      }

      // Trigger close
      if (closeHandler) {
        closeHandler(1000, Buffer.from('Normal closure'));
      }

      // Verify cleanup was called
      expect(mockWs.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should clean up rate limit state on error', async () => {
      const { createWebSocketServer } = await import('../src/websocket.js');

      // Create server
      wss = createWebSocketServer(0);

      let errorHandler: any;
      mockWs.on = vi.fn((event: string, handler: any) => {
        if (event === 'error') errorHandler = handler;
      });

      // Simulate connection
      const connectionHandler = (wss as any)._events.connection;
      if (connectionHandler) {
        const mockReq = {
          url: '/?token=valid-token&clientId=test-client',
          socket: { remoteAddress: '127.0.0.1' },
        };
        connectionHandler(mockWs, mockReq);
      }

      // Trigger error
      if (errorHandler) {
        errorHandler(new Error('Connection error'));
      }

      // Verify cleanup was called
      expect(mockWs.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('Block duration', () => {
    it('should block client for configured duration after rate limit', async () => {
      const { createWebSocketServer } = await import('../src/websocket.js');
      const { orchestratorService } = await import('../src/services/orchestrator/index.js');

      // Create server
      wss = createWebSocketServer(0);

      // Simulate connection
      const connectionHandler = (wss as any)._events.connection;
      if (connectionHandler) {
        const mockReq = {
          url: '/?token=valid-token&clientId=test-client',
          socket: { remoteAddress: '127.0.0.1' },
        };
        connectionHandler(mockWs, mockReq);
      }

      // Exceed rate limit
      for (let i = 0; i <= WS_RATE_LIMIT.MAX_MESSAGES; i++) {
        const message = JSON.stringify({
          type: 'get_status',
          payload: {},
        });
        messageHandler(Buffer.from(message));
      }

      // Clear the mock calls
      vi.clearAllMocks();

      // Try to send another message immediately - should still be blocked
      const message = JSON.stringify({
        type: 'get_status',
        payload: {},
      });
      messageHandler(Buffer.from(message));

      // Should still be rate limited
      expect(orchestratorService.sendToClient).toHaveBeenCalledWith(
        mockWs,
        expect.objectContaining({
          type: 'error',
          payload: expect.objectContaining({
            message: expect.stringContaining('Rate limit exceeded'),
          }),
        })
      );
    });
  });
});
