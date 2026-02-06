# Next.js Data Fetching Patterns

> **Knowledge Base:** Read `knowledge/nextjs/data-fetching.md` for complete documentation.

## Server Components (Default)

```tsx
// app/users/page.tsx
async function UsersPage() {
  // Runs on server, no client bundle
  const users = await fetch('https://api.example.com/users', {
    cache: 'force-cache', // Default: cached
  }).then(res => res.json());

  return (
    <ul>
      {users.map(user => <li key={user.id}>{user.name}</li>)}
    </ul>
  );
}
```

## Caching Strategies

```tsx
// Cached (default) - static
fetch(url, { cache: 'force-cache' });

// Revalidate every 60 seconds
fetch(url, { next: { revalidate: 60 } });

// No cache - always fresh
fetch(url, { cache: 'no-store' });

// Page-level revalidation
export const revalidate = 60; // seconds
```

## Parallel Data Fetching

```tsx
async function Dashboard() {
  // Fetch in parallel, not waterfall
  const [users, posts, analytics] = await Promise.all([
    getUsers(),
    getPosts(),
    getAnalytics()
  ]);

  return <DashboardView users={users} posts={posts} analytics={analytics} />;
}
```

## Streaming with Suspense

```tsx
import { Suspense } from 'react';

export default function Page() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<Loading />}>
        <SlowComponent />
      </Suspense>
    </div>
  );
}
```

## Server Actions

```tsx
// app/actions.ts
'use server';

export async function createUser(formData: FormData) {
  const name = formData.get('name');
  await db.user.create({ data: { name } });
  revalidatePath('/users');
}

// app/users/page.tsx
import { createUser } from './actions';

export default function Page() {
  return (
    <form action={createUser}>
      <input name="name" />
      <button type="submit">Create</button>
    </form>
  );
}
```

## Client-Side with SWR/React Query

```tsx
'use client';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function UserProfile({ userId }: { userId: string }) {
  const { data, error, isLoading } = useSWR(
    `/api/users/${userId}`,
    fetcher
  );

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading user</div>;
  return <div>{data.name}</div>;
}
```

## generateStaticParams

```tsx
// app/blog/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await getPosts();
  return posts.map(post => ({ slug: post.slug }));
}

export default async function Page({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  return <Article post={post} />;
}
```

## Route Handlers (API)

```tsx
// app/api/users/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const users = await db.user.findMany();
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const body = await request.json();
  const user = await db.user.create({ data: body });
  return NextResponse.json(user, { status: 201 });
}
```

**Official docs:** https://nextjs.org/docs/app/building-your-application/data-fetching
