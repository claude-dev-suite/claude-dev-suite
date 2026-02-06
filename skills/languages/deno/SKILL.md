---
name: deno
description: |
  Deno runtime for TypeScript/JavaScript. Covers permissions, standard library,
  testing, and Deploy. Use for secure, TypeScript-native backend development.

  USE WHEN: user mentions "deno", "permissions", "Deno.serve", asks about
  "deno test", "deno deploy", "standard library", "top-level await", "npm compatibility"

  DO NOT USE FOR: Node.js runtime - use `nodejs` skill instead
  DO NOT USE FOR: Fresh/Oak frameworks - use framework-specific skills
  DO NOT USE FOR: Language syntax - use `typescript` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Deno Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for production readiness, testing patterns, middleware, Deno Deploy, and npm compatibility.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `deno` for comprehensive documentation.

## Basics

### Running Scripts

```bash
# Run a TypeScript file
deno run main.ts

# Run with permissions
deno run --allow-net --allow-read main.ts

# Run remote script
deno run https://deno.land/std/examples/welcome.ts

# Check/compile without running
deno check main.ts
```

### TypeScript Native

```typescript
// main.ts - TypeScript works out of the box
interface User {
  id: number;
  name: string;
  email: string;
}

async function fetchUser(id: number): Promise<User> {
  const response = await fetch(`https://api.example.com/users/${id}`);
  return await response.json();
}

// Top-level await - no async wrapper needed
const user = await fetchUser(1);
console.log(user.name);
```

---

## Permissions

### Permission Types

| Flag | Description |
|------|-------------|
| `--allow-read` | File system read access |
| `--allow-write` | File system write access |
| `--allow-net` | Network access |
| `--allow-env` | Environment variable access |
| `--allow-run` | Subprocess execution |
| `--allow-ffi` | Foreign function interface |
| `--allow-sys` | System information |
| `-A` or `--allow-all` | All permissions |

### Granular Permissions

```bash
# Specific paths
deno run --allow-read=/etc,/tmp script.ts

# Specific hosts
deno run --allow-net=api.example.com,db.example.com:5432 script.ts

# Specific environment variables
deno run --allow-env=DATABASE_URL,API_KEY script.ts
```

### Runtime Permission Requests

```typescript
// Request permission at runtime
const status = await Deno.permissions.request({ name: "read", path: "/etc" });
if (status.state === "granted") {
  const data = await Deno.readTextFile("/etc/passwd");
}

// Query current permission
const netStatus = await Deno.permissions.query({
  name: "net",
  host: "api.example.com"
});
console.log(netStatus.state);  // "granted", "denied", or "prompt"
```

---

## Standard Library

### File System

```typescript
// Read file
const content = await Deno.readTextFile("./data.txt");

// Write file
await Deno.writeTextFile("./output.txt", "Hello, World!");

// Read directory
for await (const entry of Deno.readDir("./")) {
  console.log(entry.name, entry.isFile, entry.isDirectory);
}

// File info
const stat = await Deno.stat("./file.txt");
console.log(stat.size, stat.mtime);

// Copy/remove files
await Deno.copyFile("./src.txt", "./dest.txt");
await Deno.remove("./temp.txt");
await Deno.remove("./temp-dir", { recursive: true });
```

### Path Operations

```typescript
import { join, basename, dirname, extname } from "https://deno.land/std/path/mod.ts";

const fullPath = join("home", "user", "documents", "file.txt");
console.log(basename(fullPath));  // "file.txt"
console.log(dirname(fullPath));   // "home/user/documents"
console.log(extname(fullPath));   // ".txt"
```

### Async Utilities

```typescript
import { delay } from "https://deno.land/std/async/delay.ts";
import { deadline } from "https://deno.land/std/async/deadline.ts";

// Delay
await delay(1000);  // Wait 1 second

// Deadline (timeout)
try {
  const result = await deadline(fetchData(), 5000);  // 5 second timeout
} catch (e) {
  if (e instanceof DeadlineError) {
    console.log("Request timed out");
  }
}
```

---

## Deno.serve (Modern HTTP)

### Basic Server

```typescript
Deno.serve((req: Request) => {
  return new Response("Hello, World!");
});
```

### With Configuration

```typescript
Deno.serve({
  port: 8000,
  hostname: "0.0.0.0",
  onListen: ({ port, hostname }) => {
    console.log(`Server started at http://${hostname}:${port}`);
  },
}, handler);
```

### Routing

```typescript
Deno.serve((req: Request) => {
  const url = new URL(req.url);
  const { pathname } = url;

  if (req.method === "GET" && pathname === "/") {
    return new Response("Home");
  }

  if (req.method === "GET" && pathname === "/api/users") {
    return Response.json(users);
  }

  if (req.method === "POST" && pathname === "/api/users") {
    return handleCreateUser(req);
  }

  // Pattern matching
  const userMatch = pathname.match(/^\/api\/users\/(\d+)$/);
  if (userMatch && req.method === "GET") {
    const userId = parseInt(userMatch[1]);
    return Response.json(users.find(u => u.id === userId));
  }

  return new Response("Not Found", { status: 404 });
});
```

---

## Testing

### Basic Tests

```typescript
import { assertEquals, assertThrows } from "https://deno.land/std/assert/mod.ts";

Deno.test("simple test", () => {
  assertEquals(1 + 1, 2);
});

Deno.test("async test", async () => {
  const response = await fetch("https://api.example.com/health");
  assertEquals(response.status, 200);
});

Deno.test("throws test", () => {
  assertThrows(
    () => { throw new Error("boom"); },
    Error,
    "boom"
  );
});
```

### Running Tests

```bash
# Run all tests
deno test

# Run specific file
deno test user_test.ts

# With permissions
deno test --allow-net --allow-read

# Watch mode
deno test --watch

# Coverage
deno test --coverage=coverage
deno coverage coverage --lcov > coverage.lcov
```

---

## deno.json Configuration

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

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Node.js runtime specifics | `nodejs` skill |
| Fresh framework | Framework-specific skill |
| Oak framework | Framework-specific skill |
| TypeScript syntax | `typescript` skill |
| npm package ecosystem | `nodejs` skill |

---

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using --allow-all | Defeats security model | Grant specific permissions |
| Not versioning imports | Breaking changes | Pin versions in imports |
| Ignoring lock file | Reproducibility issues | Commit deno.lock |
| Mixing npm: and https: imports | Inconsistent deps | Prefer one approach |
| Not handling permission errors | Runtime failures | Check permissions first |
| Synchronous file I/O | Blocks runtime | Use async Deno APIs |
| No error boundaries | Unhandled errors | Add error middleware |
| Hardcoded URLs | Portability issues | Use environment variables |

---

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "PermissionDenied" | Missing permission flag | Add --allow-* flag |
| "Module not found" | Wrong URL or version | Check import URL |
| "Integrity check failed" | Lock file mismatch | Run with --lock-write |
| "Top-level await not allowed" | .js file extension | Use .ts or .mjs |
| "Cannot find module 'node:fs'" | Node compat needed | Use Deno.* APIs instead |
| Slow startup | Downloading remote modules | Use vendor or deno cache |
| Type errors with npm packages | Missing types | Use @types or as any |
| Test failures | Permissions in tests | Add --allow-* to test command |

---

## Reference Documentation

- [Permissions](quick-ref/permissions.md)
- [Standard Library](quick-ref/std.md)
- [Testing](quick-ref/testing.md)

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `deno` for comprehensive documentation.
