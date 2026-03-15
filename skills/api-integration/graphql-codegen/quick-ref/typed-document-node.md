# Typed Document Node Quick Reference

> See [GraphQL Codegen SKILL](../SKILL.md) for core knowledge

## Installation

```bash
npm install -D @graphql-codegen/typed-document-node @graphql-typed-document-node/core
```

## Configuration

```typescript
// codegen.ts
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'http://localhost:4000/graphql',
  documents: ['src/**/*.graphql'],
  generates: {
    './src/gql/': {
      preset: 'import-types',
      plugins: [
        'typescript',
        'typescript-operations',
        'typed-document-node',
      ],
      presetConfig: {
        typesPath: './types',
      },
    },
  },
};

export default config;
```

## What is TypedDocumentNode?

TypedDocumentNode is a type that carries both the result type and variables type:

```typescript
interface TypedDocumentNode<TResult, TVariables> extends DocumentNode {
  __apiType?: (variables: TVariables) => TResult;
}
```

## Generated Code

```typescript
// Generated from GetUser.graphql
import { TypedDocumentNode } from '@graphql-typed-document-node/core';

export const GetUserDocument: TypedDocumentNode<
  GetUserQuery,
  GetUserQueryVariables
> = {
  kind: 'Document',
  definitions: [/* ... */],
};
```

## Usage with Apollo Client

```typescript
import { useQuery, useMutation } from '@apollo/client';
import { GetUserDocument, CreateUserDocument } from '../gql';

function UserProfile({ id }: { id: string }) {
  // Types are inferred automatically
  const { data, loading } = useQuery(GetUserDocument, {
    variables: { id },
  });

  // data is typed as GetUserQuery
  // variables must match GetUserQueryVariables
}

function CreateUser() {
  const [createUser] = useMutation(CreateUserDocument);

  // Variables are typed
  createUser({
    variables: {
      input: { name: 'John', email: 'john@example.com' },
    },
  });
}
```

## Usage with urql

```typescript
import { useQuery, useMutation } from 'urql';
import { GetUserDocument, CreateUserDocument } from '../gql';

function UserProfile({ id }: { id: string }) {
  const [result] = useQuery({
    query: GetUserDocument,
    variables: { id },
  });

  // result.data is typed as GetUserQuery | undefined
}
```

## Usage with graphql-request

```typescript
import { GraphQLClient } from 'graphql-request';
import { GetUserDocument, GetUserQuery, GetUserQueryVariables } from '../gql';

const client = new GraphQLClient('http://localhost:4000/graphql');

async function getUser(id: string): Promise<GetUserQuery> {
  return client.request(GetUserDocument, { id });
}
```

## Type-Safe Fetcher

```typescript
import { TypedDocumentNode } from '@graphql-typed-document-node/core';

async function executeQuery<TResult, TVariables>(
  document: TypedDocumentNode<TResult, TVariables>,
  variables: TVariables
): Promise<TResult> {
  const response = await fetch('/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: document.loc?.source.body,
      variables,
    }),
  });

  const json = await response.json();
  return json.data;
}

// Usage - fully typed
const user = await executeQuery(GetUserDocument, { id: '123' });
```

## Comparison

| Approach | Type Safety | Bundle Size | Runtime |
|----------|-------------|-------------|---------|
| TypedDocumentNode | Full | Larger | DocumentNode |
| Client Preset (gql) | Full | Optimized | String or DocumentNode |
| Just types | Partial | Smallest | Manual |

## When to Use

Use TypedDocumentNode when:
- You need full DocumentNode at runtime
- You're using older Apollo Client versions
- You need fragment definitions at runtime

Use Client Preset when:
- You want optimized bundle size
- You're using modern Apollo/urql
- You want fragment masking
