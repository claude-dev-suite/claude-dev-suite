---
name: tanstack-query
description: |
  TanStack Query for data fetching. Covers queries, mutations, and
  caching. Use for server state management in React.

  USE WHEN: user mentions "tanstack query", "react query", "data fetching", "API calls", asks about "cache management", "mutations", "infinite scroll", "optimistic updates", "prefetching", "server state", "useQuery", "useMutation"

  DO NOT USE FOR: client state - use `zustand` or `redux-toolkit`; Vue apps - use `pinia` with composables; static data - use React context
allowed-tools: Read, Grep, Glob, Write, Edit
---
# TanStack Query Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `tanstack-query` for comprehensive documentation.

## Setup

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,  // 1 minute
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MyApp />
    </QueryClientProvider>
  );
}
```

## Queries

```tsx
import { useQuery } from '@tanstack/react-query';

function UserProfile({ userId }: { userId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
  });

  if (isLoading) return <Spinner />;
  if (error) return <Error message={error.message} />;
  return <div>{data.name}</div>;
}

// With options
const { data } = useQuery({
  queryKey: ['users', { status: 'active' }],
  queryFn: () => fetchUsers({ status: 'active' }),
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
  enabled: !!userId,  // Conditional fetch
});
```

## Mutations

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';

function CreateUser() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (newUser: CreateUserInput) => createUser(newUser),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      mutation.mutate({ name: 'John' });
    }}>
      <button disabled={mutation.isPending}>
        {mutation.isPending ? 'Creating...' : 'Create'}
      </button>
    </form>
  );
}
```

## Optimistic Updates

```tsx
const mutation = useMutation({
  mutationFn: updateUser,
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey: ['user', id] });
    const previous = queryClient.getQueryData(['user', id]);
    queryClient.setQueryData(['user', id], newData);
    return { previous };
  },
  onError: (err, newData, context) => {
    queryClient.setQueryData(['user', id], context.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['user', id] });
  },
});
```

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Client-side UI state (modals, form inputs) | `zustand` or React state |
| Vue 3 applications | `pinia` with custom composables |
| Static configuration data | React Context API |
| Real-time WebSocket data | Custom hooks with WebSocket + Zustand |
| GraphQL queries | `@apollo/client` or `urql` |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using queries for client state | Unnecessary complexity, wrong abstraction | Use Zustand or React state |
| Not using query keys properly | Cache collisions, wrong data | Use query key factory pattern |
| Fetching on every render | Performance issues | Set proper `staleTime` and `gcTime` |
| Manual cache invalidation everywhere | Hard to maintain | Use mutation's `onSuccess` with `invalidateQueries` |
| Ignoring loading/error states | Poor UX | Always handle `isLoading` and `error` |
| Using `refetch()` instead of `invalidate()` | Bypasses cache, wastes requests | Use `invalidateQueries()` for revalidation |
| Not prefetching predictable navigation | Slow perceived performance | Prefetch on hover/mount |
| Storing queries in global state | Defeats TanStack Query purpose | Let TanStack Query manage cache |
| No retry strategy for transient errors | Failed requests on network blips | Configure retry with backoff |
| Missing query key dependencies | Stale data when params change | Include all variables in query key |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Queries not refetching | `staleTime` too high or `enabled: false` | Lower `staleTime` or check `enabled` condition |
| "No QueryClient set" error | Missing `QueryClientProvider` | Wrap app with `<QueryClientProvider client={queryClient}>` |
| Mutations not updating UI | Not invalidating queries | Call `queryClient.invalidateQueries()` in `onSuccess` |
| Infinite refetch loop | Query key changes on every render | Stabilize query key with `useMemo` or constants |
| SSR hydration mismatch | Server/client data out of sync | Use `HydrationBoundary` with dehydrated state |
| Memory leaks | Queries never garbage collected | Set proper `gcTime` (default 5 minutes) |
| Optimistic update reverted incorrectly | Context not returned from `onMutate` | Return previous value from `onMutate`, restore in `onError` |
| Multiple identical requests | No deduplication interval | Set `dedupingInterval` in query options |

## Production Readiness

### Query Client Configuration

```tsx
// lib/queryClient.ts
import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Global error handling for queries
      if (query.state.data !== undefined) {
        // Only show error toasts for background refetch failures
        toast.error(`Background update failed: ${error.message}`);
      }

      // Log to monitoring
      logError({ type: 'query', key: query.queryKey, error });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      logError({ type: 'mutation', key: mutation.options.mutationKey, error });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      gcTime: 1000 * 60 * 5, // 5 minutes (formerly cacheTime)
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error.status >= 400 && error.status < 500) return false;
        return failureCount < 3;
      },
      refetchOnWindowFocus: process.env.NODE_ENV === 'production',
    },
    mutations: {
      retry: false,
    },
  },
});
```

### Query Key Factory

```typescript
// lib/queryKeys.ts - Organized query keys
export const queryKeys = {
  users: {
    all: ['users'] as const,
    lists: () => [...queryKeys.users.all, 'list'] as const,
    list: (filters: UserFilters) => [...queryKeys.users.lists(), filters] as const,
    details: () => [...queryKeys.users.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.users.details(), id] as const,
  },
  posts: {
    all: ['posts'] as const,
    byUser: (userId: string) => [...queryKeys.posts.all, 'user', userId] as const,
  },
} as const;

// Usage
const { data } = useQuery({
  queryKey: queryKeys.users.detail(userId),
  queryFn: () => fetchUser(userId),
});

// Invalidate all user queries
queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
```

### Error Handling

```tsx
// hooks/useApiQuery.ts
import { UseQueryOptions, useQuery } from '@tanstack/react-query';

interface ApiError {
  status: number;
  message: string;
}

export function useApiQuery<TData>(
  options: UseQueryOptions<TData, ApiError>
) {
  return useQuery({
    ...options,
    throwOnError: (error) => {
      // Only throw for critical errors that should trigger error boundary
      return error.status >= 500;
    },
  });
}

// With error boundary
function UserProfile({ userId }: { userId: string }) {
  const { data, error, isLoading } = useApiQuery({
    queryKey: queryKeys.users.detail(userId),
    queryFn: () => fetchUser(userId),
  });

  if (isLoading) return <Skeleton />;

  if (error) {
    if (error.status === 404) return <NotFound />;
    return <ErrorMessage message={error.message} />;
  }

  return <UserCard user={data} />;
}
```

### Prefetching & SSR

```tsx
// Next.js App Router example
// app/users/page.tsx
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';

export default async function UsersPage() {
  const queryClient = new QueryClient();

  await queryClient.prefetchQuery({
    queryKey: queryKeys.users.lists(),
    queryFn: fetchUsers,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UserList />
    </HydrationBoundary>
  );
}

// Prefetch on hover
function UserLink({ userId }: { userId: string }) {
  const queryClient = useQueryClient();

  const prefetchUser = () => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.users.detail(userId),
      queryFn: () => fetchUser(userId),
      staleTime: 1000 * 60,
    });
  };

  return (
    <Link href={`/users/${userId}`} onMouseEnter={prefetchUser}>
      View User
    </Link>
  );
}
```

### Testing

```tsx
// test-utils.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

export function renderWithQuery(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    ),
    queryClient,
  };
}

// Test example
test('displays user data', async () => {
  server.use(
    http.get('/api/users/:id', () => {
      return HttpResponse.json({ id: '1', name: 'John' });
    })
  );

  renderWithQuery(<UserProfile userId="1" />);

  expect(await screen.findByText('John')).toBeInTheDocument();
});
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Cache hit ratio | > 80% |
| Average query time | < 200ms |
| Stale data served | < 5% |
| Background refetch errors | < 1% |

### Checklist

- [ ] Query key factory pattern
- [ ] Global error handling in QueryCache
- [ ] Retry logic for transient failures
- [ ] staleTime and gcTime configured
- [ ] Optimistic updates for mutations
- [ ] Prefetching for navigation
- [ ] SSR hydration setup
- [ ] Test utilities with fresh QueryClient
- [ ] DevTools in development only
- [ ] Error boundaries for critical failures

## OpenAPI Integration

TanStack Query works seamlessly with generated OpenAPI clients for type-safe data fetching.

### With Generated Types

```typescript
import type { paths, components } from '@/types/api';
import { useQuery, useMutation } from '@tanstack/react-query';

type User = components['schemas']['User'];
type CreateUserInput = components['schemas']['CreateUserInput'];

// Type-safe query
function useUser(id: string) {
  return useQuery<User>({
    queryKey: ['users', id],
    queryFn: async () => {
      const res = await fetch(`/api/users/${id}`);
      return res.json();
    },
  });
}

// Type-safe mutation
function useCreateUser() {
  return useMutation<User, Error, CreateUserInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/users', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return res.json();
    },
  });
}
```

### With openapi-fetch

```typescript
import createClient from 'openapi-fetch';
import type { paths } from '@/types/api';

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
```

### Related Skills

| Skill | Purpose |
|-------|---------|
| [OpenAPI Codegen](../../api-integration/openapi-codegen/SKILL.md) | Generate types from spec |
| [HTTP Clients](../../api-integration/http-clients/SKILL.md) | Axios/fetch integration |
| [React API](../../frontend-frameworks/react-api/SKILL.md) | Alternative patterns (SWR) |

## Reference Documentation
- [Query Keys](quick-ref/query-keys.md)
- [Caching Strategies](quick-ref/caching.md)
- [OpenAPI Types](quick-ref/openapi-types.md)
