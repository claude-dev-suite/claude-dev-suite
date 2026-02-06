---
name: sveltekit
description: |
  SvelteKit full-stack Svelte framework. Covers routing, load functions,
  form actions, and server-side rendering. Use when building SvelteKit
  applications.

  USE WHEN: user mentions "SvelteKit", "Svelte Kit", asks about "+page.svelte", "load functions", "form actions in SvelteKit", "SvelteKit routing", "use:enhance", "hooks.server.ts", "SvelteKit adapters"

  DO NOT USE FOR: Svelte without SvelteKit - use `frontend-svelte` instead; Next.js - use `nextjs-app-router` instead; Nuxt - use `nuxt3` instead; Remix - use `remix` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# SvelteKit Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for WebSocket integration, Server-Sent Events, Socket.IO, hybrid form actions, room management, and streaming patterns.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `sveltekit` for comprehensive documentation.

## Route Structure

```
src/routes/
├── +page.svelte      → / (page UI)
├── +page.server.ts   → / (server load/actions)
├── +layout.svelte    → (shared layout)
├── users/
│   ├── +page.svelte  → /users
│   └── [id]/
│       └── +page.svelte → /users/:id
```

## Key Concepts

- `+page.svelte` → UI component
- `+page.server.ts` → Server-only code
- `+page.ts` → Universal (runs both)
- `+layout` → Nested layouts
- `+error.svelte` → Error pages

---

## Load Functions

```ts
// +page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch }) => {
  const user = await db.users.find(params.id);
  return { user };
};
```

```svelte
<!-- +page.svelte -->
<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;
</script>

<h1>{data.user.name}</h1>
```

---

## Form Actions

```ts
// +page.server.ts
import type { Actions } from './$types';

export const actions: Actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    await db.users.create({ name: data.get('name') });
    return { success: true };
  },
  delete: async ({ params }) => {
    await db.users.delete(params.id);
  }
};
```

```svelte
<form method="POST">
  <input name="name" />
  <button>Create</button>
</form>

<form method="POST" action="?/delete">
  <button>Delete</button>
</form>
```

### Form Validation with Zod

```typescript
// src/routes/users/+page.server.ts
import { fail } from '@sveltejs/kit';
import { z } from 'zod';

const UserSchema = z.object({
  email: z.string().email('Invalid email'),
  name: z.string().min(2, 'Name too short'),
});

export const actions = {
  create: async ({ request }) => {
    const formData = await request.formData();
    const data = Object.fromEntries(formData);

    const result = UserSchema.safeParse(data);
    if (!result.success) {
      return fail(400, {
        errors: result.error.flatten().fieldErrors,
        data,
      });
    }

    await createUser(result.data);
    return { success: true };
  },
};
```

```svelte
<!-- +page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  export let form;
</script>

<form method="POST" action="?/create" use:enhance>
  <input name="email" value={form?.data?.email ?? ''} />
  {#if form?.errors?.email}
    <span class="error">{form.errors.email[0]}</span>
  {/if}
  <button>Create</button>
</form>
```

---

## Security Configuration

```typescript
// svelte.config.js
export default {
  kit: {
    csrf: { checkOrigin: true },
    csp: {
      directives: {
        'default-src': ['self'],
        'script-src': ['self'],
      },
    },
  },
};

// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
};
```

---

## Authentication

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const session = event.cookies.get('session');

  if (session) {
    event.locals.user = await verifySession(session);
  }

  // Protect routes
  if (event.url.pathname.startsWith('/admin')) {
    if (!event.locals.user?.isAdmin) {
      throw redirect(303, '/login');
    }
  }

  return resolve(event);
};
```

---

## Error Handling

```svelte
<!-- src/routes/+error.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
</script>

<div class="error">
  <h1>{$page.status}</h1>
  <p>{$page.error?.message}</p>
  <a href="/">Go home</a>
</div>
```

```typescript
// src/hooks.server.ts
import type { HandleServerError } from '@sveltejs/kit';

export const handleError: HandleServerError = async ({ error, event }) => {
  const errorId = crypto.randomUUID();
  console.error('Server error:', { errorId, error, url: event.url });

  return {
    message: 'An unexpected error occurred',
    errorId,
  };
};
```

---

## Performance

```typescript
// Prerendering
export const prerender = true;

export const entries = async () => {
  const posts = await getPosts();
  return posts.map((post) => ({ slug: post.slug }));
};

// Streaming
export const load: PageServerLoad = async () => {
  return {
    critical: await getCriticalData(),
    streamed: {
      slow: getSlowData(), // Not awaited
    },
  };
};
```

```svelte
{#await data.streamed.slow}
  <Skeleton />
{:then slowData}
  <SlowContent data={slowData} />
{/await}
```

---

## When NOT to Use This Skill

- **Svelte without SvelteKit**: Use `frontend-svelte` skill
- **Next.js**: Use `nextjs-app-router` skill
- **Nuxt**: Use `nuxt3` skill
- **Remix**: Use `remix` skill

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|--------------|----------------|------------------|
| Fetching in onMount | Client-side only, no SSR | Use load function |
| Using +page.ts for secrets | Exposed to client | Use +page.server.ts |
| Not using use:enhance | No progressive enhancement | Add use:enhance to forms |
| Ignoring form validation | Security risk | Validate with Zod |
| No +error.svelte | Poor error UX | Create error page |
| Not setting CSRF protection | Security vulnerability | Enable csrf.checkOrigin |

## Quick Troubleshooting

| Issue | Possible Cause | Solution |
|-------|----------------|----------|
| "Cannot access event.locals.user" | Not set in hooks | Set in handle hook |
| Form action not triggered | Missing action attribute | Use action="?/actionName" |
| Data undefined in load | Not exported | Export const load |
| CSRF error | checkOrigin enabled | Check csrf settings |
| Hydration error | Server/client differ | Use browser check |
| Redirect doesn't work | Wrong status code | Use redirect(303, '/path') |

## Production Checklist

- [ ] CSP headers configured
- [ ] CSRF protection enabled
- [ ] Error handling (+error.svelte, hooks)
- [ ] Auth in hooks.server.ts
- [ ] Form validation with Zod
- [ ] use:enhance for progressive forms
- [ ] Prerendering static routes
- [ ] Streaming for slow data

## Reference Documentation
- [Route Structure](quick-ref/route-structure.md)
- [Load Functions](quick-ref/load-functions.md)
