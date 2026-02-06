# GraphQL Code Generation Quick Reference

> See [GraphQL SKILL](../SKILL.md) for core knowledge

## Setup

```bash
npm install -D @graphql-codegen/cli @graphql-codegen/client-preset
npm install graphql-request
```

## Configuration

```typescript
// codegen.ts
import { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'http://localhost:4000/graphql',
  documents: ['src/**/*.graphql', 'src/**/*.tsx'],
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

```json
// package.json
{
  "scripts": {
    "codegen": "graphql-codegen",
    "codegen:watch": "graphql-codegen --watch"
  }
}
```

## Basic Usage

```typescript
import { graphql } from '@/gql';
import { request } from 'graphql-request';

const UserQuery = graphql(`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      name
      email
    }
  }
`);

// Fully typed
const data = await request('http://localhost:4000/graphql', UserQuery, { id: '1' });
console.log(data.user?.name); // TypeScript knows the shape
```

## With TanStack Query

```typescript
import { graphql } from '@/gql';
import { request } from 'graphql-request';
import { useQuery, useMutation } from '@tanstack/react-query';

const endpoint = 'http://localhost:4000/graphql';

// Query
const UsersQuery = graphql(`
  query GetUsers($limit: Int) {
    users(limit: $limit) {
      id
      name
      email
    }
  }
`);

function useUsers(limit?: number) {
  return useQuery({
    queryKey: ['users', limit],
    queryFn: () => request(endpoint, UsersQuery, { limit }),
  });
}

// Mutation
const CreateUserMutation = graphql(`
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      id
      name
    }
  }
`);

function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { name: string; email: string }) =>
      request(endpoint, CreateUserMutation, { input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
```

## Fragment Colocation

```typescript
// components/UserCard.tsx
import { graphql, FragmentType, useFragment } from '@/gql';

export const UserCardFragment = graphql(`
  fragment UserCard on User {
    id
    name
    email
    avatar
  }
`);

interface Props {
  user: FragmentType<typeof UserCardFragment>;
}

export function UserCard({ user: userProp }: Props) {
  const user = useFragment(UserCardFragment, userProp);

  return (
    <div>
      <img src={user.avatar} alt={user.name} />
      <h3>{user.name}</h3>
      <p>{user.email}</p>
    </div>
  );
}

// pages/Users.tsx
const UsersQuery = graphql(`
  query GetUsers {
    users {
      id
      ...UserCard
    }
  }
`);

function UsersPage() {
  const { data } = useQuery({
    queryKey: ['users'],
    queryFn: () => request(endpoint, UsersQuery),
  });

  return (
    <div>
      {data?.users.map(user => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
}
```

## With Apollo Client

```typescript
import { graphql } from '@/gql';
import { useQuery as useApolloQuery, useMutation as useApolloMutation } from '@apollo/client';

const UserQuery = graphql(`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      name
    }
  }
`);

function UserProfile({ id }: { id: string }) {
  const { data, loading, error } = useApolloQuery(UserQuery, {
    variables: { id },
  });

  if (loading) return <Spinner />;
  if (error) return <Error />;
  return <div>{data?.user?.name}</div>;
}
```

## React Query Plugin

```typescript
// codegen.ts - with react-query plugin
import { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'http://localhost:4000/graphql',
  documents: ['src/**/*.graphql'],
  generates: {
    './src/gql/': {
      preset: 'client',
    },
    './src/gql/hooks.ts': {
      plugins: [
        'typescript',
        'typescript-operations',
        'typescript-react-query',
      ],
      config: {
        fetcher: {
          endpoint: 'http://localhost:4000/graphql',
        },
        exposeQueryKeys: true,
        exposeFetcher: true,
      },
    },
  },
};
```

```typescript
// Auto-generated hooks
import { useGetUserQuery, useCreateUserMutation } from '@/gql/hooks';

function UserProfile({ id }: { id: string }) {
  const { data, isLoading } = useGetUserQuery({ id });

  if (isLoading) return <Spinner />;
  return <div>{data?.user?.name}</div>;
}
```

## Schema Introspection

```typescript
// codegen.ts - with introspection
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

```bash
# Generate schema.graphql from endpoint
npx graphql-codegen --config codegen.ts
```

## Watch Mode Development

```bash
# Terminal 1: Run codegen in watch mode
npm run codegen:watch

# Terminal 2: Run your app
npm run dev
```

## CI/CD Integration

```yaml
# .github/workflows/graphql-types.yml
name: Generate GraphQL Types

on:
  push:
    paths:
      - '**/*.graphql'
      - 'codegen.ts'

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run codegen
      - run: |
          git config user.name github-actions
          git config user.email github-actions@github.com
          git add src/gql/
          git diff --staged --quiet || git commit -m "chore: update GraphQL types"
          git push
```

