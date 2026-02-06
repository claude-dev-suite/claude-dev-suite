---
name: express
description: |
  Express.js minimal Node.js web framework. Covers routing, middleware,
  error handling, and API design. Use when building Express APIs.

  USE WHEN: user mentions "Express", "express.js", "app.use", "middleware", "express Router", asks about "minimalist Node.js framework", "simple REST API", "lightweight web server", "Node.js middleware pattern"

  DO NOT USE FOR: Enterprise applications with DI - use `nestjs` instead, High-performance APIs - use `fastify` instead, Edge runtimes - use `hono` instead, Deno - use `oak` or `fresh` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Express Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `express` for comprehensive documentation.

## Basic Setup

```ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/users', userRoutes);

// Error handler (must be last)
app.use(errorHandler);

app.listen(3000);
```

## Route Patterns

```ts
import { Router } from 'express';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const users = await db.users.findMany();
    res.json(users);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const user = await db.users.create(req.body);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  const user = await db.users.find(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(user);
});
```

## Middleware Pattern

```ts
// Auth middleware
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.user = await verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

router.get('/protected', authenticate, handler);
```

## Error Handler

```ts
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
};
```

## Production Readiness

### Security Configuration

```ts
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import hpp from 'hpp';

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));

// CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});
app.use('/api', limiter);

// Slow down repeated requests
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 50,
  delayMs: (hits) => hits * 100,
});
app.use('/api', speedLimiter);

// Prevent HTTP Parameter Pollution
app.use(hpp());

// Body parsing with limits
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);
```

### Health Checks

```ts
// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Readiness endpoint (check dependencies)
app.get('/ready', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ready', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', database: 'disconnected' });
  }
});

// Liveness endpoint
app.get('/live', (req, res) => {
  res.status(200).send('OK');
});
```

### Structured Logging

```ts
import pino from 'pino-http';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: ['req.headers.authorization', 'req.body.password'],
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      query: req.query,
      params: req.params,
    }),
  },
});

app.use(logger);
```

### Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Request latency p99 | > 500ms |
| Error rate (5xx) | > 1% |
| Memory usage | > 80% |
| Event loop lag | > 100ms |
| Active handles | > 1000 |

### Graceful Shutdown

```ts
const server = app.listen(PORT);

const gracefulShutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down gracefully`);

  server.close(async () => {
    console.log('HTTP server closed');
    await db.disconnect();
    process.exit(0);
  });

  // Force shutdown after 30s
  setTimeout(() => {
    console.error('Forced shutdown');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

### Error Handler (Production)

```ts
const errorHandler = (err, req, res, next) => {
  // Log error
  req.log.error({
    err,
    method: req.method,
    url: req.url,
    body: req.body,
  });

  // Don't leak error details in production
  const statusCode = err.statusCode || err.status || 500;
  const message = statusCode === 500 && process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : err.message;

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

// Must be last middleware
app.use(errorHandler);
```

### Checklist

- [ ] Helmet security headers enabled
- [ ] CORS properly configured
- [ ] Rate limiting on API endpoints
- [ ] Body size limits configured
- [ ] Input validation (express-validator/joi)
- [ ] HPP protection enabled
- [ ] Structured logging (no console.log)
- [ ] Health/readiness/liveness endpoints
- [ ] Graceful shutdown handling
- [ ] Error details hidden in production
- [ ] HTTPS/TLS in production
- [ ] Trust proxy configured (if behind LB)

## When NOT to Use This Skill

- **Enterprise Architecture**: Use NestJS for dependency injection, decorators, and modular design
- **Maximum Performance**: Use Fastify for schema-based validation and faster throughput
- **Edge Runtimes**: Use Hono for Cloudflare Workers, Vercel Edge, or edge-first design
- **Type-Safe APIs**: Consider tRPC with Express or use Fastify/NestJS for better TypeScript integration
- **WebSocket Implementation**: Use dedicated WebSocket skill (coming soon)
- **GraphQL**: Defer to `graphql-expert` for Apollo Server setup
- **Database Queries**: Use `prisma-expert` or `sql-expert` for ORM/query specifics

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using `app.get('*')` before specific routes | Catches all requests, routes unreachable | Place catch-all routes last |
| Not using `next()` in middleware | Request hangs, no response sent | Always call `next()` or send response |
| Synchronous error throwing without try-catch | Crashes server | Wrap in try-catch, use `next(err)` |
| Using `res.send()` multiple times | "Headers already sent" error | Send response once per request |
| Not setting `trust proxy` behind load balancer | Wrong client IP, rate limiting fails | Set `app.set('trust proxy', 1)` |
| Parsing body without size limits | DoS vulnerability | Set `limit: '10kb'` in body parsers |
| Using `app.use(express.static())` without path | Serves entire filesystem | Specify explicit public directory |
| Mixing callback and promise styles | Inconsistent error handling | Use async/await consistently |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| "Cannot set headers after sent" | Multiple `res.send()` calls | Ensure only one response per request |
| Middleware not executing | Registered after routes | Move `app.use()` before route definitions |
| 404 for all routes | Routes defined after `app.listen()` | Define routes before calling `listen()` |
| Request hangs indefinitely | Middleware missing `next()` | Add `next()` or send response |
| CORS errors despite cors middleware | Middleware order issue | Place `app.use(cors())` before routes |
| Rate limiting not working | Behind proxy without trust proxy | Set `app.set('trust proxy', 1)` |
| Body parser returns undefined | Wrong content-type header | Ensure `Content-Type: application/json` |
| Static files not serving | Wrong path configuration | Use absolute path: `express.static(path.join(__dirname, 'public'))` |

## WebSocket Integration

> **Note**: For WebSocket functionality, consider using a dedicated WebSocket library alongside Express.

## Setup with ws

```ts
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Connection handling
wss.on('connection', (ws: WebSocket, req) => {
  const userId = new URL(req.url!, `http://${req.headers.host}`).searchParams.get('userId');
  console.log(`Client connected: ${userId}`);

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    handleMessage(ws, message);
  });

  ws.on('close', () => {
    console.log(`Client disconnected: ${userId}`);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

server.listen(3000);
```

### Authentication

```ts
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';

const wss = new WebSocketServer({
  server,
  verifyClient: async ({ req }, done) => {
    const token = req.url?.split('token=')[1];
    if (!token) return done(false, 401, 'Unauthorized');

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!);
      (req as any).user = decoded;
      done(true);
    } catch {
      done(false, 401, 'Invalid token');
    }
  },
});
```

### Room Management

```ts
const rooms = new Map<string, Set<WebSocket>>();

function joinRoom(ws: WebSocket, roomId: string) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId)!.add(ws);
}

function leaveRoom(ws: WebSocket, roomId: string) {
  rooms.get(roomId)?.delete(ws);
  if (rooms.get(roomId)?.size === 0) {
    rooms.delete(roomId);
  }
}

function broadcastToRoom(roomId: string, message: object, exclude?: WebSocket) {
  const clients = rooms.get(roomId);
  if (!clients) return;

  const data = JSON.stringify(message);
  clients.forEach((client) => {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}
```

### Heartbeat & Connection Health

```ts
const HEARTBEAT_INTERVAL = 30000;

wss.on('connection', (ws: WebSocket) => {
  (ws as any).isAlive = true;

  ws.on('pong', () => {
    (ws as any).isAlive = true;
  });
});

const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if ((ws as any).isAlive === false) {
      return ws.terminate();
    }
    (ws as any).isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

wss.on('close', () => clearInterval(heartbeat));
```

### Message Protocol

```ts
interface WSMessage {
  type: string;
  payload: unknown;
  timestamp: number;
}

function handleMessage(ws: WebSocket, message: WSMessage) {
  switch (message.type) {
    case 'join_room':
      joinRoom(ws, message.payload as string);
      break;
    case 'leave_room':
      leaveRoom(ws, message.payload as string);
      break;
    case 'broadcast':
      broadcastToRoom(
        (message.payload as any).roomId,
        (message.payload as any).data
      );
      break;
    default:
      ws.send(JSON.stringify({ type: 'error', payload: 'Unknown message type' }));
  }
}
```

### Scaling with Redis

```ts
import { createClient } from 'redis';

const pub = createClient({ url: process.env.REDIS_URL });
const sub = pub.duplicate();

await pub.connect();
await sub.connect();

// Subscribe to channel
await sub.subscribe('ws:broadcast', (message) => {
  const data = JSON.parse(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
});

// Publish from any server instance
function publishMessage(channel: string, message: object) {
  pub.publish(channel, JSON.stringify(message));
}
```

## Reference Documentation
- [Middleware Patterns](quick-ref/middleware.md)
- [Error Handling](quick-ref/errors.md)
