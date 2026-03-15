# Remix Route Conventions

> **Knowledge Base:** Read `knowledge/remix/routing.md` for complete documentation.

## File-Based Routing

```
app/routes/
├── _index.tsx           # / (index route)
├── about.tsx            # /about
├── contact.tsx          # /contact
│
├── users.tsx            # /users (layout)
├── users._index.tsx     # /users (index)
├── users.$id.tsx        # /users/:id
├── users.$id.edit.tsx   # /users/:id/edit
│
├── blog.tsx             # /blog (layout)
├── blog._index.tsx      # /blog
├── blog.$slug.tsx       # /blog/:slug
│
├── $.tsx                # Splat/catch-all route
└── _auth.tsx            # Pathless layout (no URL segment)
    ├── _auth.login.tsx  # /login
    └── _auth.signup.tsx # /signup
```

## Route Naming Conventions

| Pattern | URL | Description |
|---------|-----|-------------|
| `_index.tsx` | `/` | Index route |
| `about.tsx` | `/about` | Static route |
| `users.$id.tsx` | `/users/:id` | Dynamic param |
| `files.$.tsx` | `/files/*` | Splat (catch-all) |
| `_layout.tsx` | - | Pathless layout |
| `users_.profile.tsx` | `/users/profile` | Escape layout |

## Dynamic Params

```tsx
// routes/users.$userId.tsx
import { useParams, useLoaderData } from '@remix-run/react';
import type { LoaderFunctionArgs } from '@remix-run/node';

export async function loader({ params }: LoaderFunctionArgs) {
  const user = await getUser(params.userId);
  return { user };
}

export default function UserPage() {
  const { user } = useLoaderData<typeof loader>();
  const params = useParams();
  // params.userId available
  return <h1>{user.name}</h1>;
}
```

## Splat Routes

```tsx
// routes/files.$.tsx
export async function loader({ params }: LoaderFunctionArgs) {
  // params['*'] contains the rest of the path
  const path = params['*']; // e.g., "docs/intro/getting-started"
  return { path };
}
```

## Layout Routes

```tsx
// routes/dashboard.tsx (layout)
import { Outlet } from '@remix-run/react';

export default function DashboardLayout() {
  return (
    <div className="dashboard">
      <Sidebar />
      <main>
        <Outlet /> {/* Child routes render here */}
      </main>
    </div>
  );
}

// routes/dashboard._index.tsx -> /dashboard
// routes/dashboard.settings.tsx -> /dashboard/settings
```

## Pathless Layouts

```tsx
// routes/_auth.tsx (no URL segment)
export default function AuthLayout() {
  return (
    <div className="auth-container">
      <Logo />
      <Outlet />
    </div>
  );
}

// routes/_auth.login.tsx -> /login
// routes/_auth.register.tsx -> /register
```

## Route Module Exports

```tsx
// Every route can export:
export const loader = async () => {}; // GET data
export const action = async () => {}; // POST/PUT/DELETE
export const headers = () => {};      // HTTP headers
export const meta = () => {};         // Meta tags
export const links = () => {};        // Link tags
export const handle = {};             // Custom data
export default function Component() {} // UI
export function ErrorBoundary() {}    // Error UI
```

**Official docs:** https://remix.run/docs/en/main/file-conventions/routes
