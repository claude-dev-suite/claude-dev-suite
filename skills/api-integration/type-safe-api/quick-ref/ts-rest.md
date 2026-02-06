# ts-rest Quick Reference

> See [Type-Safe API SKILL](../SKILL.md) for core knowledge

## Installation

```bash
npm install @ts-rest/core
npm install @ts-rest/next        # Next.js
npm install @ts-rest/express     # Express
npm install @ts-rest/react-query # React Query
```

## Define Contract

```typescript
// contracts/index.ts
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

export const contract = c.router({
  users: {
    get: {
      method: 'GET',
      path: '/users/:id',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: z.object({
          id: z.string(),
          name: z.string(),
          email: z.string(),
        }),
        404: z.object({ message: z.string() }),
      },
    },
    create: {
      method: 'POST',
      path: '/users',
      body: z.object({
        name: z.string(),
        email: z.string().email(),
      }),
      responses: {
        201: z.object({
          id: z.string(),
          name: z.string(),
          email: z.string(),
        }),
      },
    },
    list: {
      method: 'GET',
      path: '/users',
      query: z.object({
        page: z.coerce.number().optional(),
        limit: z.coerce.number().optional(),
      }),
      responses: {
        200: z.array(z.object({
          id: z.string(),
          name: z.string(),
        })),
      },
    },
  },
});
```

## Server - Next.js

```typescript
// pages/api/[...ts-rest].ts
import { createNextRoute, createNextRouter } from '@ts-rest/next';
import { contract } from '../../contracts';

const router = createNextRouter(contract, {
  users: {
    get: async ({ params }) => {
      const user = await db.user.findUnique({ where: { id: params.id } });
      if (!user) {
        return { status: 404, body: { message: 'Not found' } };
      }
      return { status: 200, body: user };
    },
    create: async ({ body }) => {
      const user = await db.user.create({ data: body });
      return { status: 201, body: user };
    },
    list: async ({ query }) => {
      const users = await db.user.findMany({
        take: query.limit ?? 10,
        skip: ((query.page ?? 1) - 1) * (query.limit ?? 10),
      });
      return { status: 200, body: users };
    },
  },
});

export default createNextRoute(contract, router);
```

## Server - Express

```typescript
import express from 'express';
import { createExpressEndpoints } from '@ts-rest/express';
import { contract } from './contracts';

const app = express();
app.use(express.json());

createExpressEndpoints(contract, {
  users: {
    get: async ({ params }) => {
      const user = await db.user.findUnique({ where: { id: params.id } });
      if (!user) {
        return { status: 404, body: { message: 'Not found' } };
      }
      return { status: 200, body: user };
    },
    create: async ({ body }) => {
      const user = await db.user.create({ data: body });
      return { status: 201, body: user };
    },
    list: async ({ query }) => {
      const users = await db.user.findMany();
      return { status: 200, body: users };
    },
  },
}, app);

app.listen(3000);
```

## Client

```typescript
import { initClient } from '@ts-rest/core';
import { contract } from './contracts';

const client = initClient(contract, {
  baseUrl: 'https://api.example.com',
  baseHeaders: {
    Authorization: `Bearer ${token}`,
  },
});

// Typed requests
const { body: user, status } = await client.users.get({
  params: { id: '123' },
});

const { body: newUser } = await client.users.create({
  body: { name: 'John', email: 'john@example.com' },
});

const { body: users } = await client.users.list({
  query: { page: 1, limit: 10 },
});
```

## React Query

```typescript
import { initQueryClient } from '@ts-rest/react-query';
import { contract } from './contracts';

const client = initQueryClient(contract, {
  baseUrl: '/api',
});

// In component
function UserProfile({ id }: { id: string }) {
  const { data, isLoading, error } = client.users.get.useQuery(
    ['user', id],
    { params: { id } }
  );

  const createMutation = client.users.create.useMutation();

  const handleCreate = () => {
    createMutation.mutate({
      body: { name: 'New User', email: 'new@example.com' },
    });
  };

  if (isLoading) return <Spinner />;
  if (error) return <Error />;
  return <div>{data?.body.name}</div>;
}
```

## Response Handling

```typescript
const result = await client.users.get({ params: { id: '123' } });

if (result.status === 200) {
  console.log(result.body.name); // Typed as User
} else if (result.status === 404) {
  console.log(result.body.message); // Typed as { message: string }
}
```

## Middleware

```typescript
const client = initClient(contract, {
  baseUrl: 'https://api.example.com',
  api: async ({ path, method, headers, body }) => {
    // Custom fetch logic
    const response = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      body: await response.json(),
      headers: response.headers,
    };
  },
});
```

## Generate OpenAPI

```typescript
import { generateOpenApi } from '@ts-rest/open-api';
import { contract } from './contracts';

const openApiDocument = generateOpenApi(contract, {
  info: {
    title: 'My API',
    version: '1.0.0',
  },
});
```
