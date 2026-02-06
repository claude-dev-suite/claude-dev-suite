---
name: fastify
description: |
  Fastify high-performance Node.js framework. Covers routing, plugins,
  validation, and serialization. Use when building fast Node.js APIs.

  USE WHEN: user mentions "Fastify", "fastify", "TypeBox", "schema validation", asks about "fast Node.js framework", "high-throughput API", "JSON schema validation", "performance-critical backend", "plugin-based architecture"

  DO NOT USE FOR: Enterprise DI patterns - use `nestjs` instead, Minimalist approach - use `express` instead, Edge runtimes - use `hono` instead, Deno - use `oak` or `fresh` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Fastify Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for WebSocket authentication, room management, heartbeat patterns, message validation, and Redis scaling.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `fastify` for comprehensive documentation.

## Basic Setup

```ts
import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify({ logger: true });

await app.register(cors);
await app.register(userRoutes, { prefix: '/api/users' });

app.listen({ port: 3000, host: '0.0.0.0' });
```

## Route with Schema Validation

```ts
import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';

const UserSchema = Type.Object({
  name: Type.String(),
  email: Type.String({ format: 'email' }),
});

type User = Static<typeof UserSchema>;

const routes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: User }>('/', {
    schema: {
      body: UserSchema,
      response: { 201: UserSchema }
    }
  }, async (request, reply) => {
    const user = await db.users.create(request.body);
    reply.status(201).send(user);
  });
};
```

## Plugins

```ts
import fp from 'fastify-plugin';

// Custom plugin with fastify-plugin
export default fp(async (app) => {
  app.decorate('db', db);
  app.addHook('onRequest', async (request) => {
    request.startTime = Date.now();
  });
});

app.register(myPlugin);
```

## Error Handling

```ts
import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

app.setErrorHandler((error: FastifyError, request, reply) => {
  request.log.error({ err: error }, 'Request error');

  if (error.validation) {
    return reply.status(400).send({ error: 'Validation failed', details: error.validation });
  }

  return reply.status(error.statusCode || 500).send({ error: error.message });
});
```

## Health Checks

```ts
app.get('/health', async () => ({ status: 'healthy' }));

app.get('/ready', async (request, reply) => {
  try {
    await app.pg.query('SELECT 1');
    return { status: 'ready', database: 'connected' };
  } catch (error) {
    reply.status(503);
    return { status: 'not ready' };
  }
});
```

## Testing

```ts
import { test } from 'vitest';
import { buildApp } from '../src/app';

test('GET /api/users returns users', async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: 'GET',
    url: '/api/users',
  });

  expect(response.statusCode).toBe(200);
  await app.close();
});
```

## WebSocket Setup

```ts
import websocket from '@fastify/websocket';

await app.register(websocket);

app.get('/ws', { websocket: true }, (socket, req) => {
  socket.on('message', (data) => {
    const message = JSON.parse(data.toString());
    handleMessage(socket, message);
  });
});
```

## When NOT to Use This Skill

- **Enterprise Architecture** - Use NestJS for DI and modular design
- **Simple CRUD APIs** - Use Express if performance is not critical
- **Edge Runtimes** - Use Hono for Cloudflare Workers
- **Deno Projects** - Use Oak or Fresh instead

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Not using schema validation | Loses performance advantage | Define schemas for routes |
| Missing `fastify-plugin` wrapper | Encapsulation issues | Use `fp()` for shared plugins |
| Using `app.listen()` in tests | Slow, port conflicts | Use `app.inject()` |
| Ignoring response schema | Slower serialization | Define response schemas |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| "Cannot call reply.send twice" | Multiple sends | Return after first `reply.send()` |
| Plugin not accessible | Missing fastify-plugin | Wrap with `fp()` |
| Schema not working | Not registered | Add `schema: {}` to route options |
| Type errors with schemas | Provider missing | Use `withTypeProvider<TypeBoxTypeProvider>()` |

## Production Checklist

- [ ] TypeBox schema validation
- [ ] Helmet security headers
- [ ] Rate limiting configured
- [ ] Structured logging (Pino)
- [ ] Request ID tracing
- [ ] Custom error handler
- [ ] Health/readiness endpoints
- [ ] Graceful shutdown
- [ ] Database connection pooling

## Monitoring Metrics

| Metric | Target |
|--------|--------|
| Response time (p99) | < 50ms |
| Error rate (5xx) | < 0.1% |
| Request throughput | > 10k/s |

## Reference Documentation
- [Schema Validation](quick-ref/schemas.md)
- [Plugins](quick-ref/plugins.md)
