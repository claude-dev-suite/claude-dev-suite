# Zod to OpenAPI Quick Reference

> See [Type-Safe API SKILL](../SKILL.md) for core knowledge

## Installation

```bash
npm install @asteasolutions/zod-to-openapi zod
```

## Setup

```typescript
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);
```

## Schema Definition

```typescript
// Add OpenAPI metadata to schemas
const UserSchema = z.object({
  id: z.string().uuid().openapi({ example: 'user_123' }),
  name: z.string().min(1).max(100).openapi({ example: 'John Doe' }),
  email: z.string().email().openapi({ example: 'john@example.com' }),
  role: z.enum(['user', 'admin']).default('user'),
  createdAt: z.date(),
}).openapi('User');

const CreateUserSchema = UserSchema
  .omit({ id: true, createdAt: true })
  .openapi('CreateUser');

const UpdateUserSchema = CreateUserSchema
  .partial()
  .openapi('UpdateUser');

// Export types
export type User = z.infer<typeof UserSchema>;
export type CreateUser = z.infer<typeof CreateUserSchema>;
```

## Registry Setup

```typescript
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

const registry = new OpenAPIRegistry();

// Register schemas
registry.register('User', UserSchema);
registry.register('CreateUser', CreateUserSchema);
```

## Register Endpoints

```typescript
// GET endpoint
registry.registerPath({
  method: 'get',
  path: '/users/{id}',
  summary: 'Get user by ID',
  tags: ['Users'],
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
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
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
    },
  },
});

// POST endpoint
registry.registerPath({
  method: 'post',
  path: '/users',
  summary: 'Create user',
  tags: ['Users'],
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
    400: {
      description: 'Validation error',
    },
  },
});

// GET with query params
registry.registerPath({
  method: 'get',
  path: '/users',
  summary: 'List users',
  tags: ['Users'],
  request: {
    query: z.object({
      page: z.number().int().positive().default(1),
      limit: z.number().int().min(1).max(100).default(10),
      status: z.enum(['active', 'inactive']).optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of users',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(UserSchema),
            total: z.number(),
          }),
        },
      },
    },
  },
});
```

## Generate Document

```typescript
import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';

const generator = new OpenApiGeneratorV3(registry.definitions);

const openApiDocument = generator.generateDocument({
  openapi: '3.0.0',
  info: {
    title: 'User API',
    version: '1.0.0',
    description: 'API for managing users',
  },
  servers: [
    { url: 'https://api.example.com', description: 'Production' },
    { url: 'http://localhost:3000', description: 'Development' },
  ],
});

// Export as JSON
console.log(JSON.stringify(openApiDocument, null, 2));
```

## Security Schemes

```typescript
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

// Protected endpoint
registry.registerPath({
  method: 'get',
  path: '/users/me',
  summary: 'Get current user',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: { 'application/json': { schema: UserSchema } },
    },
  },
});
```

## Common Patterns

```typescript
// Pagination schema
const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(100).default(10),
});

// Paginated response
const createPaginatedResponse = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    data: z.array(schema),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
  });

// Error response
const ErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.array(z.object({
    field: z.string(),
    message: z.string(),
  })).optional(),
}).openapi('Error');
```

## Save to File

```typescript
import fs from 'fs';

fs.writeFileSync(
  './openapi.json',
  JSON.stringify(openApiDocument, null, 2)
);
```

## Package Script

```json
{
  "scripts": {
    "generate:openapi": "tsx scripts/generate-openapi.ts"
  }
}
```
