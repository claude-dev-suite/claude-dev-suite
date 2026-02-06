---
name: type-generation
description: |
  Automatic type generation from OpenAPI and GraphQL schemas.
  Covers openapi-typescript, graphql-codegen, and contract sync.

  USE WHEN: user asks about "openapi-typescript", "graphql-codegen", "generate types from API", "type generation", "API types", "schema to TypeScript"

  DO NOT USE FOR: manual type definitions - use TypeScript skills, contract validation - use `openapi-contract` skill
allowed-tools: Read, Grep, Glob, Bash
---
# Type Generation - Quick Reference

## When NOT to Use This Skill
- **Manual type writing** - Use TypeScript skills
- **Contract validation** - Use `openapi-contract` skill
- **GraphQL queries** - Use `graphql-contract` skill

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `typescript` for advanced type patterns.

## Tool Comparison

| Tool | Source | Output | Use Case |
|------|--------|--------|----------|
| **openapi-typescript** | OpenAPI 3.x | TypeScript types | REST APIs |
| **openapi-fetch** | OpenAPI 3.x | Type-safe client | REST + fetch |
| **graphql-codegen** | GraphQL schema | Types + hooks | GraphQL APIs |
| **orval** | OpenAPI 3.x | Types + client | REST + Axios/fetch |
| **swagger-typescript-api** | OpenAPI/Swagger | Types + class client | REST APIs |

## openapi-typescript Setup

### Installation

```bash
npm install -D openapi-typescript
```

### Basic Usage

```bash
# From local file
npx openapi-typescript openapi.yaml -o src/api/types.ts

# From URL
npx openapi-typescript https://api.example.com/openapi.json -o src/api/types.ts

# Watch mode
npx openapi-typescript openapi.yaml -o src/api/types.ts --watch
```

### Configuration (openapi-ts.config.ts)

```typescript
import { defineConfig } from 'openapi-typescript';

export default defineConfig({
  input: './openapi.yaml',
  output: './src/api/types.ts',
  // Alphabetize output
  alphabetize: true,
  // Export type for each path
  exportType: true,
  // Transform property names
  transform: (schemaObject) => {
    // Custom transformation
    return schemaObject;
  },
});
```

### Generated Types Usage

```typescript
// Generated types
import type { paths, components } from './api/types';

// Request body type
type CreateUserBody = paths['/users']['post']['requestBody']['content']['application/json'];

// Response type
type UserResponse = paths['/users']['get']['responses']['200']['content']['application/json'];

// Schema type
type User = components['schemas']['User'];

// Path parameters
type UserParams = paths['/users/{id}']['parameters']['path'];
```

## openapi-fetch Setup (Type-safe Client)

### Installation

```bash
npm install openapi-fetch
npm install -D openapi-typescript
```

### Generate Types + Create Client

```bash
# Generate types first
npx openapi-typescript openapi.yaml -o src/api/types.ts
```

```typescript
// src/api/client.ts
import createClient from 'openapi-fetch';
import type { paths } from './types';

const client = createClient<paths>({
  baseUrl: 'https://api.example.com',
  headers: {
    'Content-Type': 'application/json',
  },
});

export default client;
```

### Usage with Type Safety

```typescript
import client from './api/client';

// GET request - fully typed
const { data, error } = await client.GET('/users/{id}', {
  params: {
    path: { id: '123' },
    query: { include: 'profile' },
  },
});

if (data) {
  // data is properly typed as User
  console.log(data.name);
}

// POST request
const { data: newUser } = await client.POST('/users', {
  body: {
    name: 'John',
    email: 'john@example.com',
  },
});

// With React Query
import { useQuery, useMutation } from '@tanstack/react-query';

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
```

## GraphQL Codegen Setup

### Installation

```bash
npm install -D @graphql-codegen/cli @graphql-codegen/typescript \
  @graphql-codegen/typescript-operations @graphql-codegen/typescript-react-query
```

### Configuration (codegen.ts)

```typescript
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'https://api.example.com/graphql',
  documents: ['src/**/*.graphql', 'src/**/*.tsx'],
  generates: {
    './src/generated/graphql.ts': {
      plugins: [
        'typescript',
        'typescript-operations',
        'typescript-react-query',
      ],
      config: {
        fetcher: {
          endpoint: 'https://api.example.com/graphql',
        },
        exposeQueryKeys: true,
        exposeFetcher: true,
      },
    },
  },
};

export default config;
```

### GraphQL Document

```graphql
# src/graphql/users.graphql
query GetUser($id: ID!) {
  user(id: $id) {
    id
    name
    email
    createdAt
  }
}

mutation CreateUser($input: CreateUserInput!) {
  createUser(input: $input) {
    id
    name
    email
  }
}
```

### Generate and Use

```bash
npx graphql-codegen
```

```typescript
// Auto-generated hooks
import { useGetUserQuery, useCreateUserMutation } from './generated/graphql';

function UserProfile({ userId }: { userId: string }) {
  const { data, isLoading } = useGetUserQuery({ id: userId });

  if (isLoading) return <Spinner />;
  return <div>{data?.user?.name}</div>;
}

function CreateUserForm() {
  const mutation = useCreateUserMutation();

  const onSubmit = (data: CreateUserInput) => {
    mutation.mutate({ input: data });
  };

  return <form onSubmit={handleSubmit(onSubmit)}>...</form>;
}
```

## Orval Setup (OpenAPI + Client Generation)

### Installation

```bash
npm install -D orval
```

### Configuration (orval.config.ts)

```typescript
import { defineConfig } from 'orval';

export default defineConfig({
  petstore: {
    input: './openapi.yaml',
    output: {
      target: './src/api/endpoints.ts',
      schemas: './src/api/model',
      client: 'react-query',
      mode: 'tags-split',
      mock: true,
    },
  },
});
```

### Generate

```bash
npx orval
```

### Generated Output

```typescript
// Auto-generated hooks with React Query
import { useGetUsers, useCreateUser } from './api/endpoints';

function UserList() {
  const { data: users } = useGetUsers();
  return <ul>{users?.map(u => <li key={u.id}>{u.name}</li>)}</ul>;
}
```

## Package.json Scripts

```json
{
  "scripts": {
    "generate:types": "openapi-typescript openapi.yaml -o src/api/types.ts",
    "generate:client": "orval",
    "generate:graphql": "graphql-codegen",
    "generate": "npm run generate:types && npm run generate:client",
    "predev": "npm run generate",
    "prebuild": "npm run generate"
  }
}
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Type Generation
on: [push, pull_request]

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Generate types
        run: npm run generate:types

      - name: Check for changes
        run: |
          git diff --exit-code src/api/types.ts || \
          (echo "Types are out of date! Run 'npm run generate:types'" && exit 1)
```

## Best Practices

### 1. Version Control Generated Files

```gitignore
# Option A: Don't commit (regenerate in CI)
src/api/types.ts
src/generated/

# Option B: Commit (recommended for visibility)
# Don't add to .gitignore, commit generated files
```

### 2. Pre-commit Hook

```json
// package.json
{
  "lint-staged": {
    "openapi.yaml": [
      "npm run generate:types",
      "git add src/api/types.ts"
    ]
  }
}
```

### 3. Watch Mode in Development

```json
{
  "scripts": {
    "dev": "concurrently \"npm run generate:types -- --watch\" \"vite\""
  }
}
```

### 4. Type Re-exports

```typescript
// src/api/index.ts
export type {
  User,
  CreateUserRequest,
  UpdateUserRequest,
  UserListResponse,
} from './types';

export { default as client } from './client';
```

## Common Patterns

### Nullable Fields

```yaml
# OpenAPI
components:
  schemas:
    User:
      properties:
        middleName:
          type: string
          nullable: true
```

```typescript
// Generated
interface User {
  middleName: string | null;
}

// Usage
const displayName = user.middleName ?? 'N/A';
```

### Discriminated Unions

```yaml
# OpenAPI
components:
  schemas:
    Shape:
      oneOf:
        - $ref: '#/components/schemas/Circle'
        - $ref: '#/components/schemas/Rectangle'
      discriminator:
        propertyName: type
```

```typescript
// Generated
type Shape = Circle | Rectangle;

// Usage with type narrowing
function getArea(shape: Shape): number {
  switch (shape.type) {
    case 'circle':
      return Math.PI * shape.radius ** 2;
    case 'rectangle':
      return shape.width * shape.height;
  }
}
```

### Enums

```yaml
# OpenAPI
components:
  schemas:
    UserRole:
      type: string
      enum: [admin, user, guest]
```

```typescript
// Generated as union type
type UserRole = 'admin' | 'user' | 'guest';

// Or as const object
const UserRole = {
  Admin: 'admin',
  User: 'user',
  Guest: 'guest',
} as const;
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Manual type sync | Drift, errors | Auto-generate from spec |
| `any` for API responses | No type safety | Use generated types |
| Ignoring nullable | Runtime errors | Handle null properly |
| No pre-commit generation | Outdated types | Hook into git workflow |
| Editing generated files | Lost on regenerate | Extend types separately |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Types don't match API | Outdated spec | Update and regenerate |
| Generation fails | Invalid OpenAPI | Validate spec first |
| Missing properties | Optional vs required | Check OpenAPI schema |
| Wrong enum values | Spec changed | Regenerate types |
| Import errors | Path configuration | Check tsconfig paths |

## Related Skills
- [OpenAPI Contract](../openapi-contract/SKILL.md)
- [GraphQL Contract](../graphql-contract/SKILL.md)
- [DTO Sync Patterns](../dto-sync-patterns/SKILL.md)
