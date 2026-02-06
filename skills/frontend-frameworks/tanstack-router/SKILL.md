---
name: tanstack-router
description: |
  TanStack Router for React with file-based routing. Covers route definitions,
  layouts, authentication guards, loaders, and type-safe navigation.

  USE WHEN: user mentions "TanStack Router", "file-based routing", "type-safe routing",
  "route loaders", "beforeLoad", asks about "TanStack Router patterns", "typed navigation"

  DO NOT USE FOR: React Router v6 - use React Router docs,
  Next.js App Router - use `react-server-components`, Vue Router, Angular Router
allowed-tools: Read, Grep, Glob, Write, Edit
---
# TanStack Router Patterns

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `tanstack-router` for comprehensive documentation.

## When NOT to Use This Skill

Skip this skill when:
- Using React Router v6 (different API)
- Building Next.js apps with App Router (use RSC patterns)
- Working with Vue Router (use Vue-specific routing)
- Using Angular Router (use Angular routing)
- Client-side routing not needed (static sites)

## File-Based Route Structure

```
src/routes/
├── __root.tsx           # Root layout
├── _authenticated.tsx   # Auth guard layout
├── _authenticated/
│   ├── dashboard.tsx    # /dashboard
│   └── users/
│       ├── index.tsx    # /users
│       └── $userId.tsx  # /users/:userId
├── login.tsx            # /login
└── register.tsx         # /register
```

## Root Route

```tsx
// routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from '@/lib/query-client';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
```

## Auth Guard Layout

```tsx
// routes/_authenticated.tsx
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/authStore';
import { MainLayout } from '@/layouts/MainLayout';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ location }) => {
    const isAuthenticated = useAuthStore.getState().isAuthenticated;
    if (!isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <MainLayout>
      <Outlet />
    </MainLayout>
  );
}
```

## Protected Route with Loader

```tsx
// routes/_authenticated/users/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import { usersApi } from '@/api/users.api';
import { UserList } from '@/features/users/components/UserList';

export const Route = createFileRoute('/_authenticated/users/')({
  loader: async () => {
    return usersApi.getAll();
  },
  component: UsersPage,
});

function UsersPage() {
  const users = Route.useLoaderData();
  return <UserList users={users} />;
}
```

## Dynamic Route with Params

```tsx
// routes/_authenticated/users/$userId.tsx
import { createFileRoute, notFound } from '@tanstack/react-router';
import { usersApi } from '@/api/users.api';
import { UserDetail } from '@/features/users/components/UserDetail';

export const Route = createFileRoute('/_authenticated/users/$userId')({
  loader: async ({ params }) => {
    const user = await usersApi.getById(params.userId);
    if (!user) throw notFound();
    return user;
  },
  component: UserDetailPage,
  notFoundComponent: () => <div>User not found</div>,
});

function UserDetailPage() {
  const user = Route.useLoaderData();
  return <UserDetail user={user} />;
}
```

## Navigation

```tsx
import { Link, useNavigate, useRouter } from '@tanstack/react-router';

// Declarative navigation
<Link to="/users/$userId" params={{ userId: '123' }}>
  View User
</Link>

// Programmatic navigation
const navigate = useNavigate();
navigate({ to: '/dashboard' });
navigate({ to: '/users/$userId', params: { userId: '123' } });

// With search params
navigate({
  to: '/users',
  search: { page: 1, sort: 'name' },
});

// Go back
const router = useRouter();
router.history.back();
```

## Search Params with Validation

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const searchSchema = z.object({
  page: z.number().default(1),
  search: z.string().optional(),
  sort: z.enum(['name', 'email', 'createdAt']).default('createdAt'),
});

export const Route = createFileRoute('/_authenticated/users/')({
  validateSearch: searchSchema,
  component: UsersPage,
});

function UsersPage() {
  const { page, search, sort } = Route.useSearch();
  // Type-safe search params
}
```

## Router Configuration

```tsx
// router.ts
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
```

## Key Concepts

| Concept | Description |
|---------|-------------|
| `__root.tsx` | Global layout, providers |
| `_layout.tsx` | Route group layout |
| `$param.tsx` | Dynamic route segment |
| `index.tsx` | Index route |
| `beforeLoad` | Pre-navigation guard |
| `loader` | Data fetching |
| `notFound` | 404 handling |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Fetching in components | Not type-safe, duplicate requests | Use route loaders |
| Not using search param validation | Runtime errors | Use Zod schema validation |
| Hardcoded navigation paths | Type-unsafe, breaks on refactor | Use typed `Link` and `navigate` |
| Mixing React Router patterns | Different API | Use TanStack Router idioms |
| Not using `beforeLoad` for auth | Auth check in component | Use `beforeLoad` hook |
| Large route files | Hard to maintain | Split into feature modules |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Type error on navigation | Wrong route path | Use autocomplete from `to` prop |
| Loader not running | Missing loader in route | Add loader to route definition |
| Redirect not working | Wrong redirect syntax | Use `throw redirect({ to: '...' })` |
| Search params not updating | Not using `useSearch` | Use `Route.useSearch()` |
| Route not found | File naming wrong | Check file-based routing convention |
| Auth guard not firing | Not in `beforeLoad` | Move auth check to `beforeLoad` |

## Reference Documentation

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `tanstack-router` for comprehensive documentation.

- [File-based Routing](quick-ref/routing.md)
- [Auth Guards](quick-ref/guards.md)
