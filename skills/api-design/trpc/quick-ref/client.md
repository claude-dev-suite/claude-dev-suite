# tRPC Client Quick Reference

> **Knowledge Base:** Read `knowledge/trpc/client.md` for complete documentation.

## React Query Integration

```typescript
// utils/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server/routers';

export const trpc = createTRPCReact<AppRouter>();
```

## Provider Setup

```tsx
// app/providers.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import { trpc } from '@/utils/trpc';

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  return process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          headers() {
            return {
              // Add auth header
            };
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

## Using Queries

```tsx
import { trpc } from '@/utils/trpc';

function UserList() {
  // Basic query
  const { data, isLoading, error } = trpc.user.list.useQuery();

  // Query with input
  const { data: user } = trpc.user.byId.useQuery({ id: '123' });

  // Query options
  const { data: posts } = trpc.post.list.useQuery(undefined, {
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {data?.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

## Using Mutations

```tsx
import { trpc } from '@/utils/trpc';

function CreateUserForm() {
  const utils = trpc.useUtils();

  const createUser = trpc.user.create.useMutation({
    onSuccess: () => {
      // Invalidate and refetch
      utils.user.list.invalidate();
    },
    onError: (error) => {
      console.error('Error:', error.message);
    },
  });

  const handleSubmit = (data: { name: string; email: string }) => {
    createUser.mutate(data);
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <button type="submit" disabled={createUser.isPending}>
        {createUser.isPending ? 'Creating...' : 'Create'}
      </button>
      {createUser.error && (
        <p className="error">{createUser.error.message}</p>
      )}
    </form>
  );
}
```

## Optimistic Updates

```tsx
function TodoItem({ todo }: { todo: Todo }) {
  const utils = trpc.useUtils();

  const toggleTodo = trpc.todo.toggle.useMutation({
    onMutate: async ({ id }) => {
      // Cancel outgoing refetches
      await utils.todo.list.cancel();

      // Snapshot previous value
      const previousTodos = utils.todo.list.getData();

      // Optimistically update
      utils.todo.list.setData(undefined, old =>
        old?.map(t => t.id === id ? { ...t, completed: !t.completed } : t)
      );

      return { previousTodos };
    },
    onError: (err, newTodo, context) => {
      // Rollback on error
      utils.todo.list.setData(undefined, context?.previousTodos);
    },
    onSettled: () => {
      // Sync with server
      utils.todo.list.invalidate();
    },
  });

  return (
    <div onClick={() => toggleTodo.mutate({ id: todo.id })}>
      {todo.completed ? '✓' : '○'} {todo.title}
    </div>
  );
}
```

## Infinite Queries

```tsx
function PostFeed() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.post.infinite.useInfiniteQuery(
    { limit: 10 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  return (
    <>
      {data?.pages.map((page) =>
        page.posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))
      )}

      <button
        onClick={() => fetchNextPage()}
        disabled={!hasNextPage || isFetchingNextPage}
      >
        {isFetchingNextPage
          ? 'Loading...'
          : hasNextPage
          ? 'Load More'
          : 'No more posts'}
      </button>
    </>
  );
}

// Server-side router
export const postRouter = router({
  infinite: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(10),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const posts = await ctx.prisma.post.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: 'desc' },
      });

      let nextCursor: string | undefined = undefined;
      if (posts.length > input.limit) {
        const nextItem = posts.pop();
        nextCursor = nextItem?.id;
      }

      return { posts, nextCursor };
    }),
});
```

## Server-Side Rendering

```tsx
// Next.js App Router
import { createServerSideHelpers } from '@trpc/react-query/server';
import { appRouter } from '@/server/routers';
import { createContext } from '@/server/context';

export default async function Page() {
  const helpers = createServerSideHelpers({
    router: appRouter,
    ctx: await createContext(),
  });

  // Prefetch data
  await helpers.user.list.prefetch();

  return (
    <HydrateClient>
      <UserList />
    </HydrateClient>
  );
}
```

## Vanilla Client (No React)

```typescript
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server/routers';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/api/trpc',
    }),
  ],
});

// Usage
const users = await client.user.list.query();
const user = await client.user.byId.query({ id: '123' });
const newUser = await client.user.create.mutate({ name: 'John', email: 'john@example.com' });
```

**Official docs:** https://trpc.io/docs/client/react
