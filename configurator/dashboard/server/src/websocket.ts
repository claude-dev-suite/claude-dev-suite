// SPDX-License-Identifier: MIT
/**
 * WebSocket Server for Orchestrator Communication
 *
 * Handles real-time job updates, chat messages, and agent output streaming.
 * Uses the Agent SDK via orchestrator.service.ts for Claude interactions.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { validateWsToken } from './server.js';
import { orchestratorService } from './services/orchestrator/index.js';
import type { WsMessage } from './types/orchestrator.js';
import { wsLogger, generateCorrelationId } from './utils/logger.js';
import { validate } from './middleware/validateRequest.js';
import {
  WsMessageSchema,
  ChatMessagePayloadSchema,
  SubmitJobPayloadSchema,
  CancelJobPayloadSchema,
} from './validation/schemas.js';
import { config } from './config/index.js';

/**
 * Rate limiting configuration for WebSocket messages
 */
interface RateLimitState {
  messageCount: number;
  windowStart: number;
  blockedUntil?: number;
}

const rateLimits = new Map<WebSocket, RateLimitState>();

/**
 * Check if a WebSocket connection is rate limited
 * @param ws WebSocket connection
 * @returns true if request is allowed, false if rate limited
 */
function checkRateLimit(ws: WebSocket): boolean {
  const now = Date.now();
  let state = rateLimits.get(ws);

  // Check if client is currently blocked
  if (state?.blockedUntil && now < state.blockedUntil) {
    return false;
  }

  // Initialize or reset window if expired
  if (!state || now - state.windowStart > config.websocket.rateLimit.windowMs) {
    state = { messageCount: 0, windowStart: now };
    rateLimits.set(ws, state);
  }

  // Increment message count
  state.messageCount++;

  // Check if limit exceeded
  if (state.messageCount > config.websocket.rateLimit.maxMessages) {
    // Block the client
    state.blockedUntil = now + config.websocket.rateLimit.windowMs / 2; // Block for half the window duration
    return false;
  }

  return true;
}

export function createWebSocketServer(port: number, host: string = config.websocket.host): WebSocketServer {
  const wss = new WebSocketServer({
    port,
    host, // Bind to localhost only for security
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '', `ws://localhost:${port}`);
    const token = url.searchParams.get('token');
    const clientId = url.searchParams.get('clientId') || generateCorrelationId();
    const correlationId = generateCorrelationId();
    const clientIp = req.socket.remoteAddress;

    // Store correlation ID on WebSocket for tracking
    (ws as any).correlationId = correlationId;
    (ws as any).clientId = clientId;

    // Validate token
    if (!token || !validateWsToken(token)) {
      wsLogger.warn('Connection rejected: invalid token', {
        correlationId,
        data: { clientId, ip: clientIp },
      });
      ws.close(4001, 'Invalid or missing token');
      return;
    }

    wsLogger.info('Client connected', {
      correlationId,
      data: { clientId, ip: clientIp },
    });

    // Register client with orchestrator - use replaceClient if clientId provided
    if (clientId) {
      orchestratorService.replaceClient(clientId, ws);
    } else {
      orchestratorService.addClient(ws);
    }

    // Send initial status
    orchestratorService.handleGetStatus(ws);

    // Handle messages
    ws.on('message', (data: Buffer) => {
      const msgCorrelationId = (ws as any).correlationId || correlationId;
      const msgClientId = (ws as any).clientId || clientId;
      const endTimer = wsLogger.time('Message processing', { correlationId: msgCorrelationId });

      // Check rate limit
      if (!checkRateLimit(ws)) {
        const state = rateLimits.get(ws);
        const blockedFor = state?.blockedUntil ? Math.ceil((state.blockedUntil - Date.now()) / 1000) : 0;

        wsLogger.warn('Rate limit exceeded', {
          correlationId: msgCorrelationId,
          data: {
            clientId: msgClientId,
            ip: clientIp,
            messageCount: state?.messageCount || 0,
            blockedFor,
          },
        });

        orchestratorService.sendToClient(ws, {
          type: 'error',
          payload: {
            message: `Rate limit exceeded. Please slow down. Blocked for ${blockedFor} seconds.`,
          },
        });
        endTimer();
        return;
      }

      try {
        const size = data.length;
        const rawMessage = JSON.parse(data.toString());

        // Validate message structure
        const messageValidation = validate(WsMessageSchema, rawMessage);
        if (!messageValidation.success) {
          wsLogger.error('Invalid message structure', {
            correlationId: msgCorrelationId,
            data: {
              clientId: msgClientId,
              error: messageValidation.error,
              size,
            },
          });

          orchestratorService.sendToClient(ws, {
            type: 'error',
            payload: { message: `Validation failed: ${messageValidation.error}` },
          });
          endTimer();
          return;
        }

        const rawMessageData = messageValidation.data as { type: WsMessage['type']; payload?: unknown };

        // Ensure payload is present
        const message: WsMessage<unknown> = {
          type: rawMessageData.type,
          payload: rawMessageData.payload ?? {},
        };

        wsLogger.debug('Message received', {
          correlationId: msgCorrelationId,
          data: {
            type: message.type,
            size,
            clientId: msgClientId,
          },
        });

        handleMessage(ws, message);
        endTimer();
      } catch (err) {
        const error = err as Error;
        wsLogger.error('Invalid message format', {
          correlationId: msgCorrelationId,
          data: {
            clientId: msgClientId,
            error: error.message,
            size: data.length,
          },
          error,
        });

        orchestratorService.sendToClient(ws, {
          type: 'error',
          payload: { message: 'Invalid JSON format' },
        });
        endTimer();
      }
    });

    ws.on('close', (code: number, reason: Buffer) => {
      const msgCorrelationId = (ws as any).correlationId || correlationId;
      const msgClientId = (ws as any).clientId || clientId;

      wsLogger.info('Client disconnected', {
        correlationId: msgCorrelationId,
        data: {
          clientId: msgClientId,
          code,
          reason: reason.toString() || 'No reason provided',
        },
      });

      // Clean up rate limit state
      rateLimits.delete(ws);

      orchestratorService.removeClient(ws, msgClientId || undefined);
    });

    ws.on('error', (err: Error) => {
      const msgCorrelationId = (ws as any).correlationId || correlationId;
      const msgClientId = (ws as any).clientId || clientId;

      wsLogger.error('Client error', {
        correlationId: msgCorrelationId,
        data: {
          clientId: msgClientId,
          error: err.message,
        },
        error: err,
      });

      // Clean up rate limit state
      rateLimits.delete(ws);

      orchestratorService.removeClient(ws, msgClientId || undefined);
    });
  });

  wss.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      wsLogger.error(`Port ${port} already in use`, {
        data: { port, code: err.code },
      });
    } else {
      wsLogger.error('WebSocket server error', {
        data: { error: err.message, code: err.code },
        error: err,
      });
    }
  });

  wsLogger.info('WebSocket server started', {
    data: { port, host },
  });

  return wss;
}

function handleMessage(ws: WebSocket, message: WsMessage<unknown>): void {
  const correlationId = (ws as any).correlationId;
  const clientId = (ws as any).clientId;
  const startTime = Date.now();

  // Debug: log exact message type for troubleshooting
  wsLogger.info('Handling message - DEBUG', {
    correlationId,
    data: {
      type: message.type,
      typeOf: typeof message.type,
      typeLength: message.type?.length,
      typeCharCodes: message.type ? Array.from(message.type).map(c => c.charCodeAt(0)) : [],
      clientId
    },
  });

  switch (message.type) {
    case 'chat_message': {
      const validation = validate(ChatMessagePayloadSchema, message.payload);
      if (!validation.success) {
        orchestratorService.sendToClient(ws, {
          type: 'error',
          payload: { message: `Invalid chat_message payload: ${validation.error}` },
        });
        return;
      }
      orchestratorService.handleChatMessage(ws, validation.data as Record<string, unknown>);
      break;
    }

    case 'new_chat':
    case 'end_chat':
    case 'clear_history':
      orchestratorService.handleNewChat();
      break;

    case 'cancel_chat':
      orchestratorService.handleCancelChat();
      break;

    case 'submit_job': {
      const validation = validate(SubmitJobPayloadSchema, message.payload);
      if (!validation.success) {
        orchestratorService.sendToClient(ws, {
          type: 'error',
          payload: { message: `Invalid submit_job payload: ${validation.error}` },
        });
        return;
      }
      orchestratorService.handleSubmitJob(validation.data as Record<string, unknown>);
      break;
    }

    case 'cancel_job': {
      const validation = validate(CancelJobPayloadSchema, message.payload);
      if (!validation.success) {
        orchestratorService.sendToClient(ws, {
          type: 'error',
          payload: { message: `Invalid cancel_job payload: ${validation.error}` },
        });
        return;
      }
      orchestratorService.handleCancelJob(validation.data as Record<string, unknown>);
      break;
    }

    case 'get_status':
      orchestratorService.handleGetStatus(ws);
      break;

    case 'get_queue_status':
      wsLogger.info('Queue status requested');
      orchestratorService.sendToClient(ws, {
        type: 'queue_status',
        payload: orchestratorService.getQueueStatus(),
      });
      break;

    case 'clear_queue':
      wsLogger.info('Clear queue requested');
      orchestratorService.handleClearQueue();
      break;

    case 'remove_from_queue': {
      const jobId = (message.payload as Record<string, unknown>)?.jobId;
      if (!jobId || typeof jobId !== 'string') {
        orchestratorService.sendToClient(ws, {
          type: 'error',
          payload: { message: 'remove_from_queue requires jobId' },
        });
        return;
      }
      wsLogger.info('Remove from queue requested', { data: { jobId } });
      orchestratorService.handleRemoveFromQueue({ jobId });
      break;
    }

    case 'force_unstick':
      wsLogger.warn('Force unstick requested');
      orchestratorService.handleForceUnstick();
      break;

    default:
      wsLogger.warn('Unknown message type received', {
        correlationId,
        data: { type: message.type, clientId },
      });
      orchestratorService.sendToClient(ws, {
        type: 'error',
        payload: { message: `Unknown message type: ${message.type}` },
      });
  }

  // Log slow operations as warnings
  const duration = Date.now() - startTime;
  if (duration > 1000) {
    wsLogger.warn('Slow message handling detected', {
      correlationId,
      data: { type: message.type, duration, clientId },
      duration,
    });
  }
}

// Re-export for backwards compatibility
export const broadcast = orchestratorService.broadcast;
