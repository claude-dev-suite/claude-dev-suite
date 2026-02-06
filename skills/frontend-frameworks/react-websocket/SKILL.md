---
name: react-websocket
description: |
  WebSocket integration patterns for React applications. Covers custom hooks,
  context providers, Socket.IO, and real-time state synchronization with
  TanStack Query.

  USE WHEN: user mentions "WebSocket in React", "real-time React", "Socket.IO React",
  "useWebSocket hook", "live updates", "chat application", "real-time notifications",
  asks about "how to connect WebSocket in React"

  DO NOT USE FOR: NestJS WebSocket gateways - use `nestjs-websocket` instead,
  Spring WebSocket - use `spring-websocket` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# React WebSocket Integration

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `react` for comprehensive documentation.

## Custom WebSocket Hook

```tsx
import { useState, useEffect, useCallback, useRef } from 'react';

interface UseWebSocketOptions {
  url: string;
  onMessage?: (data: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  reconnect?: boolean;
  reconnectInterval?: number;
  reconnectAttempts?: number;
}

export function useWebSocket({
  url,
  onMessage,
  onOpen,
  onClose,
  onError,
  reconnect = true,
  reconnectInterval = 3000,
  reconnectAttempts = 5,
}: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<unknown>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);

  const connect = useCallback(() => {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setIsConnected(true);
      reconnectCountRef.current = 0;
      onOpen?.();
    };

    ws.onclose = () => {
      setIsConnected(false);
      onClose?.();

      if (reconnect && reconnectCountRef.current < reconnectAttempts) {
        reconnectCountRef.current++;
        setTimeout(connect, reconnectInterval);
      }
    };

    ws.onerror = (error) => {
      onError?.(error);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setLastMessage(data);
      onMessage?.(data);
    };

    wsRef.current = ws;
  }, [url, onMessage, onOpen, onClose, onError, reconnect, reconnectInterval, reconnectAttempts]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
  }, []);

  return { isConnected, lastMessage, send, disconnect };
}
```

## Usage Example

```tsx
function ChatRoom({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);

  const { isConnected, send } = useWebSocket({
    url: `wss://api.example.com/ws?room=${roomId}`,
    onMessage: (data) => {
      setMessages((prev) => [...prev, data as Message]);
    },
    onOpen: () => {
      send({ type: 'join', room: roomId });
    },
  });

  const handleSend = (text: string) => {
    send({ type: 'message', content: text, room: roomId });
  };

  return (
    <div>
      <div>Status: {isConnected ? 'Connected' : 'Disconnected'}</div>
      <MessageList messages={messages} />
      <MessageInput onSend={handleSend} disabled={!isConnected} />
    </div>
  );
}
```

## Context Provider Pattern

```tsx
import { createContext, useContext, ReactNode } from 'react';

interface WebSocketContextValue {
  isConnected: boolean;
  send: (data: unknown) => void;
  subscribe: (event: string, handler: (data: unknown) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function WebSocketProvider({ url, children }: { url: string; children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<(data: unknown) => void>>>(new Map());

  useEffect(() => {
    const ws = new WebSocket(url);

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const handlers = handlersRef.current.get(data.type);
      handlers?.forEach((handler) => handler(data));
    };

    wsRef.current = ws;
    return () => ws.close();
  }, [url]);

  const send = useCallback((data: unknown) => {
    wsRef.current?.send(JSON.stringify(data));
  }, []);

  const subscribe = useCallback((event: string, handler: (data: unknown) => void) => {
    if (!handlersRef.current.has(event)) {
      handlersRef.current.set(event, new Set());
    }
    handlersRef.current.get(event)!.add(handler);

    return () => {
      handlersRef.current.get(event)?.delete(handler);
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ isConnected, send, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWS() {
  const context = useContext(WebSocketContext);
  if (!context) throw new Error('useWS must be used within WebSocketProvider');
  return context;
}
```

## Socket.IO Integration

```tsx
import { io, Socket } from 'socket.io-client';
import { useEffect, useRef, useState, useCallback } from 'react';

export function useSocketIO(url: string) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(url, {
      auth: { token: getAuthToken() },
      reconnection: true,
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [url]);

  const emit = useCallback((event: string, data: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback((event: string, handler: (data: unknown) => void) => {
    socketRef.current?.on(event, handler);
    return () => {
      socketRef.current?.off(event, handler);
    };
  }, []);

  return { isConnected, emit, on, socket: socketRef.current };
}
```

## TanStack Query Integration

```tsx
import { useQueryClient } from '@tanstack/react-query';

function useRealtimeUpdates() {
  const queryClient = useQueryClient();

  useWebSocket({
    url: 'wss://api.example.com/ws',
    onMessage: (data: any) => {
      switch (data.type) {
        case 'user_updated':
          queryClient.invalidateQueries({ queryKey: ['users', data.userId] });
          break;
        case 'message_created':
          queryClient.setQueryData(['messages', data.roomId], (old: Message[]) => [
            ...old,
            data.message,
          ]);
          break;
      }
    },
  });
}
```

## Connection Status Component

```tsx
function ConnectionStatus() {
  const { isConnected } = useWS();

  return (
    <div
      className={`flex items-center gap-2 ${isConnected ? 'text-green-500' : 'text-red-500'}`}
    >
      <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
      {isConnected ? 'Connected' : 'Disconnected'}
    </div>
  );
}
```

## Anti-Patterns

| Anti-Pattern | Why Bad | Correct Approach |
|--------------|---------|------------------|
| Creating WebSocket in render | Creates new connection every render | Use useRef or context |
| Not cleaning up on unmount | Memory leaks, duplicate connections | Return cleanup in useEffect |
| Missing reconnection logic | Lost connections not recovered | Implement exponential backoff |
| Storing socket in state | Unnecessary re-renders | Use useRef instead |
| Not handling connection errors | Silent failures | Add onError handler |

## Quick Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Connection closes immediately | CORS or auth issues | Check server CORS config |
| Messages not received | Wrong event type | Verify message format matches |
| Multiple connections | Missing cleanup | Add cleanup in useEffect |
| State not updating | Stale closure | Use functional setState |
| Reconnect loop | Server rejecting | Add max reconnect attempts |

## Production Checklist

- [ ] Reconnection with exponential backoff
- [ ] Connection status indicator
- [ ] Graceful disconnect on unmount
- [ ] Error handling and logging
- [ ] Authentication token refresh
- [ ] Message queue for offline
- [ ] Heartbeat/ping mechanism

## When NOT to Use This Skill

- For server-side WebSocket (NestJS) → use `nestjs-websocket`
- For Spring WebSocket → use `spring-websocket`
- For simple HTTP polling → use `tanstack-query` with refetchInterval

## Reference Documentation
- [React Hooks](../react-hooks/SKILL.md)
- [TanStack Query](../../state-management/tanstack-query/SKILL.md)
