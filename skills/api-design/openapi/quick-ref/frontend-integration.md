# OpenAPI Frontend Integration Quick Reference

> See [OpenAPI SKILL](../SKILL.md) for core knowledge

## Code Generation Tools

| Tool | Output | Best For |
|------|--------|----------|
| openapi-typescript | Types only | Lightweight, manual fetching |
| openapi-fetch | Types + client | Type-safe fetch wrapper |
| openapi-generator | Full SDK | Complete client libraries |
| swagger-typescript-api | Client + types | Quick setup, Axios support |

## openapi-typescript (Types Only)

```bash
npm install -D openapi-typescript
npx openapi-typescript ./openapi.yaml -o ./src/types/api.ts
```

```typescript
import type { paths, components } from './types/api';

type User = components['schemas']['User'];
type UsersResponse = paths['/users']['get']['responses']['200']['content']['application/json'];
```

## openapi-fetch (Recommended)

```bash
npm install openapi-fetch
npm install -D openapi-typescript
```

```typescript
import createClient from 'openapi-fetch';
import type { paths } from './types/api';

const client = createClient<paths>({ baseUrl: 'https://api.example.com' });

// Fully type-safe
const { data, error } = await client.GET('/users/{id}', {
  params: { path: { id: '123' } },
});

// POST with body
const { data: newUser } = await client.POST('/users', {
  body: { name: 'John', email: 'john@example.com' },
});
```

## swagger-typescript-api

```bash
npx swagger-typescript-api -p ./openapi.yaml -o ./src/api --axios
```

```typescript
import { Api } from './api';

const api = new Api({ baseUrl: 'https://api.example.com' });

const users = await api.users.usersList();
const user = await api.users.usersDetail('123');
```

## With TanStack Query

```typescript
import createClient from 'openapi-fetch';
import type { paths } from './types/api';
import { useQuery, useMutation } from '@tanstack/react-query';

const api = createClient<paths>({ baseUrl: '/api' });

function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await api.GET('/users');
      if (error) throw error;
      return data;
    },
  });
}

function useCreateUser() {
  return useMutation({
    mutationFn: async (body: paths['/users']['post']['requestBody']['content']['application/json']) => {
      const { data, error } = await api.POST('/users', { body });
      if (error) throw error;
      return data;
    },
  });
}
```

## With SWR

```typescript
import useSWR from 'swr';
import createClient from 'openapi-fetch';
import type { paths } from './types/api';

const api = createClient<paths>({ baseUrl: '/api' });

function useUser(id: string) {
  return useSWR(
    id ? `/users/${id}` : null,
    async () => {
      const { data, error } = await api.GET('/users/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    }
  );
}
```

## CI/CD Integration

```yaml
# .github/workflows/api-types.yml
name: Generate API Types

on:
  push:
    paths:
      - 'openapi.yaml'

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx openapi-typescript ./openapi.yaml -o ./src/types/api.ts
      - run: |
          git config user.name github-actions
          git config user.email github-actions@github.com
          git add src/types/api.ts
          git diff --staged --quiet || git commit -m "chore: update API types"
          git push
```

## Type Extraction Patterns

```typescript
import type { paths, components, operations } from './types/api';

// Schema types
type User = components['schemas']['User'];
type CreateUserInput = components['schemas']['CreateUserInput'];

// Request body
type CreateUserBody = paths['/users']['post']['requestBody']['content']['application/json'];

// Response types
type UserResponse = paths['/users/{id}']['get']['responses']['200']['content']['application/json'];
type UsersListResponse = paths['/users']['get']['responses']['200']['content']['application/json'];

// Path parameters
type UserPathParams = paths['/users/{id}']['get']['parameters']['path'];

// Query parameters
type UsersQueryParams = paths['/users']['get']['parameters']['query'];

// From operations (if operationId defined)
type ListUsersParams = operations['listUsers']['parameters'];
type ListUsersResponse = operations['listUsers']['responses']['200']['content']['application/json'];
```

