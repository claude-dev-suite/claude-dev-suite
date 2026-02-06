---
name: hono
description: |
  Hono ultrafast web framework for edge runtimes. Covers routing,
  middleware, and multi-runtime support. Use when building edge-first
  APIs.

  USE WHEN: user mentions "Hono", "hono", "Cloudflare Workers", "Vercel Edge", "edge runtime", "Bun", asks about "edge-first API", "multi-runtime framework", "ultrafast web framework", "lightweight edge functions"

  DO NOT USE FOR: Node.js-only apps - use `express`, `nestjs`, or `fastify` instead, Deno-specific features - use `oak` or `fresh` instead, Enterprise DI patterns - use `nestjs` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Hono Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for WebSocket integration patterns including Cloudflare Workers, Node.js ws library, Bun WebSocket, room management, and message protocols.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `hono` for comprehensive documentation.

## Basic Setup

```ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

const app = new Hono();

app.use('*', logger());
app.use('*', cors());

app.route('/api/users', userRoutes);

export default app;
```

## Route Patterns

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const app = new Hono();

const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

app.get('/', async (c) => {
  const users = await db.users.findMany();
  return c.json(users);
});

app.post('/', zValidator('json', userSchema), async (c) => {
  const data = c.req.valid('json');
  const user = await db.users.create(data);
  return c.json(user, 201);
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const user = await db.users.find(id);
  if (!user) return c.json({ error: 'Not found' }, 404);
  return c.json(user);
});
```

## Middleware

```ts
import { createMiddleware } from 'hono/factory';

const auth = createMiddleware(async (c, next) => {
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  c.set('user', await verifyToken(token));
  await next();
});

app.get('/protected', auth, (c) => {
  const user = c.get('user');
  return c.json({ message: `Hello ${user.name}` });
});
```

## Multi-Runtime Support

```ts
// Cloudflare Workers
export default app;

// Node.js
import { serve } from '@hono/node-server';
serve(app);

// Bun
export default { fetch: app.fetch, port: 3000 };
```

## When NOT to Use This Skill

- **Node.js-Only Applications**: Use Express, Fastify, or NestJS
- **Enterprise DI Patterns**: Use NestJS for dependency injection
- **Deno-Specific Features**: Use Oak or Fresh
- **Long-Running Processes**: Edge runtimes have execution time limits
- **File System Operations**: Edge environments have limited FS access
- **Database-Heavy Logic**: Consider traditional servers for complex ORM

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using Node.js-specific APIs in edge code | Won't work on Cloudflare Workers | Use Web APIs (fetch, Response, etc.) |
| Not handling context properly | State leaks between requests | Use `c.set()` and `c.get()` |
| Importing large dependencies | Exceeds edge bundle size limits | Use tree-shakeable libraries |
| Using `fs` module | Not available in edge runtimes | Use KV storage or external APIs |
| Blocking operations in handlers | Exceeds edge execution time | Use async operations |
| Hardcoding runtime assumptions | Portability issues | Check `c.env` for runtime bindings |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| "Module not found" in production | Wrong runtime adapter | Use correct import for runtime |
| Request context undefined | Accessing outside request scope | Use context `c` within handlers |
| Middleware not executing | Wrong order or missing `await next()` | Ensure middleware calls `await next()` |
| CORS errors in production | Missing CORS middleware | Add `app.use('*', cors())` |
| Validation not working | Zod validator not applied | Use `zValidator('json', schema)` |
| Cold start timeouts | Bundle too large | Optimize imports |

## Production Readiness

### Security Setup

```ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

const app = new Hono();

app.use('*', secureHeaders());
app.use('*', cors({
  origin: process.env.CORS_ORIGINS?.split(',') || [],
  credentials: true,
}));
```

### Error Handling

```ts
import { HTTPException } from 'hono/http-exception';

export function errorHandler(err: Error, c: Context) {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  return c.json({ error: 'Internal error' }, 500);
}

app.onError(errorHandler);
```

### Health Checks

```ts
health.get('/health', (c) => c.json({ status: 'healthy' }));

health.get('/ready', async (c) => {
  try {
    await db.query('SELECT 1');
    return c.json({ status: 'ready', database: 'connected' });
  } catch (error) {
    return c.json({ status: 'not ready' }, 503);
  }
});
```

### Testing

```ts
import { describe, it, expect } from 'vitest';
import app from '../src/app';

describe('API', () => {
  it('GET /health returns healthy', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });
});
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Cold start time | < 50ms |
| Response time (p99) | < 20ms |
| Error rate | < 0.1% |
| Memory usage | < 128MB |

### Checklist

- [ ] Secure headers middleware
- [ ] CORS properly configured
- [ ] Rate limiting for API routes
- [ ] Zod validation for inputs
- [ ] Request ID tracing
- [ ] Structured JSON logging
- [ ] Custom error handler
- [ ] Health/readiness endpoints
- [ ] Graceful shutdown (Node.js)
- [ ] Tests with app.request()

## Reference Documentation

- [Middleware Patterns](quick-ref/middleware.md)
- [Validation](quick-ref/validation.md)
