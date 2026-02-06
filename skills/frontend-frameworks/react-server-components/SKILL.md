---
name: react-server-components
description: |
  React Server Components (RSC) for server-side rendering without client JS.
  Covers Server vs Client components, data fetching patterns, Server Actions,
  streaming, caching, and Next.js App Router integration.

  USE WHEN: user mentions "Server Components", "RSC", "Next.js App Router", "use server",
  "Server Actions", "async components", asks about "server-side React", "zero bundle impact"

  DO NOT USE FOR: Client-only React apps (CRA, Vite), Next.js Pages Router,
  React < 18, Non-Next.js frameworks without RSC support
allowed-tools: Read, Grep, Glob, Write, Edit
---
# React Server Components

> **Full Reference**: See [advanced.md](advanced.md) for streaming patterns, caching strategies, advanced composition patterns, error handling, and parallel/sequential data fetching.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `react`, topic: `server-components` for comprehensive documentation.

## When NOT to Use This Skill

- Building client-only apps (CRA, Vite)
- Using Next.js Pages Router
- React version < 18
- Framework doesn't support RSC

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Server                                   │
├─────────────────────────────────────────────────────────────────┤
│  Server Components                                               │
│  • Run only on server                                           │
│  • Can access databases, filesystems, secrets                   │
│  • Zero bundle size impact                                      │
│  • No hooks (useState, useEffect)                               │
├─────────────────────────────────────────────────────────────────┤
│                         Client                                   │
├─────────────────────────────────────────────────────────────────┤
│  Client Components                                               │
│  • Run on client (and server for SSR)                           │
│  • Can use hooks, event handlers                                │
│  • Interactive                                                  │
│  • Add to JS bundle                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Server Components (Default in Next.js App Router)

```tsx
// app/users/page.tsx - Server Component by default
import { db } from '@/lib/db';

export default async function UsersPage() {
  // Direct database access - no API layer needed!
  const users = await db.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

### Accessing Server-Only Resources

```tsx
// app/dashboard/page.tsx
import { cookies, headers } from 'next/headers';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;

  const user = await verifyToken(token);
  if (!user) {
    redirect('/login');
  }

  const stats = await db.stats.findUnique({
    where: { userId: user.id },
  });

  return <Dashboard user={user} stats={stats} />;
}
```

---

## Client Components

Add `'use client'` directive for interactivity:

```tsx
// components/counter.tsx
'use client';

import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(c => c + 1)}>
      Count: {count}
    </button>
  );
}
```

---

## Composition: Server + Client

```tsx
// app/products/page.tsx (Server Component)
import { db } from '@/lib/db';
import { FilterSidebar } from '@/components/filter-sidebar';

export default async function ProductsPage({ searchParams }) {
  const products = await db.product.findMany({
    where: { category: searchParams.category },
  });

  const categories = await db.category.findMany();

  return (
    <div className="flex">
      {/* Client Component for interactivity */}
      <FilterSidebar categories={categories} />
      {/* Server-rendered products */}
      <ProductGrid products={products} />
    </div>
  );
}
```

---

## Server Actions

Mutate data from client with server functions:

```tsx
// app/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const CreatePostSchema = z.object({
  title: z.string().min(3).max(100),
  content: z.string().min(10),
});

export async function createPost(formData: FormData) {
  const validated = CreatePostSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
  });

  if (!validated.success) {
    return { error: validated.error.flatten().fieldErrors };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: { auth: ['Unauthorized'] } };
  }

  const post = await db.post.create({
    data: { ...validated.data, authorId: user.id },
  });

  revalidatePath('/posts');
  redirect(`/posts/${post.id}`);
}
```

### Using Server Actions

```tsx
// Option 1: In a form
export default function CreatePostPage() {
  return (
    <form action={createPost}>
      <input name="title" required />
      <textarea name="content" required />
      <button type="submit">Create Post</button>
    </form>
  );
}

// Option 2: With useActionState for loading/error states
'use client';

import { useActionState } from 'react';
import { createPost } from '@/app/actions';

export function CreatePostForm() {
  const [state, formAction, isPending] = useActionState(createPost, null);

  return (
    <form action={formAction}>
      <input name="title" required />
      {state?.error?.title && <p className="error">{state.error.title[0]}</p>}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Post'}
      </button>
    </form>
  );
}
```

---

## When to Use Server vs Client

| Server Components | Client Components |
|-------------------|-------------------|
| Data fetching | Event handlers (onClick, onChange) |
| Database access | useState, useEffect |
| Sensitive logic (secrets) | Browser APIs |
| Heavy dependencies | Interactivity |
| Static content | Real-time updates |

```tsx
// Decision tree:
// 1. Does it need interactivity? → Client
// 2. Does it use hooks? → Client
// 3. Does it need browser APIs? → Client
// 4. Everything else → Server (default)
```

---

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Making everything Client Component | Loses RSC benefits | Default to Server, client only when needed |
| Passing functions to Client Components | Not serializable | Use Server Actions |
| Fetching data in Client Components | Slower, larger bundle | Fetch in Server Components |
| Not using Suspense | Sequential loading | Add Suspense boundaries |
| Exposing secrets in Client | Security risk | Keep in Server Components |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| "use client" not working | Wrong file location | Add to top of file |
| Cannot pass function as prop | Functions not serializable | Use Server Action |
| Hooks error in Server Component | Using client hooks | Add "use client" directive |
| Data not updating | Cache not revalidated | Use `revalidatePath` or `revalidateTag` |
| Slow data fetching | Sequential fetches | Use parallel Promise.all |

## Best Practices

- ✅ Default to Server Components
- ✅ Use `'use client'` only when needed
- ✅ Keep Client Components small and focused
- ✅ Pass Server Components as children to Client
- ✅ Use Suspense for streaming
- ✅ Use Server Actions for mutations
- ❌ Don't fetch data in Client Components if avoidable
- ❌ Don't pass functions as props to Client Components

## Reference Documentation

- [Server Components](https://react.dev/reference/rsc/server-components)
- [Next.js App Router](https://nextjs.org/docs/app)
