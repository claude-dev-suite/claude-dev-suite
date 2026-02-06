# Svelte 5 Advanced Patterns

## WebSocket Store (Svelte 5)

```ts
// lib/websocket.svelte.ts
import { getContext, setContext, onDestroy } from 'svelte';

interface WebSocketStore {
  isConnected: boolean;
  lastMessage: unknown;
  send: (data: unknown) => void;
  subscribe: (event: string, handler: (data: unknown) => void) => () => void;
}

const WS_KEY = Symbol('websocket');

export function createWebSocket(url: string) {
  let isConnected = $state(false);
  let lastMessage = $state<unknown>(null);
  let ws: WebSocket | null = null;
  const handlers = new Map<string, Set<(data: unknown) => void>>();

  function connect() {
    ws = new WebSocket(url);

    ws.onopen = () => {
      isConnected = true;
    };

    ws.onclose = () => {
      isConnected = false;
      // Reconnect after 3 seconds
      setTimeout(connect, 3000);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      lastMessage = data;
      handlers.get(data.type)?.forEach((handler) => handler(data));
    };
  }

  connect();

  const store: WebSocketStore = {
    get isConnected() { return isConnected; },
    get lastMessage() { return lastMessage; },
    send: (data) => ws?.send(JSON.stringify(data)),
    subscribe: (event, handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
      return () => handlers.get(event)?.delete(handler);
    },
  };

  setContext(WS_KEY, store);
  return store;
}

export function getWebSocket(): WebSocketStore {
  return getContext(WS_KEY);
}
```

---

## Chat Component

```svelte
<!-- Chat.svelte -->
<script lang="ts">
  import { getWebSocket } from '$lib/websocket.svelte';
  import { onDestroy } from 'svelte';

  interface Message {
    id: string;
    content: string;
    user: string;
  }

  const ws = getWebSocket();
  let messages = $state<Message[]>([]);
  let newMessage = $state('');

  const unsubscribe = ws.subscribe('message', (data) => {
    messages = [...messages, data as Message];
  });

  function sendMessage() {
    if (newMessage.trim()) {
      ws.send({ type: 'message', content: newMessage });
      newMessage = '';
    }
  }

  onDestroy(unsubscribe);
</script>

<div class="chat">
  <div class="status" class:connected={ws.isConnected}>
    {ws.isConnected ? 'Connected' : 'Disconnected'}
  </div>

  <div class="messages">
    {#each messages as message (message.id)}
      <div class="message">
        <strong>{message.user}:</strong> {message.content}
      </div>
    {/each}
  </div>

  <form onsubmit={sendMessage}>
    <input
      bind:value={newMessage}
      disabled={!ws.isConnected}
      placeholder="Type a message..."
    />
    <button type="submit" disabled={!ws.isConnected}>Send</button>
  </form>
</div>
```

---

## Provider Component

```svelte
<!-- WebSocketProvider.svelte -->
<script lang="ts">
  import { createWebSocket } from '$lib/websocket.svelte';

  interface Props {
    url: string;
    children: import('svelte').Snippet;
  }

  let { url, children }: Props = $props();

  createWebSocket(url);
</script>

{@render children()}

<!-- App.svelte -->
<script>
  import WebSocketProvider from './WebSocketProvider.svelte';
  import Chat from './Chat.svelte';
</script>

<WebSocketProvider url="wss://api.example.com/ws">
  <Chat />
</WebSocketProvider>
```

---

## Room Management

```ts
// lib/room.svelte.ts
import { getWebSocket } from './websocket.svelte';
import { onDestroy } from 'svelte';

export function useRoom(roomId: string) {
  const ws = getWebSocket();
  let users = $state<string[]>([]);
  let messages = $state<Message[]>([]);

  const unsubMessage = ws.subscribe('message', (data: any) => {
    if (data.room === roomId) {
      messages = [...messages, data];
    }
  });

  const unsubJoin = ws.subscribe('user_joined', (data: any) => {
    if (data.room === roomId) {
      users = [...users, data.user];
    }
  });

  const unsubLeave = ws.subscribe('user_left', (data: any) => {
    if (data.room === roomId) {
      users = users.filter((u) => u !== data.user);
    }
  });

  // Join room
  ws.send({ type: 'join', room: roomId });

  onDestroy(() => {
    ws.send({ type: 'leave', room: roomId });
    unsubMessage();
    unsubJoin();
    unsubLeave();
  });

  return {
    get users() { return users; },
    get messages() { return messages; },
    sendMessage: (content: string) => {
      ws.send({ type: 'message', room: roomId, content });
    },
  };
}
```

---

## Socket.IO Integration

```ts
// lib/socketio.svelte.ts
import { io, Socket } from 'socket.io-client';
import { onDestroy } from 'svelte';

export function useSocketIO(url: string, token?: string) {
  let isConnected = $state(false);
  let socket: Socket;

  socket = io(url, {
    auth: token ? { token } : undefined,
  });

  socket.on('connect', () => {
    isConnected = true;
  });

  socket.on('disconnect', () => {
    isConnected = false;
  });

  onDestroy(() => {
    socket.disconnect();
  });

  return {
    get isConnected() { return isConnected; },
    emit: (event: string, data: unknown) => socket.emit(event, data),
    on: (event: string, handler: (data: unknown) => void) => {
      socket.on(event, handler);
      return () => socket.off(event, handler);
    },
  };
}
```

---

## SvelteKit SSE Alternative

```ts
// routes/api/events/+server.ts
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Subscribe to events
      const unsubscribe = eventEmitter.on('message', (data) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      });

      // Cleanup on close
      return () => unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};

// Client usage
const eventSource = new EventSource('/api/events');
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle message
};
```
