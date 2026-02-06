---
name: fresh
description: |
  Fresh Deno web framework. Covers islands architecture, file-based routing,
  handlers, signals, and plugins. Use for server-rendered Deno applications.

  USE WHEN: user mentions "Fresh", "fresh", "islands architecture", "Deno SSR", "file-based routing in Deno", asks about "Preact SSR", "server-rendered Deno apps", "Deno web framework with hydration", "zero-config Deno framework"

  DO NOT USE FOR: Node.js apps - use `nextjs` or `remix` instead, Pure API servers - use `oak` instead, Edge runtimes - use `hono` instead, Static sites - use SSG tools like Astro
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Fresh Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for Shared Signals, Middleware (Auth, CORS), Plugins, Error Handling, and Production Readiness.

## Basic Setup

```bash
# Create new Fresh project
deno run -A -r https://fresh.deno.dev my-project

# Project structure
my-project/
├── deno.json
├── dev.ts
├── main.ts
├── fresh.gen.ts     # Auto-generated manifest
├── routes/          # File-based routing
├── islands/         # Interactive components
├── components/      # Static components
└── static/          # Static assets
```

## Configuration

```json
// deno.json
{
  "tasks": {
    "start": "deno run -A --watch=static/,routes/ dev.ts",
    "build": "deno run -A dev.ts build",
    "preview": "deno run -A main.ts"
  },
  "imports": {
    "$fresh/": "https://deno.land/x/fresh@1.6.8/",
    "preact": "https://esm.sh/preact@10.19.6",
    "@preact/signals": "https://esm.sh/*@preact/signals@1.2.2"
  },
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact"
  }
}
```

## File-Based Routing

```tsx
// routes/index.tsx
export default function Home() {
  return <h1>Welcome to Fresh</h1>;
}

// routes/users/[id].tsx - Dynamic route
import { PageProps } from "$fresh/server.ts";

export default function UserPage(props: PageProps) {
  const { id } = props.params;
  return <h1>User: {id}</h1>;
}

// routes/blog/[...slug].tsx - Catch-all
export default function BlogPost(props: PageProps) {
  const { slug } = props.params;
  return <h1>Post: {slug}</h1>;
}

// routes/(marketing)/pricing.tsx - Route groups
// URL: /pricing (group name not in URL)
```

## Handlers

```tsx
// routes/api/users.ts
import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  GET(_req, _ctx) {
    const users = [{ id: 1, name: "Alice" }];
    return new Response(JSON.stringify(users), {
      headers: { "Content-Type": "application/json" },
    });
  },

  async POST(req, ctx) {
    const body = await req.json();
    // Process...
    return new Response(JSON.stringify(body), { status: 201 });
  },
};
```

### Handler with Page

```tsx
// routes/greet/[name].tsx
import { Handlers, PageProps } from "$fresh/server.ts";

interface Data {
  greeting: string;
}

export const handler: Handlers<Data> = {
  GET(_req, ctx) {
    return ctx.render({ greeting: `Hello, ${ctx.params.name}!` });
  },
};

export default function GreetPage({ data }: PageProps<Data>) {
  return <h1>{data.greeting}</h1>;
}
```

## Islands Architecture

```tsx
// islands/Counter.tsx
import { useSignal } from "@preact/signals";

export default function Counter() {
  const count = useSignal(0);

  return (
    <div>
      <p>Count: {count.value}</p>
      <button onClick={() => count.value++}>Increment</button>
    </div>
  );
}

// routes/index.tsx - Using islands
import Counter from "../islands/Counter.tsx";

export default function Home() {
  return (
    <div>
      <h1>My App</h1>
      {/* This component is hydrated on the client */}
      <Counter />
    </div>
  );
}
```

### Islands with Props

```tsx
// islands/Greeting.tsx
import { useSignal } from "@preact/signals";

interface GreetingProps {
  initialName: string;
}

export default function Greeting({ initialName }: GreetingProps) {
  const name = useSignal(initialName);

  return (
    <div>
      <input
        type="text"
        value={name.value}
        onInput={(e) => name.value = (e.target as HTMLInputElement).value}
      />
      <p>Hello, {name.value}!</p>
    </div>
  );
}
```

## Signals (State Management)

```tsx
// islands/TodoList.tsx
import { useSignal, useComputed } from "@preact/signals";

export default function TodoList() {
  const todos = useSignal<{ id: number; text: string; done: boolean }[]>([]);
  const newTodo = useSignal("");

  const remaining = useComputed(() =>
    todos.value.filter((t) => !t.done).length
  );

  const addTodo = () => {
    if (newTodo.value.trim()) {
      todos.value = [...todos.value, {
        id: Date.now(),
        text: newTodo.value,
        done: false,
      }];
      newTodo.value = "";
    }
  };

  return (
    <div>
      <input
        value={newTodo.value}
        onInput={(e) => newTodo.value = (e.target as HTMLInputElement).value}
        onKeyDown={(e) => e.key === "Enter" && addTodo()}
      />
      <button onClick={addTodo}>Add</button>
      <p>{remaining.value} items remaining</p>
    </div>
  );
}
```

## Static Components

```tsx
// components/Header.tsx
import { JSX } from "preact";

interface HeaderProps {
  title: string;
  children?: JSX.Element;
}

export function Header({ title, children }: HeaderProps) {
  return (
    <header>
      <h1>{title}</h1>
      <nav>{children}</nav>
    </header>
  );
}
```

## Forms

```tsx
// routes/contact.tsx
import { Handlers, PageProps } from "$fresh/server.ts";

interface PageData {
  error?: string;
  success?: boolean;
}

export const handler: Handlers<PageData> = {
  GET(_req, ctx) {
    return ctx.render({});
  },

  async POST(req, ctx) {
    const form = await req.formData();
    const name = form.get("name")?.toString();
    const email = form.get("email")?.toString();

    if (!name || !email) {
      return ctx.render({ error: "All fields required" });
    }

    return ctx.render({ success: true });
  },
};

export default function ContactPage({ data }: PageProps<PageData>) {
  return (
    <div>
      {data.error && <p style={{ color: "red" }}>{data.error}</p>}
      {data.success && <p style={{ color: "green" }}>Sent!</p>}

      <form method="POST">
        <input type="text" name="name" required />
        <input type="email" name="email" required />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

## Basic Middleware

```tsx
// routes/_middleware.ts
import { FreshContext } from "$fresh/server.ts";

export async function handler(req: Request, ctx: FreshContext) {
  const start = performance.now();
  const resp = await ctx.next();
  const duration = performance.now() - start;
  resp.headers.set("X-Response-Time", `${duration.toFixed(2)}ms`);
  return resp;
}
```

---

## Checklist

- [ ] Islands only for interactive components
- [ ] Static components for server-rendered content
- [ ] Middleware for cross-cutting concerns
- [ ] Error pages (_404.tsx, _500.tsx)
- [ ] Health/readiness endpoints
- [ ] Environment variables via Deno.env
- [ ] Form validation on both client and server

## When NOT to Use This Skill

- **Node.js Projects**: Use Next.js, Remix
- **Pure API Servers**: Use Oak for Deno API-only apps
- **Edge Runtimes**: Use Hono for Cloudflare Workers
- **Static Sites**: Use Astro or other SSG tools

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using islands for static content | Unnecessary hydration | Use static components |
| Heavy computation in islands | Slow client-side | Compute on server |
| Fetching data in islands | Waterfalls | Fetch in handlers |
| Hardcoding env variables | Not portable | Use `Deno.env.get()` |

## Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| Island not hydrating | Move component to `islands/` folder |
| Props not passing | Ensure props are JSON-serializable |
| Handler not executing | Ensure `handler` is exported |
| 404 for dynamic route | Use `[param].tsx` naming |
| Signals not reactive | Access with `.value` |

## Reference Documentation

- [Routing](quick-ref/routing.md)
- [Handlers](quick-ref/handlers.md)
- [Islands](quick-ref/islands.md)
