---
name: oak
description: |
  Oak Deno middleware framework inspired by Koa. Covers routing, middleware,
  context, WebSocket, and static files. Use for Koa-like Deno APIs.

  USE WHEN: user mentions "Oak", "oak", "Deno middleware", "Koa for Deno", asks about "Deno web framework", "Deno API server", "context-based routing in Deno", "Koa alternative for Deno"

  DO NOT USE FOR: Node.js apps - use `express` or `nestjs` instead, Fresh framework - use `fresh` skill instead, Edge runtimes - use `hono` instead, React SSR in Deno - use `fresh` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Oak Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `oak` for comprehensive documentation.

> **Full Reference**: See [advanced.md](advanced.md) for WebSocket patterns, Error Handling, Validation with Zod, and Production Readiness (health checks, graceful shutdown, logging).

## Basic Setup

```typescript
import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const app = new Application();
const router = new Router();

router.get("/", (ctx) => {
  ctx.response.body = "Hello, World!";
});

app.use(router.routes());
app.use(router.allowedMethods());

console.log("Server running on http://localhost:8080");
await app.listen({ port: 8080 });
```

## Configuration

```typescript
// deps.ts - Centralized dependencies
export {
  Application,
  Router,
  Context,
  Status,
  isHttpError,
} from "https://deno.land/x/oak@v12.6.1/mod.ts";
export type {
  Middleware,
  RouterContext,
  State,
} from "https://deno.land/x/oak@v12.6.1/mod.ts";

// main.ts
import { Application, Router } from "./deps.ts";
```

## Routing

### Basic Routes

```typescript
import { Router } from "./deps.ts";

const router = new Router();

router
  .get("/users", listUsers)
  .get("/users/:id", getUser)
  .post("/users", createUser)
  .put("/users/:id", updateUser)
  .delete("/users/:id", deleteUser);

// Handler functions
function listUsers(ctx: RouterContext<"/users">) {
  ctx.response.body = { users: [] };
}

function getUser(ctx: RouterContext<"/users/:id">) {
  const { id } = ctx.params;
  ctx.response.body = { id };
}
```

### Path Parameters

```typescript
const router = new Router();

// Single parameter
router.get("/users/:id", (ctx) => {
  const id = ctx.params.id;
  ctx.response.body = { userId: id };
});

// Multiple parameters
router.get("/users/:userId/posts/:postId", (ctx) => {
  const { userId, postId } = ctx.params;
  ctx.response.body = { userId, postId };
});

// Optional parameter
router.get("/files/:path*", (ctx) => {
  const path = ctx.params.path;
  ctx.response.body = { path };
});
```

### Route Prefixes

```typescript
const apiRouter = new Router({ prefix: "/api" });

apiRouter
  .get("/users", listUsers)    // GET /api/users
  .post("/users", createUser); // POST /api/users

const v1Router = new Router({ prefix: "/api/v1" });
const v2Router = new Router({ prefix: "/api/v2" });

app.use(v1Router.routes());
app.use(v2Router.routes());
```

## Context

### Request Data

```typescript
router.post("/users", async (ctx) => {
  // Path params
  const id = ctx.params.id;

  // Query params
  const page = ctx.request.url.searchParams.get("page") || "1";

  // Headers
  const auth = ctx.request.headers.get("Authorization");

  // Body
  const body = ctx.request.body;

  if (body.type() === "json") {
    const data = await body.json();
    console.log(data);
  }

  if (body.type() === "form") {
    const form = await body.form();
    const name = form.get("name");
  }

  ctx.response.body = { success: true };
});
```

### Response

```typescript
router.get("/users/:id", (ctx) => {
  // JSON response
  ctx.response.body = { id: ctx.params.id, name: "Alice" };
  ctx.response.type = "application/json";

  // Status code
  ctx.response.status = 200;

  // Headers
  ctx.response.headers.set("X-Custom-Header", "value");
});

// Redirect
router.get("/old-path", (ctx) => {
  ctx.response.redirect("/new-path");
});
```

### State

```typescript
interface AppState {
  user?: { id: string; email: string };
  requestId: string;
}

const app = new Application<AppState>();

// Set state in middleware
app.use(async (ctx, next) => {
  ctx.state.requestId = crypto.randomUUID();
  await next();
});

// Access state in handler
router.get("/me", (ctx: RouterContext<"/me", Record<string, string>, AppState>) => {
  const user = ctx.state.user;
  if (!user) {
    ctx.response.status = 401;
    return;
  }
  ctx.response.body = user;
});
```

## Middleware

### Application Middleware

```typescript
import { Application, Status, isHttpError } from "./deps.ts";

const app = new Application();

// Logger middleware
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.request.method} ${ctx.request.url.pathname} - ${ms}ms`);
});

// Error handler middleware
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    if (isHttpError(err)) {
      ctx.response.status = err.status;
      ctx.response.body = { error: err.message };
    } else {
      console.error(err);
      ctx.response.status = Status.InternalServerError;
      ctx.response.body = { error: "Internal server error" };
    }
  }
});
```

### Authentication Middleware

```typescript
import { Middleware, Status } from "./deps.ts";

interface AuthState {
  user: { id: string; email: string; role: string };
}

const authMiddleware: Middleware<AuthState> = async (ctx, next) => {
  const authHeader = ctx.request.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    ctx.response.status = Status.Unauthorized;
    ctx.response.body = { error: "Missing or invalid token" };
    return;
  }

  const token = authHeader.slice(7);

  try {
    const user = await validateToken(token);
    ctx.state.user = user;
    await next();
  } catch {
    ctx.response.status = Status.Unauthorized;
    ctx.response.body = { error: "Invalid token" };
  }
};

// Apply to router
const protectedRouter = new Router<Record<string, string>, AuthState>();
protectedRouter.use(authMiddleware);
protectedRouter.get("/me", (ctx) => {
  ctx.response.body = ctx.state.user;
});
```

### Role-Based Access

```typescript
function requireRole(...roles: string[]): Middleware<AuthState> {
  return async (ctx, next) => {
    const user = ctx.state.user;

    if (!user) {
      ctx.response.status = Status.Unauthorized;
      ctx.response.body = { error: "Not authenticated" };
      return;
    }

    if (!roles.includes(user.role)) {
      ctx.response.status = Status.Forbidden;
      ctx.response.body = { error: "Insufficient permissions" };
      return;
    }

    await next();
  };
}

// Usage
const adminRouter = new Router({ prefix: "/admin" });
adminRouter.use(authMiddleware);
adminRouter.use(requireRole("admin"));
adminRouter.get("/users", listAllUsers);
```

## CORS

```typescript
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";

const app = new Application();

// Allow all origins
app.use(oakCors());

// Custom configuration
app.use(oakCors({
  origin: ["https://example.com", "https://app.example.com"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400,
}));
```

## Static Files

```typescript
import { Application, send } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const app = new Application();

// Serve static files
app.use(async (ctx, next) => {
  const path = ctx.request.url.pathname;

  if (path.startsWith("/static")) {
    await send(ctx, path, {
      root: `${Deno.cwd()}/public`,
      index: "index.html",
    });
    return;
  }

  await next();
});
```

## When NOT to Use This Skill

- **Node.js Projects**: Use Express, Fastify, or NestJS for Node.js-based applications
- **Islands Architecture**: Use Fresh for server-rendered Deno apps with client islands
- **Edge Runtimes**: Use Hono for Cloudflare Workers or Vercel Edge
- **Enterprise DI**: Use NestJS if you need dependency injection and decorators
- **Static Site Generation**: Use Fresh or other SSG tools
- **WebSocket-Heavy Apps**: Use dedicated WebSocket skill for complex real-time features

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Not calling `await next()` in middleware | Request hangs indefinitely | Always call `await next()` unless sending response |
| Using `console.log()` for logging | No structured logging | Use structured JSON logging with timestamps |
| Not handling async errors | Unhandled promise rejections crash app | Wrap async code in try-catch, use error middleware |
| Hardcoding URLs in import statements | Version conflicts, outdated deps | Use `deps.ts` for centralized dependency management |
| Not setting response status explicitly | Defaults to 200 even for errors | Set `ctx.response.status` explicitly |
| Mixing state across requests | Memory leaks, security issues | Use `ctx.state` for request-scoped data only |
| Not validating request body | Security vulnerabilities | Use Zod or similar for validation |
| Using `any` type extensively | Loses TypeScript benefits | Define proper interfaces for requests/responses |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Request hangs indefinitely | Middleware missing `await next()` | Add `await next()` or send response |
| "Module not found" errors | Incorrect import URL or version | Check `deps.ts`, ensure correct version in URL |
| CORS errors | CORS middleware not configured | Add `oakCors()` middleware before routes |
| 404 for all routes | Routes registered after `app.listen()` | Register routes before calling `listen()` |
| State not persisting | Using global variables | Use `ctx.state` for request-scoped state |
| Type errors with context | Wrong type annotations | Use `RouterContext<"/path">` for typed params |
| WebSocket upgrade fails | `ctx.isUpgradable` check missing | Check `ctx.isUpgradable` before `ctx.upgrade()` |
| Static files not serving | Wrong path in `send()` | Use absolute path with `Deno.cwd()` |

## Reference Documentation

- [Routing](quick-ref/routing.md)
- [Middleware](quick-ref/middleware.md)
- [Context](quick-ref/context.md)
- [Advanced Patterns](advanced.md)
