# SWR Quick Reference

> See [React API SKILL](../SKILL.md) for core knowledge

## Installation

```bash
npm install swr
```

## Basic Usage

```typescript
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

function Profile() {
  const { data, error, isLoading } = useSWR('/api/user', fetcher);

  if (isLoading) return <Spinner />;
  if (error) return <Error />;
  return <div>{data.name}</div>;
}
```

## Global Configuration

```typescript
import { SWRConfig } from 'swr';

function App() {
  return (
    <SWRConfig
      value={{
        fetcher: (url) => fetch(url).then(res => res.json()),
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        dedupingInterval: 2000,
        errorRetryCount: 3,
      }}
    >
      <MyApp />
    </SWRConfig>
  );
}
```

## Options

```typescript
const { data, error, isLoading, isValidating, mutate } = useSWR(key, fetcher, {
  revalidateOnFocus: true,     // Revalidate on window focus
  revalidateOnReconnect: true, // Revalidate on network reconnect
  refreshInterval: 0,          // Polling interval (0 = disabled)
  refreshWhenHidden: false,    // Refresh when tab hidden
  refreshWhenOffline: false,   // Refresh when offline
  dedupingInterval: 2000,      // Dedup requests within interval
  errorRetryCount: 3,          // Retry on error
  suspense: false,             // Enable Suspense mode
  fallbackData: undefined,     // Initial data
  keepPreviousData: false,     // Keep previous data on key change
});
```

## Conditional Fetching

```typescript
// Only fetch when id exists
const { data } = useSWR(id ? `/api/users/${id}` : null, fetcher);

// With function
const { data } = useSWR(() => user ? `/api/users/${user.id}` : null, fetcher);
```

## Mutations

```typescript
import useSWRMutation from 'swr/mutation';

async function createUser(url: string, { arg }: { arg: CreateUserDto }) {
  return fetch(url, {
    method: 'POST',
    body: JSON.stringify(arg),
  }).then(res => res.json());
}

function CreateUser() {
  const { trigger, isMutating, error } = useSWRMutation('/api/users', createUser);

  const handleSubmit = async (data: CreateUserDto) => {
    await trigger(data);
  };

  return (
    <button onClick={() => handleSubmit({ name: 'John' })} disabled={isMutating}>
      {isMutating ? 'Creating...' : 'Create'}
    </button>
  );
}
```

## Optimistic Updates

```typescript
function TodoList() {
  const { data, mutate } = useSWR('/api/todos', fetcher);

  const addTodo = async (text: string) => {
    const newTodo = { id: Date.now(), text, completed: false };

    // Optimistic update
    mutate([...data, newTodo], { revalidate: false });

    try {
      await fetch('/api/todos', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      mutate(); // Revalidate
    } catch {
      mutate(data); // Rollback
    }
  };
}
```

## Pagination

```typescript
function UserList() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSWR(`/api/users?page=${page}`, fetcher);

  return (
    <div>
      {data?.users.map(user => <UserCard key={user.id} user={user} />)}
      <button onClick={() => setPage(p => p - 1)} disabled={page === 1}>
        Previous
      </button>
      <button onClick={() => setPage(p => p + 1)}>
        Next
      </button>
    </div>
  );
}
```

## Infinite Loading

```typescript
import useSWRInfinite from 'swr/infinite';

function InfiniteList() {
  const getKey = (pageIndex: number, previousPageData: User[]) => {
    if (previousPageData && !previousPageData.length) return null;
    return `/api/users?page=${pageIndex + 1}`;
  };

  const { data, size, setSize, isLoading } = useSWRInfinite(getKey, fetcher);

  const users = data ? data.flat() : [];
  const hasMore = data && data[data.length - 1]?.length > 0;

  return (
    <div>
      {users.map(user => <UserCard key={user.id} user={user} />)}
      <button onClick={() => setSize(size + 1)} disabled={!hasMore}>
        Load More
      </button>
    </div>
  );
}
```

## Prefetching

```typescript
import { preload } from 'swr';

// Preload on hover
function UserLink({ id }: { id: string }) {
  return (
    <Link
      href={`/users/${id}`}
      onMouseEnter={() => preload(`/api/users/${id}`, fetcher)}
    >
      View User
    </Link>
  );
}
```

## Global Mutate

```typescript
import { mutate } from 'swr';

// Revalidate all keys starting with /api/users
mutate((key) => typeof key === 'string' && key.startsWith('/api/users'));

// Update specific key
mutate('/api/users/123', newData);
```

## Suspense Mode

```typescript
function UserProfile() {
  const { data } = useSWR('/api/user', fetcher, { suspense: true });
  // data is guaranteed to exist
  return <div>{data.name}</div>;
}

function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <UserProfile />
    </Suspense>
  );
}
```
