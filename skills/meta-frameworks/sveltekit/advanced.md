# SvelteKit Advanced Patterns

## WebSocket Integration

SvelteKit doesn't have built-in WebSocket support. Use a separate WebSocket server or Server-Sent Events.

### Client Store (Svelte 5)

```ts
// lib/websocket.svelte.ts
import { getContext, setContext, onDestroy } from 'svelte';

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
      setTimeout(connect, 3000);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      lastMessage = data;
      handlers.get(data.type)?.forEach((handler) => handler(data));
    };
  }

  connect();

  const store = {
    get isConnected() { return isConnected; },
    get lastMessage() { return lastMessage; },
    send: (data: unknown) => ws?.send(JSON.stringify(data)),
    subscribe: (event: string, handler: (data: unknown) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
      return () => handlers.get(event)?.delete(handler);
    },
  };

  setContext(WS_KEY, store);
  return store;
}

export function getWebSocket() {
  return getContext(WS_KEY);
}
```

### Usage in Component

```svelte
<!-- routes/chat/[roomId]/+page.svelte -->
<script lang="ts">
  import { getWebSocket } from '$lib/websocket.svelte';
  import { onDestroy } from 'svelte';
  import { page } from '$app/stores';

  const ws = getWebSocket();
  let messages = $state<Message[]>([]);
  let newMessage = $state('');

  const unsubscribe = ws.subscribe('message', (data) => {
    messages = [...messages, data as Message];
  });

  $effect(() => {
    ws.send({ type: 'join', room: $page.params.roomId });
    return () => {
      ws.send({ type: 'leave', room: $page.params.roomId });
    };
  });

  function sendMessage() {
    if (newMessage.trim()) {
      ws.send({ type: 'message', room: $page.params.roomId, content: newMessage });
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
    <input bind:value={newMessage} disabled={!ws.isConnected} />
    <button type="submit" disabled={!ws.isConnected}>Send</button>
  </form>
</div>
```

---

## Server-Sent Events

```ts
// routes/api/events/+server.ts
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, locals }) => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (data: object) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Subscribe to events (e.g., from Redis pub/sub)
      const unsubscribe = eventEmitter.on('update', sendEvent);

      // Keep-alive
      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, 30000);

      request.signal.addEventListener('abort', () => {
        unsubscribe();
        clearInterval(keepAlive);
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
};
```

### SSE Client Hook

```ts
// lib/useSSE.svelte.ts
import { onDestroy } from 'svelte';

export function useSSE<T>(url: string) {
  let data = $state<T | null>(null);
  let error = $state<string | null>(null);
  let connected = $state(false);

  const eventSource = new EventSource(url);

  eventSource.onopen = () => {
    connected = true;
  };

  eventSource.onmessage = (event) => {
    data = JSON.parse(event.data);
  };

  eventSource.onerror = () => {
    error = 'Connection error';
    connected = false;
  };

  onDestroy(() => {
    eventSource.close();
  });

  return {
    get data() { return data; },
    get error() { return error; },
    get connected() { return connected; },
  };
}
```

---

## Socket.IO Integration

```ts
// lib/socketio.svelte.ts
import { io, Socket } from 'socket.io-client';
import { onDestroy } from 'svelte';
import { browser } from '$app/environment';

export function useSocketIO(url: string) {
  let isConnected = $state(false);
  let socket: Socket | null = null;

  if (browser) {
    socket = io(url);

    socket.on('connect', () => {
      isConnected = true;
    });

    socket.on('disconnect', () => {
      isConnected = false;
    });
  }

  onDestroy(() => {
    socket?.disconnect();
  });

  return {
    get isConnected() { return isConnected; },
    emit: (event: string, data: unknown) => socket?.emit(event, data),
    on: (event: string, handler: (data: unknown) => void) => {
      socket?.on(event, handler);
      return () => socket?.off(event, handler);
    },
  };
}
```

---

## Hybrid: Form Actions + WebSocket

```svelte
<!-- routes/chat/[roomId]/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { getWebSocket } from '$lib/websocket.svelte';

  export let data; // From load function

  const ws = getWebSocket();
  let messages = $state(data.messages);

  // Real-time updates
  ws.subscribe('message', (msg: any) => {
    if (msg.roomId === data.roomId) {
      messages = [...messages, msg];
    }
  });
</script>

<!-- Form persists to database, WebSocket broadcasts -->
<form method="POST" use:enhance>
  <input name="message" />
  <button type="submit">Send</button>
</form>
```

```ts
// routes/chat/[roomId]/+page.server.ts
export const actions = {
  default: async ({ request, params }) => {
    const formData = await request.formData();
    const message = formData.get('message');

    // Save to database
    const saved = await db.messages.create({
      roomId: params.roomId,
      content: message,
    });

    // Broadcast via WebSocket/Redis
    await broadcastToRoom(params.roomId, saved);

    return { success: true };
  },
};
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

## Streaming Data

```typescript
// Streaming
export const load: PageServerLoad = async () => {
  return {
    critical: await getCriticalData(),
    streamed: {
      slow: getSlowData(), // Not awaited
    },
  };
};
```

```svelte
<!-- +page.svelte -->
{#await data.streamed.slow}
  <Skeleton />
{:then slowData}
  <SlowContent data={slowData} />
{/await}
```
