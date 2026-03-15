# SvelteKit Load Functions

> **Knowledge Base:** Read `knowledge/sveltekit/loading.md` for complete documentation.

## Universal Load (+page.ts)

```ts
// routes/users/[id]/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch }) => {
  const response = await fetch(`/api/users/${params.id}`);
  const user = await response.json();

  return { user };
};
```

## Server Load (+page.server.ts)

```ts
// routes/users/[id]/+page.server.ts
import type { PageServerLoad } from './$types';
import { db } from '$lib/db';

export const load: PageServerLoad = async ({ params }) => {
  // Direct DB access - only runs on server
  const user = await db.user.findUnique({
    where: { id: params.id }
  });

  if (!user) {
    throw error(404, 'User not found');
  }

  return { user };
};
```

## Layout Load

```ts
// routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    user: locals.user // Available in all child routes
  };
};
```

## Load Function Parameters

```ts
export const load = async ({
  params,     // Route params
  url,        // URL object
  route,      // Route info
  fetch,      // Enhanced fetch
  setHeaders, // Set response headers
  parent,     // Parent load data
  depends,    // Dependency tracking
  cookies,    // Cookie access (server only)
  locals,     // Request-local data (server only)
  platform,   // Platform-specific context
}) => {
  // ...
};
```

## Parallel Loading

```ts
// routes/dashboard/+page.ts
export const load: PageLoad = async ({ fetch }) => {
  // Runs in parallel!
  const [users, posts, stats] = await Promise.all([
    fetch('/api/users').then(r => r.json()),
    fetch('/api/posts').then(r => r.json()),
    fetch('/api/stats').then(r => r.json())
  ]);

  return { users, posts, stats };
};
```

## Using Parent Data

```ts
// routes/users/[id]/posts/+page.ts
export const load: PageLoad = async ({ parent, params }) => {
  const { user } = await parent(); // From /users/[id]/+page.ts

  const posts = await fetch(`/api/users/${user.id}/posts`);
  return { posts: await posts.json() };
};
```

## Invalidation & Dependencies

```ts
// +page.ts
export const load: PageLoad = async ({ depends, fetch }) => {
  depends('app:users'); // Custom dependency

  return { users: await fetch('/api/users').then(r => r.json()) };
};

// In component
import { invalidate, invalidateAll } from '$app/navigation';

// Rerun loads depending on 'app:users'
await invalidate('app:users');

// Rerun all load functions
await invalidateAll();
```

## Error Handling

```ts
import { error, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) {
    throw redirect(303, '/login');
  }

  const item = await db.item.findUnique({ where: { id: params.id } });

  if (!item) {
    throw error(404, { message: 'Item not found' });
  }

  return { item };
};
```

## Form Actions

```ts
// +page.server.ts
import type { Actions } from './$types';

export const actions: Actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    // Process form
    return { success: true };
  },

  delete: async ({ params }) => {
    await db.item.delete({ where: { id: params.id } });
    throw redirect(303, '/items');
  }
};
```

**Official docs:** https://kit.svelte.dev/docs/load
