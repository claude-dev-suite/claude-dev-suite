# GraphQL Codegen React Query Plugin

> See [GraphQL Codegen SKILL](../SKILL.md) for core knowledge

## Installation

```bash
npm install -D @graphql-codegen/typescript @graphql-codegen/typescript-operations \
  @graphql-codegen/typescript-react-query
npm install @tanstack/react-query graphql-request
```

## Configuration

```typescript
// codegen.ts
import type { CodegenConfig } from '@graphql-codegen/cli';

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
        exposeQueryKeys: true,
        exposeFetcher: true,
        addInfiniteQuery: true,
      },
    },
  },
};

export default config;
```

## Fetcher Implementation

```typescript
// src/gql/fetcher.ts
import { GraphQLClient } from 'graphql-request';

const client = new GraphQLClient('http://localhost:4000/graphql');

export const fetcher = <TData, TVariables extends Record<string, unknown>>(
  query: string,
  variables?: TVariables,
  headers?: RequestInit['headers']
): (() => Promise<TData>) => {
  return async () => {
    const token = localStorage.getItem('token');
    return client.request<TData>(query, variables, {
      Authorization: token ? `Bearer ${token}` : '',
      ...headers,
    });
  };
};
```

## GraphQL Files

```graphql
# src/features/users/queries.graphql
query GetUser($id: ID!) {
  user(id: $id) {
    id
    name
    email
    createdAt
  }
}

query GetUsers($limit: Int, $offset: Int) {
  users(limit: $limit, offset: $offset) {
    id
    name
    email
  }
  usersCount
}

mutation CreateUser($input: CreateUserInput!) {
  createUser(input: $input) {
    id
    name
    email
  }
}

mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {
  updateUser(id: $id, input: $input) {
    id
    name
    email
  }
}
```

## Generated Hooks Usage

```typescript
import {
  useGetUserQuery,
  useGetUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useInfiniteGetUsersQuery,
} from '../gql';

// Query
function UserProfile({ id }: { id: string }) {
  const { data, isLoading, error } = useGetUserQuery({ id });

  if (isLoading) return <Spinner />;
  if (error) return <Error message={error.message} />;

  return <div>{data?.user?.name}</div>;
}

// Query with options
function UserList() {
  const { data } = useGetUsersQuery(
    { limit: 10, offset: 0 },
    {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  );

  return (
    <ul>
      {data?.users?.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}

// Mutation
function CreateUserForm() {
  const queryClient = useQueryClient();
  const { mutate, isPending } = useCreateUserMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['GetUsers'] });
    },
  });

  const handleSubmit = (data: CreateUserInput) => {
    mutate({ input: data });
  };

  return <form onSubmit={handleSubmit}>...</form>;
}

// Infinite Query
function InfiniteUserList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteGetUsersQuery(
    { limit: 10 },
    {
      getNextPageParam: (lastPage, pages) => {
        const totalFetched = pages.length * 10;
        return totalFetched < lastPage.usersCount
          ? { offset: totalFetched }
          : undefined;
      },
    }
  );

  return (
    <div>
      {data?.pages.map((page) =>
        page.users?.map((user) => <UserCard key={user.id} user={user} />)
      )}
      {hasNextPage && (
        <button onClick={() => fetchNextPage()}>
          {isFetchingNextPage ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
}
```

## Query Keys

```typescript
import { useGetUserQuery, GetUserDocument } from '../gql';

// Access query key
const queryKey = useGetUserQuery.getKey({ id: '123' });
// ['GetUser', { id: '123' }]

// Prefetch
queryClient.prefetchQuery({
  queryKey: useGetUserQuery.getKey({ id: '123' }),
  queryFn: useGetUserQuery.fetcher({ id: '123' }),
});

// Invalidate
queryClient.invalidateQueries({
  queryKey: ['GetUsers'],
});
```

## Config Options

```typescript
{
  config: {
    // Fetcher configuration
    fetcher: {
      func: './fetcher#fetcher',
      isReactHook: false,
    },

    // React Query version (4 or 5)
    reactQueryVersion: 5,

    // Expose query keys
    exposeQueryKeys: true,

    // Expose fetcher function
    exposeFetcher: true,

    // Add useInfiniteQuery hooks
    addInfiniteQuery: true,

    // Add useSuspenseQuery hooks
    addSuspenseQuery: true,

    // Error type
    errorType: 'Error',
  },
}
```
