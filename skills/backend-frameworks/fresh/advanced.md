# Fresh Advanced Patterns

## Signals (State Management)

### Shared Signals

```tsx
// signals/cart.ts
import { signal, computed } from "@preact/signals";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export const cartItems = signal<CartItem[]>([]);

export const cartTotal = computed(() =>
  cartItems.value.reduce((sum, item) => sum + item.price * item.quantity, 0)
);

export function addToCart(item: Omit<CartItem, "quantity">) {
  const existing = cartItems.value.find((i) => i.id === item.id);
  if (existing) {
    cartItems.value = cartItems.value.map((i) =>
      i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
    );
  } else {
    cartItems.value = [...cartItems.value, { ...item, quantity: 1 }];
  }
}

// islands/CartIcon.tsx
import { cartItems } from "../signals/cart.ts";

export default function CartIcon() {
  const count = cartItems.value.reduce((sum, item) => sum + item.quantity, 0);
  return <span>Cart ({count})</span>;
}
```

### TodoList with Signals

```tsx
// islands/TodoList.tsx
import { useSignal, useComputed } from "@preact/signals";

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

export default function TodoList() {
  const todos = useSignal<Todo[]>([]);
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

  const toggleTodo = (id: number) => {
    todos.value = todos.value.map((t) =>
      t.id === id ? { ...t, done: !t.done } : t
    );
  };

  return (
    <div>
      <input
        type="text"
        value={newTodo.value}
        onInput={(e) => newTodo.value = (e.target as HTMLInputElement).value}
        onKeyDown={(e) => e.key === "Enter" && addTodo()}
      />
      <button onClick={addTodo}>Add</button>

      <ul>
        {todos.value.map((todo) => (
          <li key={todo.id}>
            <input
              type="checkbox"
              checked={todo.done}
              onChange={() => toggleTodo(todo.id)}
            />
            <span style={{ textDecoration: todo.done ? "line-through" : "none" }}>
              {todo.text}
            </span>
          </li>
        ))}
      </ul>

      <p>{remaining.value} items remaining</p>
    </div>
  );
}
```

---

## Middleware

### Authentication Middleware

```tsx
// routes/api/_middleware.ts
import { FreshContext } from "$fresh/server.ts";

interface State {
  user: { id: string; email: string } | null;
}

export async function handler(req: Request, ctx: FreshContext<State>) {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const token = authHeader.slice(7);
  const user = await validateToken(token);

  if (!user) {
    return new Response("Invalid token", { status: 401 });
  }

  ctx.state.user = user;
  return ctx.next();
}

async function validateToken(token: string) {
  // Token validation logic
  return { id: "1", email: "user@example.com" };
}

// routes/api/me.ts
import { Handlers } from "$fresh/server.ts";

interface State {
  user: { id: string; email: string };
}

export const handler: Handlers<unknown, State> = {
  GET(_req, ctx) {
    return new Response(JSON.stringify(ctx.state.user), {
      headers: { "Content-Type": "application/json" },
    });
  },
};
```

### CORS Middleware

```tsx
// routes/_middleware.ts
import { FreshContext } from "$fresh/server.ts";

const ALLOWED_ORIGINS = ["https://example.com"];

export async function handler(req: Request, ctx: FreshContext) {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.includes(origin) ? origin : "",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const resp = await ctx.next();

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    resp.headers.set("Access-Control-Allow-Origin", origin);
  }

  return resp;
}
```

---

## Plugins

### Creating a Plugin

```tsx
// plugins/kv.ts
import { Plugin } from "$fresh/server.ts";

export interface KvState {
  kv: Deno.Kv;
}

export default function kvPlugin(): Plugin<KvState> {
  let kv: Deno.Kv;

  return {
    name: "kv",
    async configureServer(server) {
      kv = await Deno.openKv();
    },
    middlewares: [
      {
        path: "/",
        middleware: {
          handler: async (_req, ctx) => {
            ctx.state.kv = kv;
            return await ctx.next();
          },
        },
      },
    ],
  };
}

// main.ts
import { start } from "$fresh/server.ts";
import manifest from "./fresh.gen.ts";
import config from "./fresh.config.ts";
import kvPlugin from "./plugins/kv.ts";

await start(manifest, {
  ...config,
  plugins: [kvPlugin()],
});
```

### Using Twind Plugin

```tsx
// fresh.config.ts
import { defineConfig } from "$fresh/server.ts";
import twindPlugin from "$fresh/plugins/twind.ts";
import twindConfig from "./twind.config.ts";

export default defineConfig({
  plugins: [twindPlugin(twindConfig)],
});

// twind.config.ts
import { defineConfig, Preset } from "twind";
import presetTailwind from "@twind/preset-tailwind";

export default {
  ...defineConfig({
    presets: [presetTailwind() as Preset],
  }),
  selfURL: import.meta.url,
};
```

---

## Error Handling

### Custom Error Pages

```tsx
// routes/_404.tsx
import { Head } from "$fresh/runtime.ts";

export default function NotFound() {
  return (
    <>
      <Head>
        <title>404 - Page Not Found</title>
      </Head>
      <div>
        <h1>404</h1>
        <p>Page not found</p>
        <a href="/">Go home</a>
      </div>
    </>
  );
}

// routes/_500.tsx
import { PageProps } from "$fresh/server.ts";

export default function Error500({ error }: PageProps) {
  return (
    <div>
      <h1>500 - Server Error</h1>
      <p>Something went wrong</p>
    </div>
  );
}
```

### Error Boundaries

```tsx
// islands/ErrorBoundary.tsx
import { Component, JSX } from "preact";

interface Props {
  children: JSX.Element;
  fallback: JSX.Element;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Island error:", error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
```

---

## Production Readiness

### Environment Variables

```tsx
// utils/config.ts
export const config = {
  databaseUrl: Deno.env.get("DATABASE_URL") || "",
  apiKey: Deno.env.get("API_KEY") || "",
  isProduction: Deno.env.get("DENO_DEPLOYMENT_ID") !== undefined,
};

// routes/api/data.ts
import { config } from "../../utils/config.ts";

export const handler: Handlers = {
  GET() {
    if (!config.apiKey) {
      return new Response("API key not configured", { status: 500 });
    }
    // Use config.apiKey
  },
};
```

### Health Checks

```tsx
// routes/health.ts
import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  GET() {
    return new Response(
      JSON.stringify({ status: "healthy", timestamp: new Date().toISOString() }),
      { headers: { "Content-Type": "application/json" } }
    );
  },
};

// routes/ready.ts
export const handler: Handlers = {
  async GET(_req, ctx) {
    try {
      const kv = await Deno.openKv();
      await kv.get(["health-check"]);
      kv.close();

      return new Response(
        JSON.stringify({ status: "ready", database: "connected" }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch {
      return new Response(
        JSON.stringify({ status: "not ready", database: "disconnected" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }
  },
};
```

### Deployment to Deno Deploy

```bash
# Install deployctl
deno install -A jsr:@deno/deployctl

# Deploy
deployctl deploy --project=my-project main.ts

# Or link and deploy
cd my-project
deployctl deploy
```
