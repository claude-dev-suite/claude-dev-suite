---
name: swr
description: |
  SWR - React hooks for data fetching with caching. Lightweight alternative
  to TanStack Query for simple data fetching needs.

  USE WHEN: user mentions "swr", "stale-while-revalidate", "useSWR", asks about "simple data fetching", "real-time data", "automatic revalidation", "lightweight caching", "vercel data fetching"

  DO NOT USE FOR: Vue apps - use `pinia` or composables; complex cache management - use `tanstack-query`; client state - use `zustand`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# SWR Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `swr` for comprehensive documentation.

## Setup

```bash
npm install swr
```

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Complex cache invalidation needs | `tanstack-query` for advanced features |
| Vue 3 applications | Composables with `useFetch` or `useAsyncData` |
| Client-side UI state | `zustand` or React state |
| GraphQL queries | `@apollo/client` or `urql` |
| Need offline support | `tanstack-query` with persist plugin |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using SWR for client state | Wrong abstraction, unnecessary complexity | Use Zustand or React state |
| Not providing global fetcher | Repetitive code, inconsistent error handling | Configure global fetcher in `<SWRConfig>` |
| Mutating without revalidation | Stale data shown to users | Call `mutate()` after updates |
| Fetching on every render | Performance issues, too many requests | Use stable key, leverage cache |
| Not handling error states | Poor UX, broken UI | Always check `error` property |
| Using different keys for same data | Cache fragmentation, duplication | Standardize key format across app |
| No loading states | Bad perceived performance | Use `isLoading` or `isValidating` |
| Manual cache updates everywhere | Hard to maintain | Use `mutate()` with optimistic updates |
| Ignoring `isValidating` | Confusing UX during background refetch | Show subtle indicator when revalidating |
| Not using conditional fetching | Unnecessary requests | Pass `null` key when data not needed |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Data not updating | `revalidateOnFocus` disabled | Enable in SWRConfig or use `mutate()` |
| "Cannot read property of undefined" | No loading check before accessing data | Add `if (isLoading) return <Loading />` |
| Multiple requests for same key | No deduplication interval | Set `dedupingInterval` in config |
| Stale data after mutation | Not calling `mutate()` | Call `mutate(key)` or `mutate()` from hook |
| Memory leaks | SWR instance not cleaned up | Ensure proper component unmounting |
| TypeScript errors | No generic type | Use `useSWR<DataType>(key, fetcher)` |
| Infinite refetch loop | Key changes on every render | Use `useMemo` or stable key |
| 401 errors not handled | No global error handler | Configure error handler in `<SWRConfig>` |

## Core Patterns

### Basic Fetching
```typescript
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

function UserProfile({ userId }: { userId: string }) {
  const { data, error, isLoading } = useSWR(`/api/users/${userId}`, fetcher);

  if (error) return <div>Failed to load</div>;
  if (isLoading) return <div>Loading...</div>;
  return <div>Hello {data.name}!</div>;
}
```

### Global Configuration
```typescript
import { SWRConfig } from 'swr';

function App() {
  return (
    <SWRConfig
      value={{
        fetcher: (url) => fetch(url).then(res => res.json()),
        revalidateOnFocus: true,
        dedupingInterval: 2000,
      }}
    >
      <MyApp />
    </SWRConfig>
  );
}
```

### Mutation
```typescript
import useSWR, { mutate } from 'swr';

function UpdateUser() {
  const { data } = useSWR('/api/user', fetcher);

  async function handleUpdate() {
    await fetch('/api/user', {
      method: 'PUT',
      body: JSON.stringify({ name: 'New Name' })
    });

    // Revalidate the cache
    mutate('/api/user');
  }

  return <button onClick={handleUpdate}>Update</button>;
}
```

### Optimistic Updates
```typescript
const { data, mutate } = useSWR('/api/user', fetcher);

async function updateUser(newData: User) {
  // Optimistic update
  mutate({ ...data, ...newData }, false);

  // Send request
  await fetch('/api/user', {
    method: 'PUT',
    body: JSON.stringify(newData)
  });

  // Revalidate
  mutate();
}
```

### Conditional Fetching
```typescript
// Only fetch if userId exists
const { data } = useSWR(userId ? `/api/users/${userId}` : null, fetcher);
```

### Pagination
```typescript
function UserList() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSWR(`/api/users?page=${page}`, fetcher);

  return (
    <>
      {data?.users.map(user => <UserCard key={user.id} user={user} />)}
      <button onClick={() => setPage(p => p + 1)}>Next</button>
    </>
  );
}
```

## Production Readiness

### Global Configuration

```typescript
import { SWRConfig } from 'swr';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.');
    error.info = await res.json();
    error.status = res.status;
    throw error;
  }
  return res.json();
};

function App() {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        shouldRetryOnError: true,
        errorRetryCount: 3,
        dedupingInterval: 2000,
        focusThrottleInterval: 5000,
        onError: (error) => {
          console.error('SWR Error:', error);
          if (error.status === 401) {
            // Redirect to login
          }
        },
      }}
    >
      <MyApp />
    </SWRConfig>
  );
}
```

### Error Handling

```typescript
function UserProfile({ userId }: { userId: string }) {
  const { data, error, isLoading } = useSWR<User, ApiError>(
    `/api/users/${userId}`,
    fetcher
  );

  if (error) {
    if (error.status === 404) return <NotFound />;
    if (error.status >= 500) return <ServerError />;
    return <ErrorMessage error={error} />;
  }

  if (isLoading) return <Skeleton />;

  return <UserCard user={data} />;
}
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Cache hit ratio | > 80% |
| Average response time | < 200ms |
| Revalidation frequency | Appropriate for data freshness |
| Error rate | < 1% |

### Checklist

- [ ] Global fetcher configured in `<SWRConfig>`
- [ ] Error handling for all status codes
- [ ] Loading states for all data fetches
- [ ] Optimistic updates for mutations
- [ ] Conditional fetching where appropriate
- [ ] Stable cache keys (no render-time generation)
- [ ] TypeScript types for all data
- [ ] Retry logic configured
- [ ] Focus revalidation enabled
- [ ] Global error handler for auth failures

## Reference Documentation
- [Core API](https://swr.vercel.app/docs/api)
- [Global Configuration](https://swr.vercel.app/docs/global-configuration)
- [Mutation](https://swr.vercel.app/docs/mutation)
