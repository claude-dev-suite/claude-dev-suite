# Next.js App Router Advanced Patterns

## WebSocket Integration

Next.js App Router doesn't have built-in WebSocket support in the Node.js runtime. Use a separate WebSocket server or edge-compatible solutions.

### Client-Side Hook

```tsx
// hooks/useWebSocket.ts
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export function useWebSocket(url: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<unknown>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(url);

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => {
      setIsConnected(false);
      // Reconnect logic
      setTimeout(() => {
        wsRef.current = new WebSocket(url);
      }, 3000);
    };
    ws.onmessage = (event) => setLastMessage(JSON.parse(event.data));

    wsRef.current = ws;

    return () => ws.close();
  }, [url]);

  const send = useCallback((data: unknown) => {
    wsRef.current?.send(JSON.stringify(data));
  }, []);

  return { isConnected, lastMessage, send };
}
```

### Client Component Usage

```tsx
// components/Chat.tsx
'use client';

import { useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';

export function Chat({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL}/ws?room=${roomId}`;

  const { isConnected, send, lastMessage } = useWebSocket(wsUrl);

  useEffect(() => {
    if (lastMessage) {
      setMessages((prev) => [...prev, lastMessage as Message]);
    }
  }, [lastMessage]);

  return (
    <div>
      <ConnectionStatus connected={isConnected} />
      <MessageList messages={messages} />
      <MessageInput onSend={(text) => send({ type: 'message', content: text })} />
    </div>
  );
}
```

---

## Separate WebSocket Server

```ts
// server/websocket.ts (separate Node.js process)
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 3001 });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const roomId = url.searchParams.get('room');

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    broadcast(roomId!, message);
  });
});

function broadcast(roomId: string, message: object) {
  // Broadcast to room
}
```

---

## With Socket.IO

```tsx
// components/SocketProvider.tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const socketInstance = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      path: '/api/socket',
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
```

---

## Server-Sent Events (App Router Alternative)

```ts
// app/api/events/route.ts
export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (data: object) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Subscribe to events (e.g., from Redis pub/sub)
      const unsubscribe = eventEmitter.on('update', sendEvent);

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

### SSE Client Hook

```tsx
// Client usage
'use client';

export function useSSE(url: string) {
  const [data, setData] = useState<unknown>(null);

  useEffect(() => {
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      setData(JSON.parse(event.data));
    };

    return () => eventSource.close();
  }, [url]);

  return data;
}
```

---

## Real-time with TanStack Query

```tsx
'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/useWebSocket';

export function RealtimeSync() {
  const queryClient = useQueryClient();

  useWebSocket(process.env.NEXT_PUBLIC_WS_URL!, {
    onMessage: (data: any) => {
      switch (data.type) {
        case 'invalidate':
          queryClient.invalidateQueries({ queryKey: data.queryKey });
          break;
        case 'update':
          queryClient.setQueryData(data.queryKey, data.payload);
          break;
      }
    },
  });

  return null;
}
```

---

## Vercel/Edge Considerations

```tsx
// For Vercel deployments, use external WebSocket services:
// - Pusher, Ably, Soketi
// - Supabase Realtime
// - Cloudflare Durable Objects
// - PartyKit

// Example with Pusher
'use client';

import Pusher from 'pusher-js';

export function usePusher(channelName: string) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    const channel = pusher.subscribe(channelName);
    channel.bind('message', (data: Message) => {
      setMessages((prev) => [...prev, data]);
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(channelName);
    };
  }, [channelName]);

  return messages;
}
```
