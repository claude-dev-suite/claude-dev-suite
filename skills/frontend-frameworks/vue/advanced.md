# Vue 3 Advanced Patterns

## WebSocket Composable

```ts
// composables/useWebSocket.ts
import { ref, onUnmounted, watch } from 'vue';

interface UseWebSocketOptions {
  onMessage?: (data: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  reconnect?: boolean;
  reconnectInterval?: number;
  reconnectAttempts?: number;
}

export function useWebSocket(url: string | Ref<string>, options: UseWebSocketOptions = {}) {
  const {
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnect = true,
    reconnectInterval = 3000,
    reconnectAttempts = 5,
  } = options;

  const isConnected = ref(false);
  const lastMessage = ref<unknown>(null);
  let ws: WebSocket | null = null;
  let reconnectCount = 0;

  function connect() {
    const wsUrl = typeof url === 'string' ? url : url.value;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      isConnected.value = true;
      reconnectCount = 0;
      onOpen?.();
    };

    ws.onclose = () => {
      isConnected.value = false;
      onClose?.();

      if (reconnect && reconnectCount < reconnectAttempts) {
        reconnectCount++;
        setTimeout(connect, reconnectInterval);
      }
    };

    ws.onerror = (error) => {
      onError?.(error);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      lastMessage.value = data;
      onMessage?.(data);
    };
  }

  function send(data: unknown) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  function disconnect() {
    ws?.close();
  }

  // Reconnect on URL change
  if (typeof url !== 'string') {
    watch(url, () => {
      disconnect();
      connect();
    });
  }

  connect();

  onUnmounted(() => {
    disconnect();
  });

  return { isConnected, lastMessage, send, disconnect };
}
```

---

## Usage in Component

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useWebSocket } from '@/composables/useWebSocket';

interface Message {
  id: string;
  content: string;
  user: string;
}

const messages = ref<Message[]>([]);
const newMessage = ref('');

const { isConnected, send } = useWebSocket('wss://api.example.com/ws', {
  onMessage: (data) => {
    messages.value.push(data as Message);
  },
  onOpen: () => {
    send({ type: 'join', room: 'general' });
  },
});

function sendMessage() {
  if (newMessage.value.trim()) {
    send({ type: 'message', content: newMessage.value });
    newMessage.value = '';
  }
}
</script>

<template>
  <div class="chat">
    <div class="status">
      {{ isConnected ? 'Connected' : 'Disconnected' }}
    </div>

    <div class="messages">
      <div v-for="msg in messages" :key="msg.id" class="message">
        <strong>{{ msg.user }}:</strong> {{ msg.content }}
      </div>
    </div>

    <form @submit.prevent="sendMessage">
      <input v-model="newMessage" :disabled="!isConnected" placeholder="Type a message..." />
      <button type="submit" :disabled="!isConnected">Send</button>
    </form>
  </div>
</template>
```

---

## Provide/Inject Pattern

```ts
// plugins/websocket.ts
import { App, inject, InjectionKey, ref, Ref } from 'vue';

interface WebSocketPlugin {
  isConnected: Ref<boolean>;
  send: (data: unknown) => void;
  subscribe: (event: string, handler: (data: unknown) => void) => () => void;
}

const WebSocketKey: InjectionKey<WebSocketPlugin> = Symbol('WebSocket');

export function createWebSocket(url: string) {
  return {
    install(app: App) {
      const isConnected = ref(false);
      const handlers = new Map<string, Set<(data: unknown) => void>>();
      let ws: WebSocket;

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
          const data = JSON.parse(event.data);
          handlers.get(data.type)?.forEach((handler) => handler(data));
        };
      }

      connect();

      const plugin: WebSocketPlugin = {
        isConnected,
        send: (data) => ws.send(JSON.stringify(data)),
        subscribe: (event, handler) => {
          if (!handlers.has(event)) handlers.set(event, new Set());
          handlers.get(event)!.add(handler);
          return () => handlers.get(event)?.delete(handler);
        },
      };

      app.provide(WebSocketKey, plugin);
    },
  };
}

export function useWS(): WebSocketPlugin {
  const ws = inject(WebSocketKey);
  if (!ws) throw new Error('WebSocket plugin not installed');
  return ws;
}

// main.ts
import { createWebSocket } from './plugins/websocket';

const app = createApp(App);
app.use(createWebSocket('wss://api.example.com/ws'));
```

---

## With Socket.IO

```ts
// composables/useSocketIO.ts
import { io, Socket } from 'socket.io-client';
import { ref, onUnmounted } from 'vue';

export function useSocketIO(url: string) {
  const isConnected = ref(false);
  let socket: Socket;

  socket = io(url, {
    auth: { token: getAuthToken() },
  });

  socket.on('connect', () => {
    isConnected.value = true;
  });

  socket.on('disconnect', () => {
    isConnected.value = false;
  });

  function emit(event: string, data: unknown) {
    socket.emit(event, data);
  }

  function on(event: string, handler: (data: unknown) => void) {
    socket.on(event, handler);
    return () => socket.off(event, handler);
  }

  onUnmounted(() => {
    socket.disconnect();
  });

  return { isConnected, emit, on };
}
```

---

## Reactive Room Management

```ts
// composables/useRoom.ts
import { ref, computed, onUnmounted } from 'vue';
import { useWS } from './useWebSocket';

export function useRoom(roomId: string) {
  const { send, subscribe } = useWS();
  const users = ref<string[]>([]);
  const messages = ref<Message[]>([]);

  const unsubMessage = subscribe('message', (data: any) => {
    if (data.room === roomId) {
      messages.value.push(data);
    }
  });

  const unsubJoin = subscribe('user_joined', (data: any) => {
    if (data.room === roomId) {
      users.value.push(data.user);
    }
  });

  const unsubLeave = subscribe('user_left', (data: any) => {
    if (data.room === roomId) {
      users.value = users.value.filter((u) => u !== data.user);
    }
  });

  // Join room on mount
  send({ type: 'join', room: roomId });

  onUnmounted(() => {
    send({ type: 'leave', room: roomId });
    unsubMessage();
    unsubJoin();
    unsubLeave();
  });

  const sendMessage = (content: string) => {
    send({ type: 'message', room: roomId, content });
  };

  return {
    users: computed(() => users.value),
    messages: computed(() => messages.value),
    sendMessage,
  };
}
```
