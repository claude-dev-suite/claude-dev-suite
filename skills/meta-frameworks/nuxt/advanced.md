# Nuxt 3 Advanced Patterns

## WebSocket Composable

```ts
// composables/useWebSocket.ts
import { ref, onUnmounted } from 'vue';

export function useWebSocket(url: string) {
  const isConnected = ref(false);
  const lastMessage = ref<unknown>(null);
  let ws: WebSocket | null = null;

  function connect() {
    ws = new WebSocket(url);

    ws.onopen = () => {
      isConnected.value = true;
    };

    ws.onclose = () => {
      isConnected.value = false;
      setTimeout(connect, 3000);
    };

    ws.onmessage = (event) => {
      lastMessage.value = JSON.parse(event.data);
    };
  }

  if (import.meta.client) {
    connect();
  }

  onUnmounted(() => {
    ws?.close();
  });

  function send(data: unknown) {
    ws?.send(JSON.stringify(data));
  }

  return { isConnected, lastMessage, send };
}
```

---

## Usage in Page/Component

```vue
<script setup lang="ts">
const config = useRuntimeConfig();
const { isConnected, lastMessage, send } = useWebSocket(config.public.wsUrl);

const messages = ref<Message[]>([]);

watch(lastMessage, (msg) => {
  if (msg) {
    messages.value.push(msg as Message);
  }
});

function sendMessage(content: string) {
  send({ type: 'message', content });
}
</script>

<template>
  <div>
    <div>{{ isConnected ? 'Connected' : 'Disconnected' }}</div>
    <div v-for="msg in messages" :key="msg.id">
      {{ msg.content }}
    </div>
  </div>
</template>
```

---

## WebSocket Server Route (Nitro)

```ts
// server/routes/_ws.ts
// Note: WebSocket support in Nitro is experimental

export default defineWebSocketHandler({
  open(peer) {
    console.log('Client connected:', peer.id);
    peer.subscribe('chat');
  },

  message(peer, message) {
    const data = JSON.parse(message.text());

    if (data.type === 'message') {
      // Broadcast to all subscribed peers
      peer.publish('chat', JSON.stringify({
        type: 'message',
        content: data.content,
        from: peer.id,
      }));
    }
  },

  close(peer) {
    console.log('Client disconnected:', peer.id);
  },
});
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nitro: {
    experimental: {
      websocket: true,
    },
  },
});
```

---

## With Socket.IO

```ts
// composables/useSocketIO.ts
import { io, Socket } from 'socket.io-client';

export function useSocketIO() {
  const socket = ref<Socket | null>(null);
  const isConnected = ref(false);

  if (import.meta.client) {
    socket.value = io(useRuntimeConfig().public.socketUrl);

    socket.value.on('connect', () => {
      isConnected.value = true;
    });

    socket.value.on('disconnect', () => {
      isConnected.value = false;
    });
  }

  onUnmounted(() => {
    socket.value?.disconnect();
  });

  function emit(event: string, data: unknown) {
    socket.value?.emit(event, data);
  }

  function on<T>(event: string, handler: (data: T) => void) {
    socket.value?.on(event, handler);
    return () => socket.value?.off(event, handler);
  }

  return { isConnected, emit, on };
}
```

---

## Plugin Pattern

```ts
// plugins/websocket.client.ts
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const isConnected = ref(false);
  const handlers = new Map<string, Set<(data: unknown) => void>>();

  let ws: WebSocket;

  function connect() {
    ws = new WebSocket(config.public.wsUrl);

    ws.onopen = () => {
      isConnected.value = true;
    };

    ws.onclose = () => {
      isConnected.value = false;
      setTimeout(connect, 3000);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handlers.get(data.type)?.forEach((handler) => handler(data));
    };
  }

  connect();

  return {
    provide: {
      ws: {
        isConnected,
        send: (data: unknown) => ws.send(JSON.stringify(data)),
        subscribe: (event: string, handler: (data: unknown) => void) => {
          if (!handlers.has(event)) handlers.set(event, new Set());
          handlers.get(event)!.add(handler);
          return () => handlers.get(event)?.delete(handler);
        },
      },
    },
  };
});

// Usage in component
const { $ws } = useNuxtApp();
const unsubscribe = $ws.subscribe('message', (data) => {
  console.log(data);
});
```

---

## Server-Sent Events

```ts
// server/api/events.get.ts
export default defineEventHandler(async (event) => {
  const stream = createEventStream(event);

  // Example: Subscribe to Redis pub/sub
  const unsubscribe = await subscribeToChannel('updates', (data) => {
    stream.push(JSON.stringify(data));
  });

  stream.onClosed(() => {
    unsubscribe();
  });

  return stream.send();
});
```

```vue
<!-- Client usage -->
<script setup lang="ts">
const messages = ref<Message[]>([]);

if (import.meta.client) {
  const eventSource = new EventSource('/api/events');

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    messages.value.push(data);
  };

  onUnmounted(() => {
    eventSource.close();
  });
}
</script>
```

---

## Room Management

```ts
// composables/useRoom.ts
export function useRoom(roomId: string) {
  const { $ws } = useNuxtApp();
  const users = ref<string[]>([]);
  const messages = ref<Message[]>([]);

  const unsubMessage = $ws.subscribe('message', (data: any) => {
    if (data.room === roomId) {
      messages.value.push(data);
    }
  });

  const unsubJoin = $ws.subscribe('user_joined', (data: any) => {
    if (data.room === roomId) {
      users.value.push(data.user);
    }
  });

  // Join room on mount
  $ws.send({ type: 'join', room: roomId });

  onUnmounted(() => {
    $ws.send({ type: 'leave', room: roomId });
    unsubMessage();
    unsubJoin();
  });

  return {
    users: readonly(users),
    messages: readonly(messages),
    sendMessage: (content: string) => {
      $ws.send({ type: 'message', room: roomId, content });
    },
  };
}
```
