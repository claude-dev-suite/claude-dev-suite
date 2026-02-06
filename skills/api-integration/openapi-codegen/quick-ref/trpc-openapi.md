# trpc-openapi Quick Reference

> See [OpenAPI Codegen SKILL](../SKILL.md) for core knowledge

## Installation

```bash
npm install trpc-openapi
```

## Setup

### Define Router with OpenAPI Metadata

```typescript
import { initTRPC } from '@trpc/server';
import { OpenApiMeta } from 'trpc-openapi';
import { z } from 'zod';

const t = initTRPC.meta<OpenApiMeta>().create();

export const appRouter = t.router({
  // Query endpoint
  getUser: t.procedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/users/{id}',
        tags: ['users'],
        summary: 'Get user by ID',
        description: 'Retrieves a user by their unique identifier',
      },
    })
    .input(z.object({
      id: z.string().describe('User ID'),
    }))
    .output(z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().email(),
    }))
    .query(async ({ input }) => {
      return getUserById(input.id);
    }),

  // Mutation endpoint
  createUser: t.procedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/users',
        tags: ['users'],
        summary: 'Create a new user',
      },
    })
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
    }))
    .output(z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    }))
    .mutation(async ({ input }) => {
      return createUser(input);
    }),
});
```

## OpenAPI Metadata Options

```typescript
.meta({
  openapi: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: '/path/{param}',      // Path with params
    tags: ['tag1', 'tag2'],     // OpenAPI tags
    summary: 'Short summary',
    description: 'Detailed description',
    protect: true,              // Requires auth
    deprecated: false,
    contentTypes: ['application/json'],
    headers: [
      { name: 'X-Custom', required: true },
    ],
  },
})
```

## Generate OpenAPI Document

```typescript
import { generateOpenApiDocument } from 'trpc-openapi';
import { appRouter } from './router';

const openApiDocument = generateOpenApiDocument(appRouter, {
  title: 'My API',
  description: 'API description',
  version: '1.0.0',
  baseUrl: 'https://api.example.com',
  docsUrl: 'https://docs.example.com',
  tags: ['users', 'posts'],
  securitySchemes: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    },
  },
});

// Export as JSON
console.log(JSON.stringify(openApiDocument, null, 2));
```

### Save to File

```typescript
import fs from 'fs';
import { generateOpenApiDocument } from 'trpc-openapi';
import { appRouter } from './router';

const doc = generateOpenApiDocument(appRouter, {
  title: 'My API',
  version: '1.0.0',
  baseUrl: 'https://api.example.com',
});

fs.writeFileSync('./openapi.json', JSON.stringify(doc, null, 2));
```

## REST Handler

### Next.js Pages Router

```typescript
// pages/api/[...trpc].ts
import { createOpenApiNextHandler } from 'trpc-openapi';
import { appRouter } from '../../server/router';
import { createContext } from '../../server/context';

export default createOpenApiNextHandler({
  router: appRouter,
  createContext,
});
```

### Next.js App Router

```typescript
// app/api/[...trpc]/route.ts
import { createOpenApiNextHandler } from 'trpc-openapi';
import { appRouter } from '../../../server/router';

const handler = createOpenApiNextHandler({
  router: appRouter,
  createContext: () => ({}),
});

export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
```

### Express

```typescript
import express from 'express';
import { createOpenApiExpressMiddleware } from 'trpc-openapi';
import { appRouter } from './router';

const app = express();

app.use('/api', createOpenApiExpressMiddleware({
  router: appRouter,
  createContext: () => ({}),
}));
```

### Fastify

```typescript
import fastify from 'fastify';
import { fastifyTRPCOpenApiPlugin } from 'trpc-openapi';
import { appRouter } from './router';

const app = fastify();

app.register(fastifyTRPCOpenApiPlugin, {
  basePath: '/api',
  router: appRouter,
  createContext: () => ({}),
});
```

## Path Parameters

```typescript
// Path: /users/{id}/posts/{postId}
.meta({
  openapi: {
    method: 'GET',
    path: '/users/{id}/posts/{postId}',
  },
})
.input(z.object({
  id: z.string(),        // Mapped to {id}
  postId: z.string(),    // Mapped to {postId}
}))
```

## Query Parameters

```typescript
// GET /users?status=active&page=1
.meta({
  openapi: {
    method: 'GET',
    path: '/users',
  },
})
.input(z.object({
  status: z.enum(['active', 'inactive']).optional(),
  page: z.number().default(1),
  limit: z.number().default(10),
}))
```

## Request Body

```typescript
// POST /users with JSON body
.meta({
  openapi: {
    method: 'POST',
    path: '/users',
  },
})
.input(z.object({
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['user', 'admin']).default('user'),
}))
```

## Authentication

```typescript
// Protected endpoint
.meta({
  openapi: {
    method: 'GET',
    path: '/me',
    protect: true,  // Requires auth
  },
})

// Context with auth
const createContext = ({ req }) => {
  const token = req.headers.authorization?.split(' ')[1];
  return { user: verifyToken(token) };
};

// OpenAPI doc with security
const openApiDocument = generateOpenApiDocument(appRouter, {
  title: 'My API',
  version: '1.0.0',
  baseUrl: 'https://api.example.com',
  securitySchemes: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
    },
  },
});
```

## Error Handling

```typescript
import { TRPCError } from '@trpc/server';

.mutation(async ({ input, ctx }) => {
  const user = await findUser(input.id);
  if (!user) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'User not found',
    });
  }
  return user;
})
```

Error codes map to HTTP status:

| tRPC Code | HTTP Status |
|-----------|-------------|
| BAD_REQUEST | 400 |
| UNAUTHORIZED | 401 |
| FORBIDDEN | 403 |
| NOT_FOUND | 404 |
| CONFLICT | 409 |
| INTERNAL_SERVER_ERROR | 500 |

## Serve OpenAPI Spec

```typescript
// pages/api/openapi.json.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { generateOpenApiDocument } from 'trpc-openapi';
import { appRouter } from '../../server/router';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const openApiDocument = generateOpenApiDocument(appRouter, {
    title: 'My API',
    version: '1.0.0',
    baseUrl: 'https://api.example.com',
  });

  res.status(200).json(openApiDocument);
}
```

## Swagger UI

```typescript
// pages/api/docs.ts
import { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>API Documentation</title>
        <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
      </head>
      <body>
        <div id="swagger-ui"></div>
        <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
        <script>
          SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger-ui' });
        </script>
      </body>
    </html>
  `);
}
```

## Package Script

```json
{
  "scripts": {
    "generate:openapi": "tsx scripts/generate-openapi.ts"
  }
}
```

```typescript
// scripts/generate-openapi.ts
import fs from 'fs';
import { generateOpenApiDocument } from 'trpc-openapi';
import { appRouter } from '../src/server/router';

const doc = generateOpenApiDocument(appRouter, {
  title: 'My API',
  version: '1.0.0',
  baseUrl: process.env.API_URL || 'http://localhost:3000',
});

fs.writeFileSync('./openapi.json', JSON.stringify(doc, null, 2));
console.log('OpenAPI spec generated!');
```
