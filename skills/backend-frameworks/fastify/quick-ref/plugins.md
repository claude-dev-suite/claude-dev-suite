# Fastify Plugins

> **Knowledge Base:** Read `knowledge/fastify/plugins.md` for complete documentation.

## Plugin Basics

```ts
import Fastify, { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

// Simple plugin
const myPlugin = async (fastify: FastifyInstance, options: { prefix: string }) => {
  fastify.decorate('myUtil', () => 'Hello from plugin');

  fastify.get(`${options.prefix}/hello`, async () => {
    return { message: 'Hello' };
  });
};

// Register plugin
const fastify = Fastify();
fastify.register(myPlugin, { prefix: '/api' });
```

## fastify-plugin Wrapper

```ts
import fp from 'fastify-plugin';

// Exposes decorators to parent scope
const dbPlugin = fp(async (fastify, options) => {
  const db = await createDbConnection(options.connectionString);

  fastify.decorate('db', db);

  fastify.addHook('onClose', async () => {
    await db.close();
  });
}, {
  name: 'db-plugin',
  dependencies: [] // Optional: list plugin dependencies
});

// Usage in routes
fastify.get('/users', async function(request, reply) {
  return this.db.query('SELECT * FROM users');
});
```

## Encapsulation

```ts
// Plugins are encapsulated by default
const fastify = Fastify();

// Parent scope
fastify.decorate('shared', 'available everywhere');

fastify.register(async (instance) => {
  // Child scope - has access to parent
  console.log(instance.shared); // 'available everywhere'

  instance.decorate('private', 'only in this scope');

  instance.register(async (child) => {
    // Grandchild - has access to all ancestors
    console.log(child.shared);  // works
    console.log(child.private); // works
  });
});

// Back in parent - no access to child decorators
// fastify.private // undefined!
```

## Common Plugin Pattern

```ts
// plugins/auth.ts
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';

export default fp(async (fastify) => {
  fastify.register(jwt, {
    secret: process.env.JWT_SECRET!
  });

  fastify.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });
});

// routes/users.ts
export default async function(fastify: FastifyInstance) {
  fastify.get('/profile', {
    preHandler: [fastify.authenticate]
  }, async (request) => {
    return request.user;
  });
}
```

## Auto-Loading Plugins

```ts
import autoLoad from '@fastify/autoload';
import { join } from 'path';

const fastify = Fastify();

// Load all plugins from directory
fastify.register(autoLoad, {
  dir: join(__dirname, 'plugins'),
  options: { /* shared options */ }
});

// Load all routes
fastify.register(autoLoad, {
  dir: join(__dirname, 'routes'),
  options: { prefix: '/api' }
});
```

## Lifecycle Hooks

```ts
const myPlugin = async (fastify: FastifyInstance) => {
  fastify.addHook('onRequest', async (request, reply) => {
    request.startTime = Date.now();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - request.startTime;
    fastify.log.info(`${request.method} ${request.url} - ${duration}ms`);
  });

  fastify.addHook('onClose', async (instance) => {
    // Cleanup on server close
  });
};
```

**Official docs:** https://fastify.dev/docs/latest/Reference/Plugins/
