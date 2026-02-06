---
name: graphql-codegen
description: |
  GraphQL Code Generator for TypeScript. Generates typed operations, hooks,
  and document nodes from GraphQL schemas. Use for type-safe GraphQL in frontend.

  USE WHEN: user mentions "GraphQL Codegen", "generate GraphQL types", "GraphQL TypeScript",
  "typed GraphQL", "client preset", "React Query GraphQL", asks about "GraphQL code generation",
  "type-safe GraphQL client", "fragment masking"

  DO NOT USE FOR: REST API types - use `openapi-codegen` instead; tRPC - use `trpc` instead;
  GraphQL schema design - use `graphql` instead; Manual GraphQL queries without codegen
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---
# GraphQL Code Generator Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `graphql-codegen` for comprehensive documentation.

## Installation

```bash
npm install -D @graphql-codegen/cli @graphql-codegen/typescript \
  @graphql-codegen/typescript-operations @graphql-codegen/client-preset
```

## Basic Configuration

```typescript
// codegen.ts
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'http://localhost:4000/graphql',
  documents: ['src/**/*.tsx', 'src/**/*.ts'],
  ignoreNoDocuments: true,
  generates: {
    './src/gql/': {
      preset: 'client',
      config: {
        documentMode: 'string',
      },
    },
  },
};

export default config;
```

## Run Generation

```bash
npx graphql-codegen
npx graphql-codegen --watch  # Watch mode
```

## Client Preset (Recommended)

The client preset generates everything needed for type-safe GraphQL.

```typescript
// codegen.ts
const config: CodegenConfig = {
  schema: 'http://localhost:4000/graphql',
  documents: ['src/**/*.tsx'],
  generates: {
    './src/gql/': {
      preset: 'client',
      plugins: [],
      presetConfig: {
        gqlTagName: 'gql',
        fragmentMasking: { unmaskFunctionName: 'getFragmentData' },
      },
    },
  },
};
```

### Usage

```typescript
import { gql } from '../gql';
import { useQuery } from '@apollo/client';

const GET_USER = gql(`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      name
      email
    }
  }
`);

function UserProfile({ id }: { id: string }) {
  const { data, loading } = useQuery(GET_USER, {
    variables: { id },
  });

  if (loading) return <Spinner />;
  // data.user is fully typed
  return <div>{data?.user?.name}</div>;
}
```

---

## TanStack Query Integration

```bash
npm install -D @graphql-codegen/typescript-react-query
```

```typescript
// codegen.ts
const config: CodegenConfig = {
  schema: 'http://localhost:4000/graphql',
  documents: ['src/**/*.graphql'],
  generates: {
    './src/gql/index.ts': {
      plugins: [
        'typescript',
        'typescript-operations',
        'typescript-react-query',
      ],
      config: {
        fetcher: {
          func: './fetcher#fetcher',
          isReactHook: false,
        },
        reactQueryVersion: 5,
        addInfiniteQuery: true,
      },
    },
  },
};
```

### Fetcher

```typescript
// src/gql/fetcher.ts
export const fetcher = <TData, TVariables>(
  query: string,
  variables?: TVariables
): (() => Promise<TData>) => {
  return async () => {
    const response = await fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    const json = await response.json();
    if (json.errors) {
      throw new Error(json.errors[0].message);
    }
    return json.data;
  };
};
```

### Generated Hooks Usage

```typescript
import { useGetUserQuery, useCreateUserMutation } from './gql';

function UserProfile({ id }: { id: string }) {
  const { data, isLoading } = useGetUserQuery({ id });
  const createMutation = useCreateUserMutation();

  const handleCreate = () => {
    createMutation.mutate({
      input: { name: 'John', email: 'john@example.com' },
    });
  };

  if (isLoading) return <Spinner />;
  return <div>{data?.user?.name}</div>;
}
```

---

## Fragment Colocation

```typescript
// components/UserAvatar.tsx
import { gql, FragmentType, getFragmentData } from '../gql';

export const USER_AVATAR_FRAGMENT = gql(`
  fragment UserAvatar on User {
    id
    name
    avatarUrl
  }
`);

interface Props {
  user: FragmentType<typeof USER_AVATAR_FRAGMENT>;
}

export function UserAvatar({ user }: Props) {
  const data = getFragmentData(USER_AVATAR_FRAGMENT, user);
  return <img src={data.avatarUrl} alt={data.name} />;
}

// Usage in parent query
const GET_USER = gql(`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      ...UserAvatar
    }
  }
`);
```

---

## Production Readiness

### Schema Polling

```typescript
// codegen.ts
const config: CodegenConfig = {
  schema: [
    {
      'http://localhost:4000/graphql': {
        headers: {
          Authorization: `Bearer ${process.env.GRAPHQL_TOKEN}`,
        },
      },
    },
  ],
  // ...
};
```

### Multiple Schemas

```typescript
const config: CodegenConfig = {
  generates: {
    './src/gql/user-api/': {
      schema: 'http://user-api:4000/graphql',
      documents: ['src/features/user/**/*.tsx'],
      preset: 'client',
    },
    './src/gql/product-api/': {
      schema: 'http://product-api:4001/graphql',
      documents: ['src/features/product/**/*.tsx'],
      preset: 'client',
    },
  },
};
```

### CI/CD Integration

```yaml
# .github/workflows/codegen.yml
name: GraphQL Codegen

on:
  push:
    paths:
      - 'src/**/*.graphql'
      - 'src/**/*.tsx'

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx graphql-codegen
      - name: Check for changes
        run: |
          if [[ -n $(git status --porcelain src/gql) ]]; then
            echo "Generated files changed"
            exit 1
          fi
```

### Package Scripts

```json
{
  "scripts": {
    "codegen": "graphql-codegen",
    "codegen:watch": "graphql-codegen --watch"
  }
}
```

### Checklist

- [ ] Schema source configured (URL or local)
- [ ] Documents path matches source files
- [ ] Client preset for optimal output
- [ ] Fetcher configured with auth
- [ ] Fragment colocation pattern
- [ ] Watch mode for development
- [ ] CI validation of generated code
- [ ] TypeScript strict mode compatible

## When NOT to Use This Skill

- REST API type generation (use `openapi-codegen` skill)
- tRPC type-safe APIs (use `trpc` skill)
- GraphQL schema design (use `graphql` skill)
- Non-TypeScript projects
- Simple GraphQL queries without type generation needs

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Committing generated files to git | Merge conflicts, outdated types | Add to .gitignore, generate in CI |
| Not using client preset | Verbose configuration | Use client preset for modern setup |
| Ignoring schema changes | Type mismatches at runtime | Run codegen in watch mode during dev |
| Missing operationId or query names | Poor generated hook names | Name all queries/mutations |
| Not using fragments | Code duplication | Use fragments for reusable fields |
| Generating types only | Missing runtime validation | Combine with schema validation |
| Hardcoding schema URL | Environment coupling | Use env variables for schema source |
| Not versioning generator packages | Inconsistent output across team | Pin generator versions |

## Quick Troubleshooting

| Issue | Possible Cause | Solution |
|-------|----------------|----------|
| Generation fails | Invalid schema or documents | Validate schema, check GraphQL syntax |
| Type errors after generation | Schema/code mismatch | Regenerate types, check schema changes |
| Missing types | Documents path not matching files | Check documents glob pattern |
| Duplicate operation names | Same query name in multiple files | Use unique operation names |
| Fragment not found | Fragment not in documents | Include fragment file in documents |
| Hook not generated | Not using React Query plugin | Add typescript-react-query plugin |
| "Cannot find module './gql'" | Generation didn't run | Run `npm run codegen` |
| Slow generation | Too many documents | Optimize glob patterns, use ignoreNoDocuments |
| Type inference not working | Wrong import path | Import from generated gql folder |

## Reference Documentation
- [Client Preset](quick-ref/client-preset.md)
- [React Query Plugin](quick-ref/react-query.md)
- [Typed Document Node](quick-ref/typed-document-node.md)
