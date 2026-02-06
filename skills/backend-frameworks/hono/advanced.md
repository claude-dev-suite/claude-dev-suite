# Hono Advanced Patterns

## WebSocket with Hono Helper

```ts
import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/cloudflare-workers'; // or 'hono/bun', 'hono/deno'

const app = new Hono();

app.get(
  '/ws',
  upgradeWebSocket((c) => ({
    onOpen(event, ws) {
      console.log('Connection opened');
    },
    onMessage(event, ws) {
      const message = JSON.parse(event.data as string);
      handleMessage(ws, message);
    },
    onClose(event, ws) {
      console.log('Connection closed');
    },
    onError(event, ws) {
      console.error('WebSocket error:', event);
    },
  }))
);
```

---

## WebSocket Authentication

```ts
import { upgradeWebSocket } from 'hono/cloudflare-workers';
import { verify } from 'hono/jwt';

app.get(
  '/ws',
  upgradeWebSocket((c) => {
    const token = c.req.query('token');

    return {
      onOpen: async (event, ws) => {
        if (!token) {
          ws.close(4001, 'Unauthorized');
          return;
        }

        try {
          const payload = await verify(token, c.env.JWT_SECRET);
          (ws as any).user = payload;
        } catch {
          ws.close(4001, 'Invalid token');
        }
      },
      onMessage(event, ws) {
        const user = (ws as any).user;
        if (!user) return;
        // Handle authenticated messages
      },
    };
  })
);
```

---

## Room Management (Cloudflare Durable Objects)

```ts
export class ChatRoom {
  private sessions: Map<WebSocket, { id: string }> = new Map();

  async fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      await this.handleSession(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response('Not found', { status: 404 });
  }

  async handleSession(ws: WebSocket) {
    ws.accept();
    const id = crypto.randomUUID();
    this.sessions.set(ws, { id });

    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data as string);
      this.broadcast(message, ws);
    });

    ws.addEventListener('close', () => {
      this.sessions.delete(ws);
    });
  }

  broadcast(message: object, exclude?: WebSocket) {
    const data = JSON.stringify(message);
    for (const [ws] of this.sessions) {
      if (ws !== exclude) {
        ws.send(data);
      }
    }
  }
}
```

---

## Node.js with ws Library

```ts
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { WebSocketServer, WebSocket } from 'ws';

const app = new Hono();
const server = serve({ fetch: app.fetch, port: 3000 });

const wss = new WebSocketServer({ server });

const rooms = new Map<string, Set<WebSocket>>();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const roomId = url.searchParams.get('room');

  if (roomId) {
    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    rooms.get(roomId)!.add(ws);
  }

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    broadcastToRoom(roomId!, message, ws);
  });

  ws.on('close', () => {
    if (roomId) {
      rooms.get(roomId)?.delete(ws);
    }
  });
});

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
```

---

## Bun WebSocket

```ts
import { Hono } from 'hono';

const app = new Hono();

const server = Bun.serve({
  fetch: app.fetch,
  websocket: {
    open(ws) {
      console.log('Client connected');
    },
    message(ws, message) {
      const data = JSON.parse(message as string);
      ws.send(JSON.stringify({ received: true }));
    },
    close(ws) {
      console.log('Client disconnected');
    },
  },
  port: 3000,
});

// Upgrade HTTP to WebSocket
app.get('/ws', (c) => {
  const success = server.upgrade(c.req.raw);
  if (success) {
    return new Response(null, { status: 101 });
  }
  return c.json({ error: 'Upgrade failed' }, 400);
});
```

---

## Message Protocol

```ts
interface WSMessage {
  type: 'join' | 'leave' | 'message' | 'ping';
  payload: unknown;
  timestamp: number;
}

function handleMessage(ws: WebSocket, message: WSMessage) {
  switch (message.type) {
    case 'join':
      // Join room logic
      break;
    case 'leave':
      // Leave room logic
      break;
    case 'message':
      // Broadcast message
      break;
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
  }
}
```
