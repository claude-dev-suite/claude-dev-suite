# Deno Advanced Patterns

## Production Readiness

### Configuration

```typescript
interface Config {
  port: number;
  databaseUrl: string;
  logLevel: string;
}

function loadConfig(): Config {
  return {
    port: parseInt(Deno.env.get("PORT") ?? "8000"),
    databaseUrl: Deno.env.get("DATABASE_URL") ??
      (() => { throw new Error("DATABASE_URL required") })(),
    logLevel: Deno.env.get("LOG_LEVEL") ?? "info",
  };
}
```

### Structured Logging

```typescript
type LogLevel = "debug" | "info" | "warn" | "error";

function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data,
  };
  console.log(JSON.stringify(entry));
}

log("info", "Server started", { port: 8000 });
log("error", "Database connection failed", { error: "timeout" });
```

### Graceful Shutdown

```typescript
const controller = new AbortController();

Deno.addSignalListener("SIGINT", () => {
  console.log("Shutting down...");
  controller.abort();
});

Deno.addSignalListener("SIGTERM", () => {
  console.log("Shutting down...");
  controller.abort();
});

const server = Deno.serve({
  port: 8000,
  signal: controller.signal,
  onListen: () => console.log("Server started"),
}, handler);

await server.finished;
console.log("Server stopped");
```

### Health Checks

```typescript
Deno.serve((req: Request) => {
  const url = new URL(req.url);

  if (url.pathname === "/health") {
    return Response.json({ status: "healthy" });
  }

  if (url.pathname === "/ready") {
    const dbHealthy = await checkDatabase();
    if (!dbHealthy) {
      return Response.json(
        { status: "not ready", database: "disconnected" },
        { status: 503 }
      );
    }
    return Response.json({ status: "ready" });
  }

  return mainHandler(req);
});
```

---

## Testing Patterns

### Test Organization

```typescript
Deno.test("User module", async (t) => {
  await t.step("can create user", () => {
    const user = createUser("Alice");
    assertEquals(user.name, "Alice");
  });

  await t.step("can update user", () => {
    const user = createUser("Alice");
    user.name = "Bob";
    assertEquals(user.name, "Bob");
  });

  await t.step("validates email", () => {
    assertThrows(() => {
      createUser("Alice", "invalid-email");
    });
  });
});
```

### Mocking

```typescript
import { stub, spy, assertSpyCalls } from "https://deno.land/std/testing/mock.ts";

Deno.test("mocking fetch", async () => {
  const fetchStub = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response(JSON.stringify({ id: 1 })))
  );

  try {
    const user = await fetchUser(1);
    assertEquals(user.id, 1);
    assertSpyCalls(fetchStub, 1);
  } finally {
    fetchStub.restore();
  }
});
```

---

## Deno Deploy

### Environment Variables & KV

```typescript
const apiKey = Deno.env.get("API_KEY");
if (!apiKey) {
  throw new Error("API_KEY is required");
}

// Deploy KV (Key-Value store)
const kv = await Deno.openKv();

// Set value
await kv.set(["users", "123"], { name: "Alice" });

// Get value
const result = await kv.get(["users", "123"]);
console.log(result.value);

// Atomic operations
await kv.atomic()
  .check({ key: ["users", "123"], versionstamp: result.versionstamp })
  .set(["users", "123"], { name: "Alice Updated" })
  .commit();
```

### BroadcastChannel (Multi-instance)

```typescript
const channel = new BroadcastChannel("notifications");

channel.onmessage = (event) => {
  console.log("Received:", event.data);
};

// Send to all instances
channel.postMessage({ type: "user_updated", userId: 123 });
```

---

## Middleware Pattern

```typescript
type Handler = (req: Request) => Response | Promise<Response>;
type Middleware = (handler: Handler) => Handler;

// Logging middleware
const withLogging: Middleware = (handler) => async (req) => {
  const start = Date.now();
  const response = await handler(req);
  console.log(`${req.method} ${req.url} - ${Date.now() - start}ms`);
  return response;
};

// CORS middleware
const withCors: Middleware = (handler) => async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const response = await handler(req);
  response.headers.set("Access-Control-Allow-Origin", "*");
  return response;
};

// Compose middlewares
const compose = (...middlewares: Middleware[]) => (handler: Handler) =>
  middlewares.reduceRight((h, m) => m(h), handler);

const enhancedHandler = compose(withLogging, withCors)(mainHandler);
Deno.serve(enhancedHandler);
```

---

## npm Compatibility

### Using npm Packages

```typescript
// Import npm packages with npm: specifier
import express from "npm:express@4";
import { z } from "npm:zod";

const app = express();
app.get("/", (req, res) => {
  res.send("Hello from Express on Deno!");
});

// Zod validation
const UserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});
```

### deno.json Configuration

```json
{
  "tasks": {
    "dev": "deno run --watch --allow-net main.ts",
    "start": "deno run --allow-net main.ts",
    "test": "deno test --allow-read"
  },
  "imports": {
    "@std/": "https://deno.land/std@0.210.0/",
    "express": "npm:express@4",
    "zod": "npm:zod"
  },
  "compilerOptions": {
    "strict": true
  }
}
```

---

## Production Checklist

- [ ] Permissions explicitly declared
- [ ] TypeScript strict mode enabled
- [ ] Lock file committed (deno.lock)
- [ ] Structured logging (JSON format)
- [ ] Configuration via environment
- [ ] Health/readiness endpoints
- [ ] Graceful shutdown handling
- [ ] Error handling middleware
- [ ] Tests with coverage
- [ ] Deploy configuration ready
