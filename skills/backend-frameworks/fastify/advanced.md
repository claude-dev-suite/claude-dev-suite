# Fastify - Advanced Patterns

## WebSocket Authentication

```ts
app.get('/ws', { websocket: true }, async (socket, req) => {
  // Access query params for token
  const token = req.query.token as string;

  if (!token) {
    socket.close(4001, 'Unauthorized');
    return;
  }

  try {
    const user = await verifyToken(token);
    (socket as any).user = user;

    socket.on('message', (data) => {
      handleAuthenticatedMessage(socket, user, JSON.parse(data.toString()));
    });
  } catch {
    socket.close(4001, 'Invalid token');
  }
});

// With preValidation hook
app.register(async (fastify) => {
  fastify.addHook('preValidation', async (req) => {
    const token = req.query.token as string;
    req.user = await verifyToken(token);
  });

  fastify.get('/ws', { websocket: true }, (socket, req) => {
    // req.user is available here
  });
});
```

## Room Management

```ts
const rooms = new Map<string, Set<WebSocket>>();

function joinRoom(socket: WebSocket, roomId: string) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId)!.add(socket);
}

function broadcastToRoom(roomId: string, message: object, exclude?: WebSocket) {
  const clients = rooms.get(roomId);
  if (!clients) return;

  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// Broadcast to all connected clients
function broadcastAll(app: FastifyInstance, message: object) {
  const data = JSON.stringify(message);
  app.websocketServer.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}
```

## Heartbeat & Connection Health

```ts
const HEARTBEAT_INTERVAL = 30000;
const clients = new Map<WebSocket, { isAlive: boolean }>();

app.get('/ws', { websocket: true }, (socket, req) => {
  clients.set(socket, { isAlive: true });

  socket.on('pong', () => {
    const client = clients.get(socket);
    if (client) client.isAlive = true;
  });

  socket.on('close', () => {
    clients.delete(socket);
  });
});

setInterval(() => {
  clients.forEach((state, socket) => {
    if (!state.isAlive) {
      clients.delete(socket);
      return socket.terminate();
    }
    state.isAlive = false;
    socket.ping();
  });
}, HEARTBEAT_INTERVAL);
```

## Message Protocol with Validation

```ts
import { Type, Static } from '@sinclair/typebox';
import Ajv from 'ajv';

const ajv = new Ajv();

const MessageSchema = Type.Object({
  type: Type.String(),
  payload: Type.Unknown(),
  timestamp: Type.Number(),
});

type WSMessage = Static<typeof MessageSchema>;
const validateMessage = ajv.compile(MessageSchema);

app.get('/ws', { websocket: true }, (socket, req) => {
  socket.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (!validateMessage(message)) {
        socket.send(JSON.stringify({ type: 'error', payload: 'Invalid message format' }));
        return;
      }

      handleMessage(socket, message as WSMessage);
    } catch {
      socket.send(JSON.stringify({ type: 'error', payload: 'Invalid JSON' }));
    }
  });
});
```

## Scaling with Redis Pub/Sub

```ts
import { createClient } from 'redis';

const pub = createClient({ url: process.env.REDIS_URL });
const sub = pub.duplicate();

app.register(async (fastify) => {
  await pub.connect();
  await sub.connect();

  await sub.subscribe('ws:messages', (message) => {
    const data = JSON.parse(message);
    fastify.websocketServer.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  });

  fastify.addHook('onClose', async () => {
    await pub.quit();
    await sub.quit();
  });
});
```

## Graceful Shutdown

```ts
import { buildApp } from './app';
import closeWithGrace from 'close-with-grace';

async function start() {
  const app = await buildApp();

  closeWithGrace(
    { delay: 30000 },
    async ({ signal, err }) => {
      if (err) {
        app.log.error({ err }, 'Server error');
      }
      app.log.info({ signal }, 'Shutting down');
      await app.close();
    }
  );

  await app.listen({
    port: parseInt(process.env.PORT || '3000'),
    host: '0.0.0.0',
  });
}

start();
```

## Database Plugin

```ts
import fp from 'fastify-plugin';
import postgres from '@fastify/postgres';

export default fp(async (app) => {
  await app.register(postgres, {
    connectionString: process.env.DATABASE_URL,
    // SECURITY: Use proper CA certificate - { rejectUnauthorized: false } is INSECURE (MITM risk)
    ssl: process.env.NODE_ENV === 'production' ? { ca: process.env.DB_CA_CERT } : false,
    max: 20,
    idleTimeoutMillis: 30000,
  });
});
```
