# SvelteKit Route Structure

> **Knowledge Base:** Read `knowledge/sveltekit/routing.md` for complete documentation.

## File-Based Routing

```
src/routes/
├── +page.svelte         # / (home)
├── +layout.svelte       # Root layout
├── +error.svelte        # Error page
│
├── about/
│   └── +page.svelte     # /about
│
├── blog/
│   ├── +page.svelte     # /blog
│   ├── +layout.svelte   # Blog layout
│   └── [slug]/
│       └── +page.svelte # /blog/:slug
│
├── users/
│   ├── +page.svelte     # /users
│   └── [id]/
│       ├── +page.svelte # /users/:id
│       └── +page.ts     # Load function
│
├── (marketing)/         # Route group (no URL impact)
│   ├── pricing/
│   └── features/
│
├── [[optional]]/        # Optional param
│   └── +page.svelte
│
└── api/
    └── users/
        └── +server.ts   # API endpoint
```

## Route Files

| File | Purpose |
|------|---------|
| `+page.svelte` | Page component |
| `+page.ts` | Page load function (universal) |
| `+page.server.ts` | Server-only load function |
| `+layout.svelte` | Layout component |
| `+layout.ts` | Layout load function |
| `+layout.server.ts` | Server-only layout load |
| `+error.svelte` | Error boundary |
| `+server.ts` | API endpoint |

## Dynamic Routes

```
[id]          # Required param: /users/123
[...rest]     # Rest param: /files/a/b/c
[[optional]]  # Optional param: / or /en
```

## Page Component

```svelte
<!-- routes/users/[id]/+page.svelte -->
<script lang="ts">
  import type { PageData } from './$types';

  export let data: PageData;
</script>

<h1>{data.user.name}</h1>
```

## Layouts

```svelte
<!-- routes/+layout.svelte -->
<script lang="ts">
  import type { LayoutData } from './$types';
  export let data: LayoutData;
</script>

<header>
  <nav>{data.user ? `Hi ${data.user.name}` : 'Guest'}</nav>
</header>

<slot />

<footer>Footer</footer>
```

## Route Groups

```
src/routes/
├── (app)/              # Grouped routes
│   ├── +layout.svelte  # Shared layout for app
│   ├── dashboard/
│   └── settings/
│
├── (auth)/             # Different layout
│   ├── +layout.svelte  # Auth layout
│   ├── login/
│   └── register/
```

## Breaking Out of Layouts

```svelte
<!-- routes/admin/+page.svelte -->
<script lang="ts">
  // Reset to root layout only
  export const layout = 'root';
</script>
```

## API Routes

```ts
// routes/api/users/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const users = await db.user.findMany();
  return json(users);
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const user = await db.user.create({ data: body });
  return json(user, { status: 201 });
};
```

**Official docs:** https://kit.svelte.dev/docs/routing
