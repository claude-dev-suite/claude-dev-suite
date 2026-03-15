# openapi-typescript Quick Reference

> See [OpenAPI Codegen SKILL](../SKILL.md) for core knowledge

## Installation

```bash
npm install -D openapi-typescript openapi-fetch
```

## Generate Types

```bash
# From local file
npx openapi-typescript ./openapi.yaml -o ./src/types/api.ts

# From URL
npx openapi-typescript https://api.example.com/openapi.json -o ./src/types/api.ts

# With options
npx openapi-typescript ./openapi.yaml -o ./src/types/api.ts \
  --export-type \        # Export types instead of interfaces
  --immutable \          # Make types readonly
  --path-params-as-types # Path params as literal types
```

## CLI Options

| Option | Description |
|--------|-------------|
| `-o, --output` | Output file path |
| `--export-type` | Use `type` instead of `interface` |
| `--immutable` | Add `readonly` modifiers |
| `--default-non-nullable` | Treat non-specified as required |
| `--path-params-as-types` | Path params as string literals |
| `--alphabetize` | Sort types alphabetically |
| `-w, --watch` | Watch mode |

## Generated Types

```typescript
import type { paths, components, operations } from './types/api';

// Components/Schemas
type User = components['schemas']['User'];
type CreateUserDto = components['schemas']['CreateUserDto'];
type ErrorResponse = components['schemas']['Error'];

// Path operations
type GetUserOp = paths['/users/{id}']['get'];
type CreateUserOp = paths['/users']['post'];

// Request types
type CreateUserBody = paths['/users']['post']['requestBody']['content']['application/json'];

// Response types
type UserResponse = paths['/users/{id}']['get']['responses']['200']['content']['application/json'];
type UsersListResponse = paths['/users']['get']['responses']['200']['content']['application/json'];

// Parameters
type UserPathParams = paths['/users/{id}']['get']['parameters']['path'];
type UsersQueryParams = paths['/users']['get']['parameters']['query'];
```

## openapi-fetch Client

```typescript
import createClient from 'openapi-fetch';
import type { paths } from './types/api';

const client = createClient<paths>({
  baseUrl: 'https://api.example.com',
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

// GET with path params
const { data, error } = await client.GET('/users/{id}', {
  params: {
    path: { id: '123' },
  },
});

// GET with query params
const { data, error } = await client.GET('/users', {
  params: {
    query: {
      status: 'active',
      page: 1,
      limit: 10,
    },
  },
});

// POST with body
const { data, error } = await client.POST('/users', {
  body: {
    name: 'John',
    email: 'john@example.com',
  },
});

// PUT
const { data, error } = await client.PUT('/users/{id}', {
  params: { path: { id: '123' } },
  body: { name: 'Updated' },
});

// DELETE
const { data, error } = await client.DELETE('/users/{id}', {
  params: { path: { id: '123' } },
});
```

## Middleware

```typescript
import createClient, { Middleware } from 'openapi-fetch';
import type { paths } from './types/api';

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = await getToken();
    request.headers.set('Authorization', `Bearer ${token}`);
    return request;
  },
};

const loggingMiddleware: Middleware = {
  async onRequest({ request }) {
    console.log(`[${request.method}] ${request.url}`);
    return request;
  },
  async onResponse({ response }) {
    console.log(`Response: ${response.status}`);
    return response;
  },
};

const client = createClient<paths>({
  baseUrl: 'https://api.example.com',
});

client.use(authMiddleware);
client.use(loggingMiddleware);
```

## Error Handling

```typescript
const { data, error, response } = await client.GET('/users/{id}', {
  params: { path: { id: '123' } },
});

if (error) {
  // error is typed based on OpenAPI error responses
  console.error(error.message);
  return;
}

// data is typed as User
console.log(data.name);
```

## React Query Integration

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import createClient from 'openapi-fetch';
import type { paths } from './types/api';

const client = createClient<paths>({ baseUrl: '/api' });

// Query hook
function useUser(id: string) {
  return useQuery({
    queryKey: ['user', id],
    queryFn: async () => {
      const { data, error } = await client.GET('/users/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
  });
}

// Mutation hook
function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: paths['/users']['post']['requestBody']['content']['application/json']) => {
      const { data, error } = await client.POST('/users', { body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
```

## Programmatic Generation

```typescript
import openapiTS, { astToString } from 'openapi-typescript';
import fs from 'node:fs';

async function generateTypes() {
  const ast = await openapiTS(new URL('./openapi.yaml', import.meta.url));
  const contents = astToString(ast);
  fs.writeFileSync('./src/types/api.ts', contents);
}
```

## Package Script

```json
{
  "scripts": {
    "generate:types": "openapi-typescript ./openapi.yaml -o ./src/types/api.ts",
    "generate:types:watch": "openapi-typescript ./openapi.yaml -o ./src/types/api.ts --watch"
  }
}
```
