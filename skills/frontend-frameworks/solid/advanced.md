# SolidJS Advanced Patterns

## WebSocket Primitive

```tsx
// lib/websocket.ts
import { createSignal, onCleanup, createContext, useContext, ParentComponent } from 'solid-js';

interface WebSocketState {
  isConnected: () => boolean;
  lastMessage: () => unknown;
  send: (data: unknown) => void;
  subscribe: (event: string, handler: (data: unknown) => void) => () => void;
}

export function createWebSocket(url: string): WebSocketState {
  const [isConnected, setIsConnected] = createSignal(false);
  const [lastMessage, setLastMessage] = createSignal<unknown>(null);
  let ws: WebSocket | null = null;
  const handlers = new Map<string, Set<(data: unknown) => void>>();
  let reconnectAttempts = 0;

  function connect() {
    ws = new WebSocket(url);

    ws.onopen = () => {
      setIsConnected(true);
      reconnectAttempts = 0;
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (reconnectAttempts < 5) {
        reconnectAttempts++;
        setTimeout(connect, 3000);
      }
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setLastMessage(data);
      handlers.get(data.type)?.forEach((handler) => handler(data));
    };
  }

  connect();

  onCleanup(() => ws?.close());

  return {
    isConnected,
    lastMessage,
    send: (data) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    },
    subscribe: (event, handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
      return () => handlers.get(event)?.delete(handler);
    },
  };
}
```

---

## Context Provider

```tsx
// context/WebSocketContext.tsx
import { createContext, useContext, ParentComponent } from 'solid-js';

interface WebSocketContextValue {
  isConnected: () => boolean;
  send: (data: unknown) => void;
  subscribe: (event: string, handler: (data: unknown) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue>();

export const WebSocketProvider: ParentComponent<{ url: string }> = (props) => {
  const ws = createWebSocket(props.url);

  return (
    <WebSocketContext.Provider value={ws}>
      {props.children}
    </WebSocketContext.Provider>
  );
};

export function useWS(): WebSocketContextValue {
  const context = useContext(WebSocketContext);
  if (!context) throw new Error('useWS must be used within WebSocketProvider');
  return context;
}
```

---

## Usage in Component

```tsx
// components/Chat.tsx
import { createSignal, onCleanup, For } from 'solid-js';
import { useWS } from '../context/WebSocketContext';

interface Message {
  id: string;
  content: string;
  user: string;
}

export function Chat() {
  const ws = useWS();
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [newMessage, setNewMessage] = createSignal('');

  const unsubscribe = ws.subscribe('message', (data) => {
    setMessages((prev) => [...prev, data as Message]);
  });

  onCleanup(unsubscribe);

  const sendMessage = (e: Event) => {
    e.preventDefault();
    if (newMessage().trim()) {
      ws.send({ type: 'message', content: newMessage() });
      setNewMessage('');
    }
  };

  return (
    <div class="chat">
      <div class="status">
        {ws.isConnected() ? 'Connected' : 'Disconnected'}
      </div>

      <div class="messages">
        <For each={messages()}>
          {(message) => (
            <div class="message">
              <strong>{message.user}:</strong> {message.content}
            </div>
          )}
        </For>
      </div>

      <form onSubmit={sendMessage}>
        <input
          value={newMessage()}
          onInput={(e) => setNewMessage(e.target.value)}
          disabled={!ws.isConnected()}
          placeholder="Type a message..."
        />
        <button type="submit" disabled={!ws.isConnected()}>
          Send
        </button>
      </form>
    </div>
  );
}
```

---

## Room Management

```tsx
// hooks/useRoom.ts
import { createSignal, onCleanup } from 'solid-js';
import { useWS } from '../context/WebSocketContext';

interface Message {
  id: string;
  content: string;
  user: string;
  room: string;
}

export function useRoom(roomId: string) {
  const ws = useWS();
  const [users, setUsers] = createSignal<string[]>([]);
  const [messages, setMessages] = createSignal<Message[]>([]);

  const unsubMessage = ws.subscribe('message', (data: any) => {
    if (data.room === roomId) {
      setMessages((prev) => [...prev, data]);
    }
  });

  const unsubJoin = ws.subscribe('user_joined', (data: any) => {
    if (data.room === roomId) {
      setUsers((prev) => [...prev, data.user]);
    }
  });

  const unsubLeave = ws.subscribe('user_left', (data: any) => {
    if (data.room === roomId) {
      setUsers((prev) => prev.filter((u) => u !== data.user));
    }
  });

  // Join room
  ws.send({ type: 'join', room: roomId });

  onCleanup(() => {
    ws.send({ type: 'leave', room: roomId });
    unsubMessage();
    unsubJoin();
    unsubLeave();
  });

  return {
    users,
    messages,
    sendMessage: (content: string) => {
      ws.send({ type: 'message', room: roomId, content });
    },
  };
}
```

---

## With Socket.IO

```tsx
// hooks/useSocketIO.ts
import { createSignal, onCleanup } from 'solid-js';
import { io, Socket } from 'socket.io-client';

export function useSocketIO(url: string, token?: string) {
  const [isConnected, setIsConnected] = createSignal(false);
  let socket: Socket;

  socket = io(url, {
    auth: token ? { token } : undefined,
    reconnection: true,
  });

  socket.on('connect', () => setIsConnected(true));
  socket.on('disconnect', () => setIsConnected(false));

  onCleanup(() => socket.disconnect());

  return {
    isConnected,
    emit: (event: string, data: unknown) => socket.emit(event, data),
    on: (event: string, handler: (data: unknown) => void) => {
      socket.on(event, handler);
      return () => socket.off(event, handler);
    },
  };
}
```

---

## Store Pattern

```tsx
// stores/websocket.ts
import { createStore, produce } from 'solid-js/store';

interface WebSocketState {
  connected: boolean;
  messages: Record<string, Message[]>;
  users: Record<string, string[]>;
}

const [state, setState] = createStore<WebSocketState>({
  connected: false,
  messages: {},
  users: {},
});

export function initWebSocket(url: string) {
  const ws = new WebSocket(url);

  ws.onopen = () => setState('connected', true);
  ws.onclose = () => setState('connected', false);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'message':
        setState(
          produce((s) => {
            if (!s.messages[data.room]) s.messages[data.room] = [];
            s.messages[data.room].push(data);
          })
        );
        break;
      case 'user_joined':
        setState(
          produce((s) => {
            if (!s.users[data.room]) s.users[data.room] = [];
            s.users[data.room].push(data.user);
          })
        );
        break;
    }
  };

  return {
    state,
    send: (data: unknown) => ws.send(JSON.stringify(data)),
  };
}
```
