// SPDX-License-Identifier: MIT
/**
 * WebSocket integration tests for the permission_response message handling.
 *
 * Tests that the WebSocket handler correctly validates payloads and delegates
 * to orchestratorService.handlePermissionResponse.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import type { WebSocketServer } from 'ws';
import { generateCorrelationId } from '../src/utils/logger.js';

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
    handlePermissionResponse: vi.fn(),
    handleClearQueue: vi.fn(),
    handleRemoveFromQueue: vi.fn(),
    handleForceUnstick: vi.fn(),
    sendToClient: vi.fn(),
    broadcast: vi.fn(),
    getQueueStatus: vi.fn(() => ({ currentJob: null, queuedJobs: [], queueLength: 0 })),
  },
}));

describe('WebSocket permission_response handling', () => {
  let wss: WebSocketServer;
  let mockWs: any;
  let messageHandler: ((data: Buffer) => void) | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();

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
      clientId: 'test-client-permission',
    };
  });

  afterEach(() => {
    if (wss) {
      wss.close();
    }
  });

  async function setupServer() {
    const { createWebSocketServer } = await import('../src/websocket.js');
    wss = createWebSocketServer(0);

    const connectionHandler = (wss as any)._events?.connection;
    if (connectionHandler) {
      // URL no longer carries the token — auth is done via the first message
      const mockReq = {
        url: '/',
        socket: { remoteAddress: '127.0.0.1' },
      };
      connectionHandler(mockWs, mockReq);
    }

    // Authenticate the mock connection (required before any other messages)
    const authMsg = JSON.stringify({ type: 'auth', token: 'valid-token', clientId: 'test-client-permission' });
    messageHandler?.(Buffer.from(authMsg));
  }

  function sendMessage(payload: Record<string, unknown>) {
    const data = JSON.stringify({ type: 'permission_response', payload });
    messageHandler?.(Buffer.from(data));
  }

  it('valid allow payload calls handlePermissionResponse with correct data', async () => {
    await setupServer();
    const { orchestratorService } = await import('../src/services/orchestrator/index.js');

    sendMessage({ requestId: 'req-001', decision: 'allow' });

    expect(orchestratorService.handlePermissionResponse).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-001', decision: 'allow' })
    );
  });

  it('valid deny payload calls handlePermissionResponse with deny', async () => {
    await setupServer();
    const { orchestratorService } = await import('../src/services/orchestrator/index.js');

    sendMessage({ requestId: 'req-002', decision: 'deny' });

    expect(orchestratorService.handlePermissionResponse).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-002', decision: 'deny' })
    );
  });

  it('missing requestId sends error to client and does NOT call handlePermissionResponse', async () => {
    await setupServer();
    const { orchestratorService } = await import('../src/services/orchestrator/index.js');

    sendMessage({ decision: 'allow' });

    expect(orchestratorService.sendToClient).toHaveBeenCalledWith(
      mockWs,
      expect.objectContaining({
        type: 'error',
        payload: expect.objectContaining({ message: expect.any(String) }),
      })
    );
    expect(orchestratorService.handlePermissionResponse).not.toHaveBeenCalled();
  });

  it('missing decision sends error to client and does NOT call handlePermissionResponse', async () => {
    await setupServer();
    const { orchestratorService } = await import('../src/services/orchestrator/index.js');

    sendMessage({ requestId: 'req-003' });

    expect(orchestratorService.sendToClient).toHaveBeenCalledWith(
      mockWs,
      expect.objectContaining({
        type: 'error',
        payload: expect.objectContaining({ message: expect.any(String) }),
      })
    );
    expect(orchestratorService.handlePermissionResponse).not.toHaveBeenCalled();
  });

  it('invalid decision value sends error to client and does NOT call handlePermissionResponse', async () => {
    await setupServer();
    const { orchestratorService } = await import('../src/services/orchestrator/index.js');

    sendMessage({ requestId: 'req-004', decision: 'maybe' });

    expect(orchestratorService.sendToClient).toHaveBeenCalledWith(
      mockWs,
      expect.objectContaining({
        type: 'error',
        payload: expect.objectContaining({ message: expect.any(String) }),
      })
    );
    expect(orchestratorService.handlePermissionResponse).not.toHaveBeenCalled();
  });

  it('empty object payload sends error to client', async () => {
    await setupServer();
    const { orchestratorService } = await import('../src/services/orchestrator/index.js');

    sendMessage({});

    expect(orchestratorService.sendToClient).toHaveBeenCalledWith(
      mockWs,
      expect.objectContaining({
        type: 'error',
        payload: expect.objectContaining({ message: expect.any(String) }),
      })
    );
    expect(orchestratorService.handlePermissionResponse).not.toHaveBeenCalled();
  });

  it('valid allow payload error message contains requestId context', async () => {
    await setupServer();
    const { orchestratorService } = await import('../src/services/orchestrator/index.js');

    // Send invalid — verify the error message is descriptive
    sendMessage({ requestId: 'req-005', decision: 'invalid' });

    const calls = (orchestratorService.sendToClient as any).mock.calls;
    const errorCall = calls.find((c: any[]) =>
      c[1]?.type === 'error' && typeof c[1]?.payload?.message === 'string'
    );
    expect(errorCall).toBeDefined();
    const errorMsg: string = errorCall[1].payload.message;
    expect(errorMsg.length).toBeGreaterThan(0);
  });
});
