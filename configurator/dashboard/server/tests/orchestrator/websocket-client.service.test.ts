/**
 * WebSocket Client Service Unit Tests
 *
 * Tests for:
 * - Client connection management
 * - Client deduplication by clientId
 * - Message broadcasting
 * - Dead connection cleanup
 * - Sending messages to specific clients
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocketClientService } from '../../src/services/orchestrator/websocket-client.service.js';
import type { WebSocket } from 'ws';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  wsLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Create mock WebSocket
function createMockWebSocket(readyState: number = 1): WebSocket {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket;
}

describe('WebSocketClientService', () => {
  let clientService: WebSocketClientService;

  beforeEach(() => {
    clientService = new WebSocketClientService();
    vi.clearAllMocks();
  });

  describe('addClient', () => {
    it('should add client without clientId', () => {
      const ws = createMockWebSocket();
      clientService.addClient(ws);

      expect(clientService.getClientCount()).toBe(1);
    });

    it('should add multiple clients without clientId', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const ws3 = createMockWebSocket();

      clientService.addClient(ws1);
      clientService.addClient(ws2);
      clientService.addClient(ws3);

      expect(clientService.getClientCount()).toBe(3);
    });

    it('should not duplicate same WebSocket instance', () => {
      const ws = createMockWebSocket();

      clientService.addClient(ws);
      clientService.addClient(ws); // Add same instance again

      // Set only allows unique values
      expect(clientService.getClientCount()).toBe(1);
    });
  });

  describe('replaceClient', () => {
    it('should add new client with clientId', () => {
      const ws = createMockWebSocket();
      clientService.replaceClient('client-1', ws);

      expect(clientService.getClientCount()).toBe(1);
      const state = clientService.getState();
      expect(state.clientMap.get('client-1')).toBe(ws);
    });

    it('should replace old connection with same clientId', () => {
      const oldWs = createMockWebSocket();
      const newWs = createMockWebSocket();

      clientService.replaceClient('client-1', oldWs);
      expect(clientService.getClientCount()).toBe(1);

      clientService.replaceClient('client-1', newWs);
      expect(clientService.getClientCount()).toBe(1);

      const state = clientService.getState();
      expect(state.clientMap.get('client-1')).toBe(newWs);
      expect(state.clients.has(oldWs)).toBe(false);
      expect(state.clients.has(newWs)).toBe(true);
    });

    it('should close old connection when replacing', () => {
      const oldWs = createMockWebSocket();
      const newWs = createMockWebSocket();

      clientService.replaceClient('client-1', oldWs);
      clientService.replaceClient('client-1', newWs);

      expect(oldWs.close).toHaveBeenCalledWith(4000, 'Replaced by new connection');
    });

    it('should handle close error gracefully when replacing', () => {
      const oldWs = createMockWebSocket();
      vi.mocked(oldWs.close).mockImplementation(() => {
        throw new Error('Close failed');
      });

      const newWs = createMockWebSocket();

      // Should not throw
      expect(() => {
        clientService.replaceClient('client-1', oldWs);
        clientService.replaceClient('client-1', newWs);
      }).not.toThrow();
    });

    it('should not close if same connection is re-added', () => {
      const ws = createMockWebSocket();

      clientService.replaceClient('client-1', ws);
      clientService.replaceClient('client-1', ws); // Same instance

      expect(ws.close).not.toHaveBeenCalled();
    });

    it('should allow multiple different clientIds', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const ws3 = createMockWebSocket();

      clientService.replaceClient('client-1', ws1);
      clientService.replaceClient('client-2', ws2);
      clientService.replaceClient('client-3', ws3);

      expect(clientService.getClientCount()).toBe(3);
      const state = clientService.getState();
      expect(state.clientMap.size).toBe(3);
    });
  });

  describe('removeClient', () => {
    it('should remove client without clientId', () => {
      const ws = createMockWebSocket();
      clientService.addClient(ws);
      expect(clientService.getClientCount()).toBe(1);

      clientService.removeClient(ws);
      expect(clientService.getClientCount()).toBe(0);
    });

    it('should remove client with clientId', () => {
      const ws = createMockWebSocket();
      clientService.replaceClient('client-1', ws);
      expect(clientService.getClientCount()).toBe(1);

      clientService.removeClient(ws, 'client-1');
      expect(clientService.getClientCount()).toBe(0);

      const state = clientService.getState();
      expect(state.clientMap.has('client-1')).toBe(false);
    });

    it('should only remove from map if it matches the connection', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      clientService.replaceClient('client-1', ws1);
      clientService.replaceClient('client-1', ws2); // Replaces ws1

      // Try to remove ws1 with client-1 ID (but ws2 is now mapped)
      clientService.removeClient(ws1, 'client-1');

      const state = clientService.getState();
      // client-1 should still map to ws2
      expect(state.clientMap.get('client-1')).toBe(ws2);
    });

    it('should handle removing non-existent client gracefully', () => {
      const ws = createMockWebSocket();

      expect(() => {
        clientService.removeClient(ws);
      }).not.toThrow();

      expect(clientService.getClientCount()).toBe(0);
    });
  });

  describe('broadcast', () => {
    it('should send message to all connected clients', () => {
      const ws1 = createMockWebSocket(1); // OPEN
      const ws2 = createMockWebSocket(1); // OPEN
      const ws3 = createMockWebSocket(1); // OPEN

      clientService.addClient(ws1);
      clientService.addClient(ws2);
      clientService.addClient(ws3);

      const message = { type: 'test', data: 'hello' };
      clientService.broadcast(message);

      expect(ws1.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(ws2.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(ws3.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should not send to clients with readyState !== 1 (not OPEN)', () => {
      const wsOpen = createMockWebSocket(1); // OPEN
      const wsConnecting = createMockWebSocket(0); // CONNECTING
      const wsClosing = createMockWebSocket(2); // CLOSING

      clientService.addClient(wsOpen);
      clientService.addClient(wsConnecting);
      clientService.addClient(wsClosing);

      const message = { type: 'test' };
      clientService.broadcast(message);

      expect(wsOpen.send).toHaveBeenCalled();
      expect(wsConnecting.send).not.toHaveBeenCalled();
      expect(wsClosing.send).not.toHaveBeenCalled();
    });

    it('should clean up closed connections (readyState === 3)', () => {
      const wsOpen = createMockWebSocket(1); // OPEN
      const wsClosed = createMockWebSocket(3); // CLOSED

      clientService.addClient(wsOpen);
      clientService.addClient(wsClosed);

      expect(clientService.getClientCount()).toBe(2);

      clientService.broadcast({ type: 'test' });

      // Closed connection should be removed
      expect(clientService.getClientCount()).toBe(1);
      expect(clientService.getState().clients.has(wsOpen)).toBe(true);
      expect(clientService.getState().clients.has(wsClosed)).toBe(false);
    });

    it('should clean up dead connections that throw on send', () => {
      const wsGood = createMockWebSocket(1);
      const wsDead = createMockWebSocket(1);
      vi.mocked(wsDead.send).mockImplementation(() => {
        throw new Error('Connection dead');
      });

      clientService.addClient(wsGood);
      clientService.addClient(wsDead);

      expect(clientService.getClientCount()).toBe(2);

      clientService.broadcast({ type: 'test' });

      // Dead connection should be removed
      expect(clientService.getClientCount()).toBe(1);
      expect(clientService.getState().clients.has(wsGood)).toBe(true);
      expect(clientService.getState().clients.has(wsDead)).toBe(false);
    });

    it('should handle empty client list gracefully', () => {
      expect(() => {
        clientService.broadcast({ type: 'test' });
      }).not.toThrow();
    });

    it('should serialize complex messages correctly', () => {
      const ws = createMockWebSocket(1);
      clientService.addClient(ws);

      const complexMessage = {
        type: 'complex',
        nested: {
          array: [1, 2, 3],
          boolean: true,
          null: null,
        },
      };

      clientService.broadcast(complexMessage);

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify(complexMessage));
    });
  });

  describe('sendToClient', () => {
    it('should send message to specific client', () => {
      const ws = createMockWebSocket(1);
      const message = { type: 'direct', data: 'hello' };

      clientService.sendToClient(ws, message);

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should not send if client is not OPEN', () => {
      const ws = createMockWebSocket(0); // CONNECTING
      const message = { type: 'test' };

      clientService.sendToClient(ws, message);

      expect(ws.send).not.toHaveBeenCalled();
    });

    it('should handle send error and remove client', () => {
      const ws = createMockWebSocket(1);
      vi.mocked(ws.send).mockImplementation(() => {
        throw new Error('Send failed');
      });

      clientService.addClient(ws);
      expect(clientService.getClientCount()).toBe(1);

      clientService.sendToClient(ws, { type: 'test' });

      // Client should be removed after error
      expect(clientService.getClientCount()).toBe(0);
    });

    it('should serialize message to JSON', () => {
      const ws = createMockWebSocket(1);
      const message = { type: 'test', value: 123 };

      clientService.sendToClient(ws, message);

      expect(ws.send).toHaveBeenCalledWith('{"type":"test","value":123}');
    });
  });

  describe('getClientCount', () => {
    it('should return 0 initially', () => {
      expect(clientService.getClientCount()).toBe(0);
    });

    it('should return correct count after adding clients', () => {
      clientService.addClient(createMockWebSocket());
      clientService.addClient(createMockWebSocket());
      clientService.addClient(createMockWebSocket());

      expect(clientService.getClientCount()).toBe(3);
    });

    it('should return correct count after removing clients', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      clientService.addClient(ws1);
      clientService.addClient(ws2);
      expect(clientService.getClientCount()).toBe(2);

      clientService.removeClient(ws1);
      expect(clientService.getClientCount()).toBe(1);
    });
  });

  describe('getState', () => {
    it('should return client state with clients set and map', () => {
      const state = clientService.getState();

      expect(state).toHaveProperty('clients');
      expect(state).toHaveProperty('clientMap');
      expect(state.clients).toBeInstanceOf(Set);
      expect(state.clientMap).toBeInstanceOf(Map);
    });

    it('should return actual state reference', () => {
      const ws = createMockWebSocket();
      clientService.addClient(ws);

      const state1 = clientService.getState();
      const state2 = clientService.getState();

      expect(state1).toBe(state2);
      expect(state1.clients.has(ws)).toBe(true);
    });

    it('should reflect current state accurately', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      clientService.addClient(ws1);
      clientService.replaceClient('client-2', ws2);

      const state = clientService.getState();

      expect(state.clients.size).toBe(2);
      expect(state.clientMap.size).toBe(1);
      expect(state.clientMap.get('client-2')).toBe(ws2);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete client lifecycle', () => {
      const ws = createMockWebSocket(1);

      // Connect
      clientService.replaceClient('client-1', ws);
      expect(clientService.getClientCount()).toBe(1);

      // Send message
      clientService.sendToClient(ws, { type: 'welcome' });
      expect(ws.send).toHaveBeenCalled();

      // Broadcast
      clientService.broadcast({ type: 'announcement' });
      expect(ws.send).toHaveBeenCalledTimes(2);

      // Disconnect
      clientService.removeClient(ws, 'client-1');
      expect(clientService.getClientCount()).toBe(0);
    });

    it('should handle client reconnection properly', () => {
      const oldWs = createMockWebSocket(1);
      const newWs = createMockWebSocket(1);

      // Initial connection
      clientService.replaceClient('client-1', oldWs);

      // Reconnect with same clientId
      clientService.replaceClient('client-1', newWs);

      // Old connection should be closed and removed
      expect(oldWs.close).toHaveBeenCalled();
      expect(clientService.getClientCount()).toBe(1);

      // Broadcast should only reach new connection
      clientService.broadcast({ type: 'test' });
      expect(newWs.send).toHaveBeenCalled();
      expect(oldWs.send).not.toHaveBeenCalled();
    });

    it('should handle mixed client types (with and without clientId)', () => {
      const ws1 = createMockWebSocket(1);
      const ws2 = createMockWebSocket(1);
      const ws3 = createMockWebSocket(1);

      clientService.addClient(ws1); // No clientId
      clientService.replaceClient('client-2', ws2); // With clientId
      clientService.addClient(ws3); // No clientId

      expect(clientService.getClientCount()).toBe(3);

      // All should receive broadcast
      clientService.broadcast({ type: 'test' });
      expect(ws1.send).toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalled();
      expect(ws3.send).toHaveBeenCalled();
    });

    it('should clean up all dead connections in one broadcast', () => {
      const wsGood1 = createMockWebSocket(1);
      const wsGood2 = createMockWebSocket(1);
      const wsClosed1 = createMockWebSocket(3);
      const wsClosed2 = createMockWebSocket(3);
      const wsError = createMockWebSocket(1);
      vi.mocked(wsError.send).mockImplementation(() => {
        throw new Error('Dead');
      });

      clientService.addClient(wsGood1);
      clientService.addClient(wsClosed1);
      clientService.addClient(wsGood2);
      clientService.addClient(wsClosed2);
      clientService.addClient(wsError);

      expect(clientService.getClientCount()).toBe(5);

      clientService.broadcast({ type: 'test' });

      // Only good connections remain
      expect(clientService.getClientCount()).toBe(2);
      expect(clientService.getState().clients.has(wsGood1)).toBe(true);
      expect(clientService.getState().clients.has(wsGood2)).toBe(true);
    });
  });
});
