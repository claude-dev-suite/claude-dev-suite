---
name: type-safe-api
description: |
  End-to-end type safety patterns for API development. Covers Zod-to-OpenAPI,
  ts-rest, Zodios, and contract testing. Use for ensuring type consistency
  between backend and frontend.

  USE WHEN: user mentions "type-safe API", "end-to-end types", "Zod to OpenAPI",
  "ts-rest", "Zodios", "contract testing", asks about "share types between frontend and backend",
  "type safety across API", "API contract", "Pact testing"

  DO NOT USE FOR: tRPC (use `trpc` instead); GraphQL (use `graphql` instead);
  Simple OpenAPI generation (use `openapi-codegen` instead); Non-TypeScript projects
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Type-Safe API Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `type-safe-api` for comprehensive documentation.

## Zod to OpenAPI

Generate OpenAPI specs from Zod schemas for type-first development.

```bash
npm install @asteasolutions/zod-to-openapi zod
```

### Define Schemas

```typescript
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// Schema with OpenAPI metadata
export const UserSchema = z.object({
  id: z.string().openapi({ example: 'user_123' }),
  name: z.string().min(1).openapi({ example: 'John Doe' }),
  email: z.string().email().openapi({ example: 'john@example.com' }),
  role: z.enum(['user', 'admin']).openapi({ example: 'user' }),
  createdAt: z.date().openapi({ example: '2024-01-01T00:00:00Z' }),
}).openapi('User');

export const CreateUserSchema = UserSchema.omit({ id: true, createdAt: true })
  .openapi('CreateUser');

export type User = z.infer<typeof UserSchema>;
export type CreateUser = z.infer<typeof CreateUserSchema>;
```

### Generate OpenAPI Document

```typescript
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';

const registry = new OpenAPIRegistry();

// Register schemas
registry.register('User', UserSchema);
registry.register('CreateUser', CreateUserSchema);

// Register endpoints
registry.registerPath({
  method: 'get',
  path: '/users/{id}',
  summary: 'Get user by ID',
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: 'User found',
      content: {
        'application/json': { schema: UserSchema },
      },
    },
    404: {
      description: 'User not found',
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/users',
  summary: 'Create user',
  request: {
    body: {
      content: {
        'application/json': { schema: CreateUserSchema },
      },
    },
  },
  responses: {
    201: {
      description: 'User created',
      content: {
        'application/json': { schema: UserSchema },
      },
    },
  },
});

// Generate OpenAPI document
const generator = new OpenApiGeneratorV3(registry.definitions);
const openApiDocument = generator.generateDocument({
  openapi: '3.0.0',
  info: {
    title: 'User API',
    version: '1.0.0',
  },
  servers: [{ url: 'https://api.example.com' }],
});
```

---

## ts-rest (Contract-First)

Type-safe REST API contracts shared between client and server.

```bash
npm install @ts-rest/core
npm install @ts-rest/next        # For Next.js
npm install @ts-rest/react-query # For React Query
```

### Define Contract

```typescript
// contracts/api.ts
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

export const userContract = c.router({
  getUser: {
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
  createUser: {
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
      400: z.object({ message: z.string() }),
    },
  },
  listUsers: {
    method: 'GET',
    path: '/users',
    query: z.object({
      page: z.number().optional(),
      limit: z.number().optional(),
    }),
    responses: {
      200: z.array(z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
      })),
    },
  },
});
```

### Server Implementation (Next.js)

```typescript
// pages/api/[...ts-rest].ts
import { createNextRoute, createNextRouter } from '@ts-rest/next';
import { userContract } from '../../contracts/api';

const router = createNextRouter(userContract, {
  getUser: async ({ params }) => {
    const user = await db.user.findUnique({ where: { id: params.id } });
    if (!user) {
      return { status: 404, body: { message: 'Not found' } };
    }
    return { status: 200, body: user };
  },
  createUser: async ({ body }) => {
    const user = await db.user.create({ data: body });
    return { status: 201, body: user };
  },
  listUsers: async ({ query }) => {
    const users = await db.user.findMany({
      skip: ((query.page ?? 1) - 1) * (query.limit ?? 10),
      take: query.limit ?? 10,
    });
    return { status: 200, body: users };
  },
});

export default createNextRoute(userContract, router);
```

### Client Usage

```typescript
// lib/api-client.ts
import { initClient } from '@ts-rest/core';
import { userContract } from '../contracts/api';

export const apiClient = initClient(userContract, {
  baseUrl: 'https://api.example.com',
  baseHeaders: {
    Authorization: `Bearer ${getToken()}`,
  },
});

// Usage (fully typed)
const { body: user, status } = await apiClient.getUser({ params: { id: '123' } });
const { body: newUser } = await apiClient.createUser({
  body: { name: 'John', email: 'john@example.com' },
});
```

### React Query Integration

```typescript
import { initQueryClient } from '@ts-rest/react-query';
import { userContract } from '../contracts/api';

const client = initQueryClient(userContract, {
  baseUrl: 'https://api.example.com',
});

// In component
function UserProfile({ id }: { id: string }) {
  const { data, isLoading } = client.getUser.useQuery(
    ['user', id],
    { params: { id } }
  );

  if (isLoading) return <Spinner />;
  return <div>{data?.body.name}</div>;
}
```

---

## Zodios (Type-Safe REST Client)

```bash
npm install @zodios/core zod
npm install @zodios/react # For React hooks
```

### Define API

```typescript
import { makeApi, Zodios } from '@zodios/core';
import { z } from 'zod';

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

const api = makeApi([
  {
    method: 'get',
    path: '/users/:id',
    alias: 'getUser',
    response: userSchema,
    parameters: [
      { type: 'Path', name: 'id', schema: z.string() },
    ],
  },
  {
    method: 'post',
    path: '/users',
    alias: 'createUser',
    response: userSchema,
    parameters: [
      {
        type: 'Body',
        name: 'body',
        schema: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
      },
    ],
  },
  {
    method: 'get',
    path: '/users',
    alias: 'listUsers',
    response: z.array(userSchema),
    parameters: [
      { type: 'Query', name: 'status', schema: z.string().optional() },
    ],
  },
]);

export const apiClient = new Zodios('https://api.example.com', api);
```

### Client Usage

```typescript
// Fully typed
const user = await apiClient.getUser({ params: { id: '123' } });
const users = await apiClient.listUsers({ queries: { status: 'active' } });
const newUser = await apiClient.createUser({
  name: 'John',
  email: 'john@example.com',
});
```

---

## Contract Testing

### With Pact

```bash
npm install -D @pact-foundation/pact
```

```typescript
import { Pact } from '@pact-foundation/pact';

const provider = new Pact({
  consumer: 'Frontend',
  provider: 'UserAPI',
});

describe('User API Contract', () => {
  beforeAll(() => provider.setup());
  afterAll(() => provider.finalize());
  afterEach(() => provider.verify());

  it('should get user by id', async () => {
    await provider.addInteraction({
      state: 'user with id 123 exists',
      uponReceiving: 'a request to get user 123',
      withRequest: {
        method: 'GET',
        path: '/users/123',
      },
      willRespondWith: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          id: '123',
          name: 'John Doe',
          email: 'john@example.com',
        },
      },
    });

    const user = await apiClient.getUser({ params: { id: '123' } });
    expect(user.name).toBe('John Doe');
  });
});
```

---

## Production Readiness

### Shared Types Strategy (Monorepo)

```
packages/
├── api-contracts/      # Shared contracts
│   ├── src/
│   │   ├── schemas.ts  # Zod schemas
│   │   ├── types.ts    # TypeScript types
│   │   └── contract.ts # ts-rest contract
│   └── package.json
├── backend/
│   ├── src/
│   │   └── routes/     # Implements contracts
│   └── package.json
└── frontend/
    ├── src/
    │   └── api/        # Uses contracts
    └── package.json
```

### Breaking Change Detection

```typescript
// scripts/check-breaking-changes.ts
import { diff } from 'json-diff';
import oldSpec from './openapi-old.json';
import newSpec from './openapi-new.json';

const changes = diff(oldSpec, newSpec);
const breaking = findBreakingChanges(changes);

if (breaking.length > 0) {
  console.error('Breaking changes detected:');
  breaking.forEach(console.error);
  process.exit(1);
}
```

### Checklist

- [ ] Shared schema package in monorepo
- [ ] OpenAPI spec generated from schemas
- [ ] Contract tests between services
- [ ] Breaking change detection in CI
- [ ] Type generation automated
- [ ] Runtime validation on boundaries
- [ ] Error types included in contracts
- [ ] Versioning strategy defined

## When NOT to Use This Skill

- tRPC projects (use `trpc` skill - simpler for full-stack TypeScript)
- GraphQL APIs (use `graphql` skill)
- Simple REST APIs without shared types (use `openapi-codegen` instead)
- Non-TypeScript projects
- Microservices with different languages
- Public APIs consumed by third parties (OpenAPI spec better)

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Sharing database entities as API types | Leaks implementation, tight coupling | Create separate DTOs/schemas |
| No runtime validation | Type safety only at compile time | Use Zod for runtime validation |
| Duplicating schemas between packages | Maintenance burden, drift risk | Use shared schema package in monorepo |
| Not versioning shared types | Breaking changes affect all consumers | Version shared package, use semver |
| Missing contract tests | Types match but behavior doesn't | Implement Pact or similar contract testing |
| Mixing type-safety approaches | Complexity, inconsistency | Choose one approach (tRPC, ts-rest, or Zod-OpenAPI) |
| No breaking change detection | Silent failures in production | Add schema diff checking in CI |
| Hardcoding types instead of generating | Manual sync burden | Generate from single source of truth |

## Quick Troubleshooting

| Issue | Possible Cause | Solution |
|-------|----------------|----------|
| Type mismatches between FE/BE | Shared types not updated | Regenerate types, check imports |
| Runtime validation fails | Request doesn't match schema | Check request payload, update schema |
| Contract tests failing | API behavior changed | Update contract or fix API implementation |
| Circular dependency errors | Frontend importing backend code | Use separate shared types package |
| Breaking changes not detected | No schema diffing | Add schema versioning and diff tool |
| Schema generation fails | Invalid Zod schema | Check schema syntax, validate with Zod |
| OpenAPI spec out of sync | Manual spec edits | Generate spec from Zod schemas |
| Type inference not working | Wrong import or export | Verify type exports from shared package |

## Reference Documentation
- [Zod to OpenAPI](quick-ref/zod-openapi.md)
- [ts-rest](quick-ref/ts-rest.md)
- [Contract Testing](quick-ref/contract-testing.md)
