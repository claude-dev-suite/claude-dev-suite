---
name: react-api
description: |
  React patterns for API consumption. Covers custom hooks, Suspense, SWR,
  error boundaries, and real-time updates.

  USE WHEN: user mentions "data fetching in React", "useFetch", "SWR", "fetch hook",
  "API integration", "REST API", asks about "React data loading", "custom fetch hooks"

  DO NOT USE FOR: TanStack Query specific features - use `state-tanstack-query`,
  GraphQL - use GraphQL-specific libraries, Non-React frameworks
allowed-tools: Read, Grep, Glob, Write, Edit
---

# React API Patterns Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `react` for comprehensive documentation.

## When NOT to Use This Skill

Skip this skill when:
- Using TanStack Query exclusively (use `state-tanstack-query`)
- Working with GraphQL (use Apollo Client or urql)
- Building non-React applications
- Server Components handle data fetching (Next.js App Router)
- Need advanced caching beyond SWR (use `state-tanstack-query`)

## Custom useFetch Hook

```typescript
import { useState, useEffect, useCallback } from 'react';

interface UseFetchState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

interface UseFetchOptions {
  immediate?: boolean;
}

export function useFetch<T>(
  url: string,
  options?: RequestInit & UseFetchOptions
) {
  const [state, setState] = useState<UseFetchState<T>>({
    data: null,
    loading: options?.immediate !== false,
    error: null,
  });

  const execute = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error as Error,
      }));
      throw error;
    }
  }, [url, options]);

  useEffect(() => {
    if (options?.immediate !== false) {
      execute();
    }
  }, [execute, options?.immediate]);

  return { ...state, refetch: execute };
}

// Usage
function UserProfile({ id }: { id: string }) {
  const { data: user, loading, error, refetch } = useFetch<User>(
    `/api/users/${id}`
  );

  if (loading) return <Spinner />;
  if (error) return <Error message={error.message} onRetry={refetch} />;
  return <div>{user?.name}</div>;
}
```

---

## SWR (Stale-While-Revalidate)

```bash
npm install swr
```

### Basic Usage

```typescript
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

function UserProfile({ id }: { id: string }) {
  const { data, error, isLoading, mutate } = useSWR<User>(
    `/api/users/${id}`,
    fetcher
  );

  if (isLoading) return <Spinner />;
  if (error) return <Error />;
  return <div>{data?.name}</div>;
}
```

### Global Configuration

```typescript
import { SWRConfig } from 'swr';

const fetcher = async (url: string) => {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('API Error');
  return res.json();
};

function App() {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        dedupingInterval: 2000,
        errorRetryCount: 3,
        onError: (error) => console.error(error),
      }}
    >
      <MyApp />
    </SWRConfig>
  );
}
```

### Mutations with useSWRMutation

```typescript
import useSWRMutation from 'swr/mutation';

async function createUser(url: string, { arg }: { arg: CreateUserDto }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(arg),
  });
  return res.json();
}

function CreateUserForm() {
  const { trigger, isMutating } = useSWRMutation('/api/users', createUser);

  const handleSubmit = async (data: CreateUserDto) => {
    try {
      await trigger(data);
      // Success
    } catch (error) {
      // Error
    }
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

### Optimistic Updates

```typescript
function UserList() {
  const { data, mutate } = useSWR<User[]>('/api/users', fetcher);

  const deleteUser = async (id: string) => {
    // Optimistic update
    const optimisticData = data?.filter(u => u.id !== id);
    mutate(optimisticData, { revalidate: false });

    try {
      await fetch(`/api/users/${id}`, { method: 'DELETE' });
      mutate(); // Revalidate after success
    } catch {
      mutate(data); // Rollback on error
    }
  };

  return (
    <ul>
      {data?.map(user => (
        <li key={user.id}>
          {user.name}
          <button onClick={() => deleteUser(user.id)}>Delete</button>
        </li>
      ))}
    </ul>
  );
}
```

---

## React Suspense with use()

```typescript
// React 18+ with use() hook
import { use, Suspense } from 'react';

// Create promise outside component
const userPromise = fetch('/api/users/1').then(res => res.json());

function UserProfile() {
  const user = use(userPromise);
  return <div>{user.name}</div>;
}

function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <UserProfile />
    </Suspense>
  );
}
```

### Suspense with SWR

```typescript
import useSWR from 'swr';

function UserProfile({ id }: { id: string }) {
  const { data } = useSWR<User>(`/api/users/${id}`, fetcher, {
    suspense: true,
  });

  // data is guaranteed to exist (no loading state)
  return <div>{data.name}</div>;
}

function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <UserProfile id="1" />
    </Suspense>
  );
}
```

---

## Error Boundaries

```typescript
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ApiErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div>
          <h2>Something went wrong</h2>
          <button onClick={this.reset}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Usage
function App() {
  return (
    <ApiErrorBoundary
      fallback={<ErrorFallback />}
      onError={(error) => logError(error)}
    >
      <Suspense fallback={<Spinner />}>
        <UserProfile />
      </Suspense>
    </ApiErrorBoundary>
  );
}
```

---

## Real-Time Updates

### Server-Sent Events (SSE)

```typescript
function useSSE<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      setData(JSON.parse(event.data));
    };

    eventSource.onerror = () => {
      setError(new Error('SSE connection failed'));
      eventSource.close();
    };

    return () => eventSource.close();
  }, [url]);

  return { data, error };
}

// Usage
function Notifications() {
  const { data: notification } = useSSE<Notification>('/api/notifications');
  return notification ? <Toast message={notification.message} /> : null;
}
```

### WebSocket Hook

```typescript
function useWebSocket<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onmessage = (event) => setData(JSON.parse(event.data));

    return () => ws.close();
  }, [url]);

  const send = useCallback((message: unknown) => {
    wsRef.current?.send(JSON.stringify(message));
  }, []);

  return { data, isConnected, send };
}

// Usage
function Chat() {
  const { data: message, send, isConnected } = useWebSocket<Message>(
    'wss://api.example.com/chat'
  );

  const handleSend = (text: string) => {
    send({ type: 'message', text });
  };

  return (
    <div>
      {isConnected ? 'Connected' : 'Connecting...'}
      {message && <Message data={message} />}
    </div>
  );
}
```

---

## Loading States

### Skeleton Loading

```typescript
function UserCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-12 w-12 bg-gray-200 rounded-full" />
      <div className="h-4 w-32 bg-gray-200 mt-2 rounded" />
      <div className="h-3 w-24 bg-gray-200 mt-1 rounded" />
    </div>
  );
}

function UserCard({ id }: { id: string }) {
  const { data, isLoading } = useSWR<User>(`/api/users/${id}`, fetcher);

  if (isLoading) return <UserCardSkeleton />;
  return (
    <div>
      <img src={data?.avatar} />
      <h3>{data?.name}</h3>
      <p>{data?.email}</p>
    </div>
  );
}
```

---

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Fetching in useEffect without cleanup | Race conditions | Use AbortController |
| Not handling loading/error states | Poor UX | Always show loading/error UI |
| Fetching in render | Infinite loops | Use useEffect or Suspense |
| No request deduplication | Duplicate requests | Use SWR or TanStack Query |
| Hardcoded API URLs | Hard to maintain | Use environment variables |
| Not retrying failed requests | Poor resilience | Add retry logic |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Infinite fetch loop | Fetching in render | Move to useEffect |
| Stale data shown | No revalidation | Configure SWR revalidation |
| Race condition | Multiple rapid requests | Use AbortController |
| Memory leak warning | Updating unmounted component | Check mounted state or cleanup |
| Duplicate requests | No deduplication | Use SWR or caching layer |
| CORS error | Backend not configured | Configure CORS headers |

## Production Readiness

### Checklist

- [ ] Global fetcher with auth headers
- [ ] Error boundary for API errors
- [ ] Loading skeletons for better UX
- [ ] Optimistic updates for mutations
- [ ] Request deduplication
- [ ] Automatic retry on failure
- [ ] Revalidation strategy defined
- [ ] Real-time updates where needed
- [ ] Proper cleanup on unmount

## Reference Documentation

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `react` for comprehensive documentation.

- [Custom Hooks](quick-ref/custom-hooks.md)
- [Suspense](quick-ref/suspense.md)
- [Error Boundaries](quick-ref/error-boundaries.md)
- [SWR](quick-ref/swr.md)
- [Real-Time](quick-ref/realtime.md)
