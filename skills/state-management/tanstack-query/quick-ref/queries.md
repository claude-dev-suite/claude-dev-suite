# TanStack Query - Queries Quick Reference

> **Knowledge Base:** Read `knowledge/tanstack-query/queries.md` for complete documentation.

## Setup

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30,   // 30 minutes (was cacheTime)
      retry: 3,
      refetchOnWindowFocus: true,
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

## useQuery

```tsx
import { useQuery } from '@tanstack/react-query';

function Users() {
  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: () => fetch('/api/users').then(res => res.json()),
  });

  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {data.map(user => <li key={user.id}>{user.name}</li>)}
    </ul>
  );
}
```

## Query Keys

```tsx
// Simple key
useQuery({ queryKey: ['todos'], queryFn: fetchTodos });

// With variables
useQuery({ queryKey: ['todo', todoId], queryFn: () => fetchTodo(todoId) });

// Complex key
useQuery({
  queryKey: ['todos', { status, page }],
  queryFn: () => fetchTodos({ status, page }),
});

// Keys are serialized - these are equivalent:
['todos', { status: 'done', page: 1 }]
['todos', { page: 1, status: 'done' }]
```

## Query Options

```tsx
useQuery({
  queryKey: ['user', userId],
  queryFn: fetchUser,

  // Timing
  staleTime: 1000 * 60 * 5,     // Data considered fresh for 5 min
  gcTime: 1000 * 60 * 30,       // Keep in cache for 30 min
  refetchInterval: 1000 * 60,   // Refetch every minute

  // Behavior
  enabled: !!userId,             // Only run if userId exists
  retry: 3,                      // Retry failed requests
  retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),

  // Refetching
  refetchOnMount: true,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,

  // Data transformation
  select: (data) => data.filter(user => user.active),

  // Placeholders
  placeholderData: previousData => previousData,
  initialData: () => getCachedData(),
});
```

## Dependent Queries

```tsx
// Query depends on another query's result
function UserPosts({ userId }) {
  const userQuery = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
  });

  const postsQuery = useQuery({
    queryKey: ['posts', userQuery.data?.id],
    queryFn: () => fetchPosts(userQuery.data.id),
    enabled: !!userQuery.data?.id, // Only runs after user is loaded
  });

  return /* ... */;
}
```

## Parallel Queries

```tsx
import { useQueries } from '@tanstack/react-query';

function Dashboard() {
  const results = useQueries({
    queries: [
      { queryKey: ['users'], queryFn: fetchUsers },
      { queryKey: ['posts'], queryFn: fetchPosts },
      { queryKey: ['comments'], queryFn: fetchComments },
    ],
  });

  const isLoading = results.some(result => result.isLoading);
  const [usersResult, postsResult, commentsResult] = results;

  return /* ... */;
}

// Dynamic parallel queries
function UsersList({ userIds }) {
  const userQueries = useQueries({
    queries: userIds.map(id => ({
      queryKey: ['user', id],
      queryFn: () => fetchUser(id),
    })),
  });
}
```

## Infinite Queries

```tsx
import { useInfiniteQuery } from '@tanstack/react-query';

function Posts() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['posts'],
    queryFn: ({ pageParam }) => fetchPosts({ page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.hasMore ? allPages.length + 1 : undefined;
    },
  });

  return (
    <>
      {data?.pages.map((page, i) => (
        <React.Fragment key={i}>
          {page.data.map(post => <Post key={post.id} {...post} />)}
        </React.Fragment>
      ))}
      <button
        onClick={() => fetchNextPage()}
        disabled={!hasNextPage || isFetchingNextPage}
      >
        {isFetchingNextPage ? 'Loading...' : hasNextPage ? 'Load More' : 'No more'}
      </button>
    </>
  );
}
```

## Query Invalidation

```tsx
import { useQueryClient } from '@tanstack/react-query';

function Component() {
  const queryClient = useQueryClient();

  // Invalidate specific query
  queryClient.invalidateQueries({ queryKey: ['todos'] });

  // Invalidate all queries starting with 'todos'
  queryClient.invalidateQueries({ queryKey: ['todos'], exact: false });

  // Invalidate and refetch
  queryClient.invalidateQueries({
    queryKey: ['todos'],
    refetchType: 'active', // 'active' | 'inactive' | 'all' | 'none'
  });

  // Reset query to initial state
  queryClient.resetQueries({ queryKey: ['todos'] });

  // Remove query from cache
  queryClient.removeQueries({ queryKey: ['todos'] });
}
```

**Official docs:** https://tanstack.com/query/latest/docs/react/guides/queries
