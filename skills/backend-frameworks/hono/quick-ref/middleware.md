# Hono Middleware

> **Knowledge Base:** Read `knowledge/hono/middleware.md` for complete documentation.

## Built-in Middleware

```ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { compress } from 'hono/compress';

const app = new Hono();

// Apply middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', secureHeaders());
app.use('*', compress());

app.use('/api/*', cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));
```

## Custom Middleware

```ts
import { createMiddleware } from 'hono/factory';

// Simple middleware
const timing = createMiddleware(async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  c.header('X-Response-Time', `${ms}ms`);
});

// With options
const rateLimit = (limit: number) => createMiddleware(async (c, next) => {
  const ip = c.req.header('x-forwarded-for') || 'unknown';
  const count = await getRequestCount(ip);

  if (count > limit) {
    return c.json({ error: 'Rate limit exceeded' }, 429);
  }

  await incrementCount(ip);
  await next();
});

app.use('*', timing);
app.use('/api/*', rateLimit(100));
```

## Authentication Middleware

```ts
import { jwt } from 'hono/jwt';
import { bearerAuth } from 'hono/bearer-auth';

// JWT middleware
app.use('/api/*', jwt({
  secret: process.env.JWT_SECRET!,
}));

app.get('/api/profile', (c) => {
  const payload = c.get('jwtPayload');
  return c.json({ user: payload });
});

// Simple bearer token
app.use('/admin/*', bearerAuth({ token: 'admin-secret-token' }));
```

## Custom Auth Middleware

```ts
const authenticate = createMiddleware(async (c, next) => {
  const token = c.req.header('Authorization')?.split(' ')[1];

  if (!token) {
    return c.json({ error: 'No token provided' }, 401);
  }

  try {
    const payload = await verifyToken(token);
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

// Typed context
type Variables = {
  user: { id: string; email: string };
};

const app = new Hono<{ Variables: Variables }>();

app.use('/api/*', authenticate);

app.get('/api/me', (c) => {
  const user = c.get('user'); // Typed!
  return c.json(user);
});
```

## Validation Middleware

```ts
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

app.post('/users',
  zValidator('json', createUserSchema),
  async (c) => {
    const data = c.req.valid('json'); // Typed!
    const user = await createUser(data);
    return c.json(user, 201);
  }
);
```

## Error Handling

```ts
import { HTTPException } from 'hono/http-exception';

// Global error handler
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

// Not found handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Throw in routes
app.get('/users/:id', async (c) => {
  const user = await getUser(c.req.param('id'));
  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }
  return c.json(user);
});
```

**Official docs:** https://hono.dev/guides/middleware
