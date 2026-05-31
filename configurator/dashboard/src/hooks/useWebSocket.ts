// SPDX-License-Identifier: MIT
/**
 * Custom hook for WebSocket connection to Orchestrator
 *
 * Handles WebSocket connection with auto-reconnect, message subscription,
 * and authentication via token.
 *
 * @example
 * ```tsx
 * const { connected, send, subscribe } = useWebSocket('ws://localhost:3457', wsToken);
 *
 * useEffect(() => {
 *   const unsubscribe = subscribe('chat_output', (payload) => {
 *     console.log('Chat output:', payload);
 *   });
 *   return unsubscribe;
 * }, [subscribe]);
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { WsMessage, WsMessageType } from '@/types';
import { getLogger } from '@/utils/logger';
import { config } from '@/config';

export interface UseWebSocketOptions {
  /** Whether to auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Reconnect attempts (default: 5) */
  maxReconnectAttempts?: number;
  /** Initial reconnect delay in ms (default: 1000) */
  reconnectDelay?: number;
  /** Max reconnect delay in ms (default: 30000) */
  maxReconnectDelay?: number;
  /** Heartbeat interval in ms (default: 30000) */
  heartbeatInterval?: number;
  /** Debug logging (default: false) */
  debug?: boolean;
}

export interface UseWebSocketResult {
  /** Whether WebSocket is connected */
  connected: boolean;
  /** Send a message to the server */
  send: <T = unknown>(message: WsMessage<T>) => void;
  /** Subscribe to messages of a specific type */
  subscribe: <T = unknown>(
    type: WsMessageType,
    handler: (payload: T) => void
  ) => () => void;
  /** Last received message */
  lastMessage: WsMessage | null;
  /** Connect manually */
  connect: () => void;
  /** Disconnect manually */
  disconnect: () => void;
  /** Current reconnect attempt */
  reconnectAttempt: number;
}

type MessageHandler = (payload: unknown) => void;

const DEFAULT_OPTIONS: Required<UseWebSocketOptions> = {
  autoConnect: true,
  maxReconnectAttempts: config.websocket.reconnectAttempts,
  reconnectDelay: config.websocket.reconnectBaseDelay,
  maxReconnectDelay: config.websocket.reconnectMaxDelay,
  heartbeatInterval: config.websocket.heartbeatInterval,
  debug: false,
};

/**
 * WebSocket hook with auto-reconnect and message subscription
 */
export function useWebSocket(
  url: string,
  token: string | null,
  options: UseWebSocketOptions = {}
): UseWebSocketResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const logger = getLogger('useWebSocket');

  const [connected, setConnected] = useState<boolean>(false);
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const subscribersRef = useRef<Map<WsMessageType, Set<MessageHandler>>>(new Map());
  const shouldReconnectRef = useRef<boolean>(true);
  const reconnectAttemptRef = useRef<number>(0); // Use ref to avoid stale closures
  const connectRef = useRef<(() => void) | null>(null); // Latest connect(), so the reconnect timer never calls a stale closure

  const log = useCallback(
    (message: string, data?: unknown) => {
      if (opts.debug) {
        logger.debug(message, data);
      }
    },
    [opts.debug, logger]
  );

  // Send message
  const send = useCallback(
    <T = unknown>(message: WsMessage<T>) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const data = JSON.stringify(message);
        wsRef.current.send(data);

        logger.debug('Message sent', {
          type: message.type,
          size: data.length,
        });
      } else {
        logger.error('Cannot send message: WebSocket not connected', {
          readyState: wsRef.current?.readyState,
        });
      }
    },
    [logger]
  );

  // Subscribe to message type
  const subscribe = useCallback(
    <T = unknown>(type: WsMessageType, handler: (payload: T) => void) => {
      if (!subscribersRef.current.has(type)) {
        subscribersRef.current.set(type, new Set());
      }
      subscribersRef.current.get(type)!.add(handler as MessageHandler);

      log('Subscribed to message type', { type });

      // Return unsubscribe function
      return () => {
        const handlers = subscribersRef.current.get(type);
        if (handlers) {
          handlers.delete(handler as MessageHandler);
          if (handlers.size === 0) {
            subscribersRef.current.delete(type);
          }
        }
        log('Unsubscribed from message type', { type });
      };
    },
    [log]
  );

  // Handle incoming messages
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: WsMessage = JSON.parse(event.data);
        setLastMessage(message);

        logger.debug('Message received', {
          type: message.type,
          size: event.data.length,
        });

        // Notify subscribers
        const handlers = subscribersRef.current.get(message.type);
        if (handlers) {
          handlers.forEach((handler) => {
            try {
              handler(message.payload);
            } catch (err) {
              logger.error('Error in message handler', { messageType: message.type, error: err });
            }
          });
        }
      } catch (err) {
        logger.error('Parse error', err);
      }
    },
    [logger]
  );

  // Start heartbeat
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current !== null) {
      clearInterval(heartbeatIntervalRef.current);
    }

    heartbeatIntervalRef.current = window.setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping', payload: {} }));
        log('Sent heartbeat');
      }
    }, opts.heartbeatInterval);
  }, [opts.heartbeatInterval, log]);

  // Stop heartbeat
  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current !== null) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  // Calculate reconnect delay with exponential backoff
  const getReconnectDelay = useCallback(
    (attempt: number): number => {
      const delay = opts.reconnectDelay * Math.pow(2, attempt);
      return Math.min(delay, opts.maxReconnectDelay);
    },
    [opts.reconnectDelay, opts.maxReconnectDelay]
  );

  // Connect
  const connect = useCallback(() => {
    if (!token) {
      logger.warn('Cannot connect: No token provided');
      return;
    }

    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      logger.debug('Already connected or connecting', {
        readyState: wsRef.current.readyState,
      });
      return;
    }

    const wsUrl = `${url}?token=${encodeURIComponent(token)}`;
    const connectStartTime = Date.now();

    logger.info('Connecting to WebSocket', { url });

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      const latency = Date.now() - connectStartTime;

      logger.info('Connected to WebSocket', {
        latency,
        url,
      });

      setConnected(true);
      reconnectAttemptRef.current = 0;
      setReconnectAttempt(0);
      startHeartbeat();
    };

    ws.onmessage = handleMessage;

    ws.onerror = (event) => {
      logger.error('WebSocket error', {
        type: event.type,
      });
    };

    ws.onclose = (event) => {
      logger.info('Disconnected from WebSocket', {
        code: event.code,
        reason: event.reason || 'No reason provided',
        wasClean: event.wasClean,
      });

      setConnected(false);
      stopHeartbeat();

      // Attempt reconnect if not intentionally closed (use ref to avoid stale closure)
      if (shouldReconnectRef.current && reconnectAttemptRef.current < opts.maxReconnectAttempts) {
        const currentAttempt = reconnectAttemptRef.current;
        const delay = getReconnectDelay(currentAttempt);

        logger.info('Reconnecting', {
          attempt: currentAttempt + 1,
          maxAttempts: opts.maxReconnectAttempts,
          delay,
        });

        reconnectTimeoutRef.current = window.setTimeout(() => {
          reconnectAttemptRef.current += 1;
          setReconnectAttempt((prev) => prev + 1);
          connectRef.current?.();
        }, delay);
      } else if (reconnectAttemptRef.current >= opts.maxReconnectAttempts) {
        logger.error('Max reconnect attempts reached', {
          maxAttempts: opts.maxReconnectAttempts,
        });
      }
    };
  }, [
    url,
    token,
    opts.maxReconnectAttempts,
    logger,
    handleMessage,
    startHeartbeat,
    stopHeartbeat,
    getReconnectDelay,
  ]);

  // Keep the ref pointed at the latest connect() so the reconnect timer above
  // (which fires long after render) never invokes a stale closure.
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // Disconnect
  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    stopHeartbeat();

    if (reconnectTimeoutRef.current !== null) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      logger.info('Disconnecting WebSocket (manual)');
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnected(false);
  }, [stopHeartbeat, logger]);

  // Auto-connect on mount
  useEffect(() => {
    if (opts.autoConnect && token) {
      shouldReconnectRef.current = true;
      reconnectAttemptRef.current = 0;
      connect();
    }

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.autoConnect, token]); // FIX: connect and disconnect use refs to avoid stale closures

  return {
    connected,
    send,
    subscribe,
    lastMessage,
    connect,
    disconnect,
    reconnectAttempt,
  };
}
