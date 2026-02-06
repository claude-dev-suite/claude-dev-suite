---
name: react-suspense
description: |
  React Suspense for data fetching, code splitting, and async operations.
  Covers Suspense boundaries, lazy loading, streaming SSR, Error Boundaries,
  suspense-enabled data libraries, and progressive loading patterns.

  USE WHEN: user mentions "Suspense", "lazy loading", "React.lazy", "code splitting",
  "streaming SSR", "loading states", asks about "async components", "fallback UI"

  DO NOT USE FOR: React 17 and earlier (limited Suspense support),
  Class components, Non-React frameworks
allowed-tools: Read, Grep, Glob, Write, Edit
---
# React Suspense

> **Full Reference**: See [advanced.md](advanced.md) for Streaming SSR, SuspenseList, Custom Suspense-Enabled Hooks, Image Loading, Route-Based Code Splitting, and Testing patterns.

## When NOT to Use This Skill

- Using React 17 or earlier (limited support)
- Working with class components
- Building non-React applications
- All data is static (no async operations)

## Core Concept

Suspense lets you declaratively specify loading states while waiting for async operations:

```tsx
import { Suspense } from 'react';

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <AsyncComponent />
    </Suspense>
  );
}
```

---

## Code Splitting with React.lazy

```tsx
import { lazy, Suspense } from 'react';

const Dashboard = lazy(() => import('./Dashboard'));
const Settings = lazy(() => import('./Settings'));

function App() {
  const [view, setView] = useState('dashboard');

  return (
    <div>
      <nav>
        <button onClick={() => setView('dashboard')}>Dashboard</button>
        <button onClick={() => setView('settings')}>Settings</button>
      </nav>

      <Suspense fallback={<PageSkeleton />}>
        {view === 'dashboard' && <Dashboard />}
        {view === 'settings' && <Settings />}
      </Suspense>
    </div>
  );
}
```

### Preloading Components

```tsx
const Dashboard = lazy(() => import('./Dashboard'));

const preloadDashboard = () => import('./Dashboard');

function NavLink() {
  return (
    <Link
      to="/dashboard"
      onMouseEnter={preloadDashboard}
      onFocus={preloadDashboard}
    >
      Dashboard
    </Link>
  );
}
```

---

## Data Fetching with Suspense

### Using TanStack Query

```tsx
import { useSuspenseQuery } from '@tanstack/react-query';

function UserProfile({ userId }: { userId: string }) {
  const { data: user } = useSuspenseQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
  });

  return <h1>{user.name}</h1>;
}

function UserPage({ userId }: { userId: string }) {
  return (
    <Suspense fallback={<UserSkeleton />}>
      <UserProfile userId={userId} />
    </Suspense>
  );
}
```

### Using React 19 use() Hook

```tsx
import { use, Suspense } from 'react';

function UserProfile({ userPromise }: { userPromise: Promise<User> }) {
  const user = use(userPromise);
  return <h1>{user.name}</h1>;
}

function UserPage({ userId }: { userId: string }) {
  const [userPromise] = useState(() => fetchUser(userId));

  return (
    <Suspense fallback={<UserSkeleton />}>
      <UserProfile userPromise={userPromise} />
    </Suspense>
  );
}
```

---

## Nested Suspense Boundaries

```tsx
function Dashboard() {
  return (
    <div className="dashboard">
      <Suspense fallback={<HeaderSkeleton />}>
        <Header />
      </Suspense>

      <main>
        <Suspense fallback={<StatsSkeleton />}>
          <Stats />
        </Suspense>

        <Suspense fallback={<ChartsSkeleton />}>
          <Charts />
        </Suspense>

        <Suspense fallback={<TableSkeleton />}>
          <DataTable />
        </Suspense>
      </main>
    </div>
  );
}
```

---

## Error Boundaries with Suspense

```tsx
import { ErrorBoundary, FallbackProps } from 'react-error-boundary';

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div>
      <h2>Something went wrong</h2>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}

// Reusable wrapper
function AsyncBoundary({
  children,
  fallback,
  errorFallback,
}: {
  children: React.ReactNode;
  fallback: React.ReactNode;
  errorFallback: React.ComponentType<FallbackProps>;
}) {
  return (
    <ErrorBoundary FallbackComponent={errorFallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ErrorBoundary>
  );
}

// Usage
<AsyncBoundary
  fallback={<LoadingSpinner />}
  errorFallback={ErrorFallback}
>
  <AsyncComponent />
</AsyncBoundary>
```

---

## Progressive Loading

```tsx
function ArticlePage({ articleId }: { articleId: string }) {
  return (
    <article>
      {/* Critical content loads first */}
      <Suspense fallback={<TitleSkeleton />}>
        <ArticleTitle articleId={articleId} />
      </Suspense>

      {/* Content loads next */}
      <Suspense fallback={<ContentSkeleton />}>
        <ArticleContent articleId={articleId} />
      </Suspense>

      {/* Less critical - loads last */}
      <Suspense fallback={<CommentsSkeleton />}>
        <Comments articleId={articleId} />
      </Suspense>
    </article>
  );
}
```

### With Transition for Updates

```tsx
import { useState, useTransition, Suspense } from 'react';

function TabContainer() {
  const [tab, setTab] = useState('about');
  const [isPending, startTransition] = useTransition();

  function selectTab(nextTab: string) {
    startTransition(() => setTab(nextTab));
  }

  return (
    <>
      <TabButtons selectedTab={tab} onSelect={selectTab} />

      <div className={isPending ? 'opacity-50' : ''}>
        <Suspense fallback={<TabSkeleton />}>
          {tab === 'about' && <About />}
          {tab === 'posts' && <Posts />}
        </Suspense>
      </div>
    </>
  );
}
```

---

## Skeleton Loading Patterns

```tsx
function UserCardSkeleton() {
  return (
    <div className="user-card">
      <div className="skeleton skeleton-avatar" />
      <div className="skeleton skeleton-text" style={{ width: '60%' }} />
      <div className="skeleton skeleton-text" style={{ width: '40%' }} />
    </div>
  );
}

// CSS
const skeletonStyles = `
.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
  border-radius: 4px;
}

@keyframes skeleton-loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`;
```

---

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Creating promises in render | New promise every render | Create outside component |
| Too many Suspense boundaries | Over-fragmented loading | Group related content |
| Too few boundaries | Entire app suspends | Add boundaries per section |
| No ErrorBoundary | Errors crash app | Wrap Suspense in ErrorBoundary |
| Generic loading spinners | Poor UX | Use skeleton loaders |

## Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| Infinite suspending | Move promise creation outside component |
| Flash of loading state | Add delay before showing fallback |
| Waterfall loading | Fetch data in parallel |
| Lost scroll position | Use skeletons with same dimensions |
| Error not caught | Add ErrorBoundary wrapper |

## Best Practices

- ✅ Place Suspense at meaningful UI boundaries
- ✅ Use skeleton loaders matching content dimensions
- ✅ Combine with ErrorBoundary for complete error handling
- ✅ Use transitions for non-urgent updates
- ✅ Preload components on user intent (hover, focus)
- ❌ Don't create Promises inside components
- ❌ Don't use too many granular boundaries

## Reference Documentation

- [React Suspense](https://react.dev/reference/react/Suspense)
- [Lazy Loading](https://react.dev/reference/react/lazy)
