---
name: socket-io
description: |
  Socket.IO real-time bidirectional communication. Rooms, namespaces,
  acknowledgments, middleware, scaling with Redis adapter, and TypeScript types.

  USE WHEN: user mentions "Socket.IO", "socket.io", "real-time chat",
  "live updates", "bidirectional WebSocket", "rooms", "namespaces"

  DO NOT USE FOR: SSE (server-sent events) - use `sse`;
  WebRTC - use `webrtc`; raw WebSocket without Socket.IO - use framework WS skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Socket.IO

## Server Setup

```typescript
import { Server } from 'socket.io';
import { createServer } from 'http';

const httpServer = createServer(app);

interface ServerToClientEvents {
  message: (data: { user: string; text: string; timestamp: number }) => void;
  userJoined: (user: string) => void;
}

interface ClientToServerEvents {
  sendMessage: (text: string, callback: (status: 'ok' | 'error') => void) => void;
  joinRoom: (room: string) => void;
}

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: process.env.CLIENT_URL },
});

// Authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  try {
    socket.data.user = verifyToken(token);
    next();
  } catch {
    next(new Error('Authentication failed'));
  }
});

io.on('connection', (socket) => {
  console.log(`${socket.data.user.name} connected`);

  socket.on('joinRoom', (room) => {
    socket.join(room);
    socket.to(room).emit('userJoined', socket.data.user.name);
  });

  socket.on('sendMessage', (text, callback) => {
    const message = { user: socket.data.user.name, text, timestamp: Date.now() };
    io.to('general').emit('message', message);
    callback('ok');
  });

  socket.on('disconnect', () => {
    console.log(`${socket.data.user.name} disconnected`);
  });
});
```

## Client Setup

```typescript
import { io, Socket } from 'socket.io-client';

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(API_URL, {
  auth: { token: getAuthToken() },
  reconnection: true,
  reconnectionDelay: 1000,
});

socket.on('connect', () => console.log('Connected'));
socket.on('message', (data) => addMessage(data));
socket.on('connect_error', (err) => console.error(err.message));

// With acknowledgment
socket.emit('sendMessage', 'Hello!', (status) => {
  if (status === 'error') showError('Failed to send');
});
```

## Scaling with Redis Adapter

```typescript
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
```

## React Hook

```tsx
function useSocket(room: string) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    socket.emit('joinRoom', room);
    socket.on('message', (msg) => setMessages((prev) => [...prev, msg]));
    return () => { socket.off('message'); };
  }, [room]);

  const send = (text: string) => socket.emit('sendMessage', text, () => {});
  return { messages, send };
}
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| No authentication | Use `io.use()` middleware with JWT |
| Broadcasting to all instead of rooms | Use `socket.to(room).emit()` |
| No reconnection handling | Enable reconnection, show UI indicator |
| Single server without adapter | Use Redis adapter for horizontal scaling |
| No acknowledgments for critical events | Use callback parameter for delivery confirmation |

## Production Checklist

- [ ] Authentication middleware on connection
- [ ] Redis adapter for multi-server deployment
- [ ] Reconnection with exponential backoff
- [ ] Room-based message scoping
- [ ] Connection state UI indicator
- [ ] Rate limiting on message events
