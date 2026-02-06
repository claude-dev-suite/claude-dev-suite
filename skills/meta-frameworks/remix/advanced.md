# Remix Advanced Patterns

## WebSocket Integration

Remix doesn't have built-in WebSocket support. Use Server-Sent Events for server-to-client push, or a separate WebSocket server.

### Client Hook

```tsx
// hooks/useWebSocket.ts
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

### Usage in Route

```tsx
// routes/chat.$roomId.tsx
import { useWebSocket } from '~/hooks/useWebSocket';

export default function ChatRoom() {
  const { roomId } = useParams();
  const [messages, setMessages] = useState<Message[]>([]);

  const { isConnected, lastMessage, send } = useWebSocket(
    `wss://ws.example.com/chat?room=${roomId}`
  );

  useEffect(() => {
    if (lastMessage) {
      setMessages((prev) => [...prev, lastMessage as Message]);
    }
  }, [lastMessage]);

  return (
    <div>
      <div>{isConnected ? 'Connected' : 'Disconnected'}</div>
      <MessageList messages={messages} />
      <Form onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        send({ type: 'message', content: formData.get('message') });
        e.currentTarget.reset();
      }}>
        <input name="message" disabled={!isConnected} />
        <button type="submit">Send</button>
      </Form>
    </div>
  );
}
```

---

## Server-Sent Events

```tsx
// routes/api.events.ts
import type { LoaderFunctionArgs } from '@remix-run/node';

export async function loader({ request }: LoaderFunctionArgs) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (data: object) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Subscribe to events
      const unsubscribe = eventEmitter.on('update', sendEvent);

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        unsubscribe();
        controller.close();
      });

      // Keep-alive
      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, 30000);

      request.signal.addEventListener('abort', () => {
        clearInterval(keepAlive);
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
// hooks/useEventSource.ts
import { useEffect, useState } from 'react';

export function useEventSource<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Event | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      setData(JSON.parse(event.data));
    };

    eventSource.onerror = (err) => {
      setError(err);
      eventSource.close();
    };

    return () => eventSource.close();
  }, [url]);

  return { data, error };
}

// Usage
function LiveUpdates() {
  const { data } = useEventSource<Update>('/api/events');

  useEffect(() => {
    if (data) {
      // Handle update
    }
  }, [data]);

  return <div>{/* Render updates */}</div>;
}
```

---

## With Socket.IO

```tsx
// context/socket.tsx
import { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const socketInstance = io(window.ENV.SOCKET_URL);
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

// root.tsx
export default function App() {
  return (
    <SocketProvider>
      <Outlet />
    </SocketProvider>
  );
}
```

---

## Hybrid: Actions + WebSocket

```tsx
// routes/chat.$roomId.tsx
import { useFetcher } from '@remix-run/react';

// Server action for persistence
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const message = formData.get('message');

  // Save to database
  const saved = await db.messages.create({ content: message });

  // Broadcast via WebSocket/Redis
  await broadcastToRoom(saved.roomId, saved);

  return json({ success: true });
}

export default function ChatRoom() {
  const fetcher = useFetcher();
  const [messages, setMessages] = useState<Message[]>([]);

  // Real-time updates via WebSocket
  const { lastMessage } = useWebSocket(`wss://ws.example.com/rooms/${roomId}`);

  useEffect(() => {
    if (lastMessage) {
      setMessages((prev) => [...prev, lastMessage as Message]);
    }
  }, [lastMessage]);

  return (
    <div>
      <MessageList messages={messages} />
      <fetcher.Form method="post">
        <input name="message" />
        <button type="submit">Send</button>
      </fetcher.Form>
    </div>
  );
}
```

---

## Room Management

```tsx
// hooks/useRoom.ts
import { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';

export function useRoom(roomId: string) {
  const [users, setUsers] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  const { isConnected, lastMessage, send } = useWebSocket(
    `wss://ws.example.com/rooms/${roomId}`
  );

  useEffect(() => {
    if (!lastMessage) return;

    const msg = lastMessage as { type: string; [key: string]: any };

    switch (msg.type) {
      case 'message':
        setMessages((prev) => [...prev, msg as Message]);
        break;
      case 'user_joined':
        setUsers((prev) => [...prev, msg.user]);
        break;
      case 'user_left':
        setUsers((prev) => prev.filter((u) => u !== msg.user));
        break;
    }
  }, [lastMessage]);

  useEffect(() => {
    if (isConnected) {
      send({ type: 'join', room: roomId });
    }
    return () => {
      send({ type: 'leave', room: roomId });
    };
  }, [isConnected, roomId, send]);

  const sendMessage = useCallback(
    (content: string) => {
      send({ type: 'message', room: roomId, content });
    },
    [roomId, send]
  );

  return { users, messages, sendMessage, isConnected };
}
```
