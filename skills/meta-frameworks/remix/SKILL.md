---
name: remix
description: |
  Remix full-stack React framework. Covers loaders, actions, nested
  routing, and progressive enhancement. Use when building Remix
  applications.

  USE WHEN: user mentions "Remix", asks about "loaders", "actions", "Remix forms", "nested routes in Remix", "progressive enhancement", "defer in Remix", "useFetcher", "Remix deployment"

  DO NOT USE FOR: React without Remix - use `frontend-react` instead; Next.js - use `nextjs-app-router` instead; Nuxt - use `nuxt3` instead; SvelteKit - use `sveltekit` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Remix Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for WebSocket integration, Server-Sent Events, Socket.IO patterns, and room management.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `remix` for comprehensive documentation.

## Route Module

```tsx
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, Form } from '@remix-run/react';

// Server: Load data
export async function loader({ params }: LoaderFunctionArgs) {
  const user = await db.users.find(params.id);
  if (!user) throw new Response('Not Found', { status: 404 });
  return json({ user });
}

// Server: Handle mutations
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  await db.users.update({ name: formData.get('name') });
  return json({ success: true });
}

// Client: UI
export default function UserPage() {
  const { user } = useLoaderData<typeof loader>();
  return (
    <Form method="post">
      <input name="name" defaultValue={user.name} />
      <button type="submit">Save</button>
    </Form>
  );
}
```

## Key Concepts

| Concept | Purpose |
|---------|---------|
| `loader` | GET requests, data fetching |
| `action` | POST/PUT/DELETE mutations |
| `Form` | Progressive enhanced forms |
| `useLoaderData` | Access loader data |
| `useFetcher` | Non-navigation mutations |

## Nested Routes

```
routes/
├── _index.tsx        → /
├── users.tsx         → /users (layout)
├── users._index.tsx  → /users (index)
└── users.$id.tsx     → /users/:id
```

## Error Handling

```tsx
export function ErrorBoundary() {
  const error = useRouteError();
  return <div>Error: {error.message}</div>;
}
```

## Production Readiness

### Security

```typescript
// app/utils/csrf.server.ts
import { createCookie } from '@remix-run/node';

export const csrfCookie = createCookie('csrf', {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
});

// app/root.tsx - Security headers
export const headers: HeadersFunction = () => ({
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'",
});

// Input validation
import { z } from 'zod';

const UserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
});

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const result = UserSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return json({ errors: result.error.flatten() }, { status: 400 });
  }

  // Process valid data
}
```

### Error Handling

```typescript
// app/root.tsx
export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div>
        <h1>{error.status} {error.statusText}</h1>
        <p>{error.data}</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Unexpected Error</h1>
      <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
    </div>
  );
}

// Per-route error boundary
// app/routes/users.$id.tsx
export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <div>User not found</div>;
  }

  throw error; // Re-throw to parent boundary
}
```

### Performance

```typescript
// Streaming with defer
import { defer } from '@remix-run/node';
import { Await, useLoaderData } from '@remix-run/react';

export async function loader() {
  const criticalData = await getCriticalData();
  const slowData = getSlowData(); // Don't await

  return defer({
    criticalData,
    slowData,
  });
}

export default function Page() {
  const { criticalData, slowData } = useLoaderData<typeof loader>();

  return (
    <div>
      <div>{criticalData.name}</div>
      <Suspense fallback={<Skeleton />}>
        <Await resolve={slowData}>
          {(data) => <SlowSection data={data} />}
        </Await>
      </Suspense>
    </div>
  );
}

// Caching
export const headers: HeadersFunction = () => ({
  'Cache-Control': 'public, max-age=300, s-maxage=3600',
});
```

### Session Management

```typescript
// app/utils/session.server.ts
import { createCookieSessionStorage, redirect } from '@remix-run/node';

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: '__session',
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: '/',
    sameSite: 'lax',
    secrets: [process.env.SESSION_SECRET!],
    secure: process.env.NODE_ENV === 'production',
  },
});

export async function requireUser(request: Request) {
  const session = await sessionStorage.getSession(request.headers.get('Cookie'));
  const userId = session.get('userId');

  if (!userId) {
    throw redirect('/login');
  }

  return userId;
}
```

### Testing

```typescript
// app/routes/users.test.ts
import { createRemixStub } from '@remix-run/testing';
import { render, screen } from '@testing-library/react';
import UsersPage, { loader } from './users';

describe('Users Page', () => {
  it('renders users', async () => {
    const RemixStub = createRemixStub([
      {
        path: '/',
        Component: UsersPage,
        loader: () => ({ users: [{ id: '1', name: 'John' }] }),
      },
    ]);

    render(<RemixStub />);

    expect(await screen.findByText('John')).toBeInTheDocument();
  });
});

// E2E with Playwright
test('user flow', async ({ page }) => {
  await page.goto('/users');
  await page.click('button:has-text("Add User")');
  await page.fill('input[name="name"]', 'Jane');
  await page.click('button:has-text("Save")');
  await expect(page.locator('text=Jane')).toBeVisible();
});
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Time to First Byte | < 100ms |
| First Contentful Paint | < 1s |
| Cumulative Layout Shift | < 0.1 |
| Form submission time | < 500ms |

### Checklist

- [ ] Security headers in root
- [ ] CSRF protection for forms
- [ ] Input validation with Zod
- [ ] ErrorBoundary per route
- [ ] Streaming with defer
- [ ] Cache headers for static data
- [ ] Secure session cookies
- [ ] Rate limiting on actions
- [ ] Testing with @remix-run/testing
- [ ] Progressive enhancement verified

## When NOT to Use This Skill

This skill is for Remix (React meta-framework). DO NOT use for:

- **React without Remix**: Use `frontend-react` skill instead
- **Next.js (React meta-framework)**: Use `nextjs-app-router` skill instead
- **Nuxt (Vue meta-framework)**: Use `nuxt3` skill instead
- **SvelteKit**: Use `sveltekit` skill instead
- **Astro**: Use `astro` skill instead
- **React Router SPA**: Use `frontend-react` with React Router documentation

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|--------------|----------------|------------------|
| Fetching in useEffect | Client-side only, no SSR, waterfalls | Use loader function for data fetching |
| Not using Form component | No progressive enhancement | Use <Form> from @remix-run/react |
| Ignoring ErrorBoundary | Uncaught errors crash route | Export ErrorBoundary from each route |
| Putting business logic in component | Not server-side, harder to test | Move logic to loader/action functions |
| Not validating formData | Security risk, type errors | Validate with Zod in action function |
| Using fetch instead of fetcher | Full page reload on mutation | Use useFetcher for non-navigation mutations |
| No cache headers | Poor performance | Set Cache-Control headers in loader |
| Secrets in client code | Exposed to client, security risk | Keep secrets in loader/action only |

## Quick Troubleshooting

| Issue | Possible Cause | Solution |
|-------|----------------|----------|
| "useLoaderData returns undefined" | No loader exported | Export loader function from route |
| Form submission doesn't work | Using <form> instead of <Form> | Import and use <Form> from @remix-run/react |
| Data not updating after action | Not revalidating | Remix auto-revalidates; check action return value |
| "Cannot access request.formData" | Wrong function signature | Use ActionFunctionArgs, await request.formData() |
| 404 on nested route | Incorrect file naming | Check routes/ file structure and naming conventions |
| Session not persisting | Cookie not returned | Return session.commit() in Set-Cookie header |
| Hydration mismatch | Server/client data differs | Ensure consistent data from loader |
| "ErrorBoundary is not a function" | Wrong export syntax | Export as: export function ErrorBoundary() {} |

## Reference Documentation
- [Route Conventions](quick-ref/route-conventions.md)
- [Forms & Actions](quick-ref/forms.md)
