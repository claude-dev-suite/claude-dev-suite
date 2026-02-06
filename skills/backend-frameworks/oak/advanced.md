# Oak Advanced Patterns

## WebSocket

```typescript
import { Application, Router } from "./deps.ts";

const router = new Router();
const clients = new Set<WebSocket>();

router.get("/ws", async (ctx) => {
  if (!ctx.isUpgradable) {
    ctx.response.status = 400;
    ctx.response.body = "WebSocket upgrade required";
    return;
  }

  const ws = ctx.upgrade();

  ws.onopen = () => {
    clients.add(ws);
    console.log("Client connected");
  };

  ws.onmessage = (event) => {
    console.log("Received:", event.data);
    // Broadcast to all clients
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(event.data);
      }
    }
  };

  ws.onclose = () => {
    clients.delete(ws);
    console.log("Client disconnected");
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    clients.delete(ws);
  };
});
```

### WebSocket with Rooms

```typescript
const rooms = new Map<string, Set<WebSocket>>();

router.get("/ws/:room", async (ctx) => {
  if (!ctx.isUpgradable) {
    ctx.response.status = 400;
    return;
  }

  const roomId = ctx.params.room;
  const ws = ctx.upgrade();

  ws.onopen = () => {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId)!.add(ws);
  };

  ws.onmessage = (event) => {
    const room = rooms.get(roomId);
    if (room) {
      for (const client of room) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(event.data);
        }
      }
    }
  };

  ws.onclose = () => {
    rooms.get(roomId)?.delete(ws);
    if (rooms.get(roomId)?.size === 0) {
      rooms.delete(roomId);
    }
  };
});
```

---

## Error Handling

### HTTP Errors

```typescript
import { httpErrors, isHttpError, Status } from "./deps.ts";

router.get("/users/:id", async (ctx) => {
  const user = await findUser(ctx.params.id);

  if (!user) {
    throw new httpErrors.NotFound("User not found");
  }

  ctx.response.body = user;
});

// Global error handler
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    if (isHttpError(err)) {
      ctx.response.status = err.status;
      ctx.response.body = {
        error: err.name,
        message: err.message,
      };
    } else {
      console.error(err);
      ctx.response.status = Status.InternalServerError;
      ctx.response.body = {
        error: "InternalServerError",
        message: "An unexpected error occurred",
      };
    }
  }
});
```

### Custom Error Class

```typescript
class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

router.get("/users/:id", async (ctx) => {
  const user = await findUser(ctx.params.id);

  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  ctx.response.body = user;
});

// Error handler
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    if (err instanceof AppError) {
      ctx.response.status = err.status;
      ctx.response.body = {
        code: err.code,
        message: err.message,
      };
    } else {
      throw err;
    }
  }
});
```

---

## Validation

```typescript
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const CreateUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  age: z.number().int().min(0).max(150).optional(),
});

router.post("/users", async (ctx) => {
  const body = ctx.request.body;

  if (body.type() !== "json") {
    ctx.response.status = 400;
    ctx.response.body = { error: "JSON body required" };
    return;
  }

  const data = await body.json();
  const result = CreateUserSchema.safeParse(data);

  if (!result.success) {
    ctx.response.status = 400;
    ctx.response.body = {
      error: "Validation failed",
      details: result.error.issues,
    };
    return;
  }

  const user = result.data;
  ctx.response.status = 201;
  ctx.response.body = { user };
});
```

---

## Production Readiness

### Health Checks

```typescript
router.get("/health", (ctx) => {
  ctx.response.body = {
    status: "healthy",
    timestamp: new Date().toISOString(),
  };
});

router.get("/ready", async (ctx) => {
  try {
    const kv = await Deno.openKv();
    await kv.get(["health"]);
    kv.close();

    ctx.response.body = {
      status: "ready",
      database: "connected",
    };
  } catch {
    ctx.response.status = 503;
    ctx.response.body = {
      status: "not ready",
      database: "disconnected",
    };
  }
});
```

### Graceful Shutdown

```typescript
const controller = new AbortController();
const { signal } = controller;

const app = new Application();
app.use(router.routes());

Deno.addSignalListener("SIGINT", () => {
  console.log("Shutting down...");
  controller.abort();
});

Deno.addSignalListener("SIGTERM", () => {
  console.log("Shutting down...");
  controller.abort();
});

console.log("Server running on http://localhost:8080");
await app.listen({ port: 8080, signal });
console.log("Server stopped");
```

### Logging Middleware

```typescript
interface LogEntry {
  timestamp: string;
  method: string;
  path: string;
  status: number;
  duration: number;
  ip: string;
}

app.use(async (ctx, next) => {
  const start = performance.now();

  await next();

  const duration = performance.now() - start;
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    method: ctx.request.method,
    path: ctx.request.url.pathname,
    status: ctx.response.status,
    duration: Math.round(duration),
    ip: ctx.request.ip,
  };

  console.log(JSON.stringify(entry));
});
```

### Production Checklist

- [ ] Error handling middleware
- [ ] Logging middleware
- [ ] CORS configured
- [ ] Authentication middleware
- [ ] Request validation
- [ ] Health/readiness endpoints
- [ ] Graceful shutdown
- [ ] Static file serving
- [ ] Rate limiting
- [ ] Request body size limits
