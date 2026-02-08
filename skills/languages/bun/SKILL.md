---
name: bun
description: |
  Bun JavaScript runtime. Fast all-in-one toolkit with bundler, test runner, package manager.
  Use when working with Bun projects or considering Node.js alternatives.

  USE WHEN: user mentions "bun", "bun test", "bun build", asks about
  "Bun.serve", "bun install", "SQLite in Bun", "bunx", "performance comparison"

  DO NOT USE FOR: Node.js runtime - use `nodejs` skill instead
  DO NOT USE FOR: Hono/Elysia frameworks - use framework-specific skills
  DO NOT USE FOR: Language syntax - use `typescript` or `javascript` skills
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---
# Bun - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `bun` for comprehensive documentation.

## When to Use This Skill
- Projects requiring high performance
- Replacement for Node.js + npm + bundler
- Fast test runner alternative to Vitest/Jest
- Quick scripts with native TypeScript

## Setup

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Create project
bun init

# Run TypeScript directly (no compilation needed!)
bun run index.ts

# Run with watch mode
bun --watch run index.ts
```

## Package Manager

```bash
# Install dependencies (faster than npm/pnpm)
bun install

# Add packages
bun add express zod
bun add -d typescript @types/node

# Remove
bun remove package-name

# Update
bun update

# Run scripts
bun run build
bun run dev

# Execute binary
bunx prisma generate
```

### Workspaces

```json
// package.json
{
  "workspaces": ["packages/*"]
}
```

```bash
# Install all workspace deps
bun install

# Run in specific workspace
bun run --filter @myorg/api build
```

## Bundler

```typescript
// Build for production
await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  target: 'node',        // 'browser' | 'bun'
  minify: true,
  sourcemap: 'external',
  splitting: true,       // Code splitting
  format: 'esm',         // 'cjs' | 'esm'
});

// CLI
bun build ./src/index.ts --outdir ./dist --minify
```

### Build Config

```typescript
// bunfig.toml alternative - build.ts
const result = await Bun.build({
  entrypoints: ['./src/index.tsx'],
  outdir: './dist',
  target: 'browser',
  minify: {
    whitespace: true,
    identifiers: true,
    syntax: true,
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  external: ['react', 'react-dom'],
  loader: {
    '.png': 'file',
    '.svg': 'text',
  },
});

if (!result.success) {
  console.error('Build failed:', result.logs);
  process.exit(1);
}
```

## Test Runner

```typescript
// math.test.ts
import { describe, it, expect, beforeAll, mock } from 'bun:test';

describe('math', () => {
  it('adds numbers', () => {
    expect(1 + 2).toBe(3);
  });

  it('handles async', async () => {
    const result = await fetchData();
    expect(result).toBeDefined();
  });
});

// Mocking
const mockFn = mock(() => 42);
mockFn();
expect(mockFn).toHaveBeenCalled();

// Module mocking
mock.module('./config', () => ({
  apiUrl: 'http://test.local',
}));
```

```bash
# Run tests
bun test

# Watch mode
bun test --watch

# Coverage
bun test --coverage

# Filter
bun test --filter "user"
```

## HTTP Server

```typescript
// Native Bun server (fastest)
Bun.serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/api/health') {
      return Response.json({ status: 'ok' });
    }

    if (url.pathname === '/api/users' && req.method === 'POST') {
      const body = await req.json();
      return Response.json({ id: 1, ...body }, { status: 201 });
    }

    return new Response('Not Found', { status: 404 });
  },
  error(error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  },
});

console.log('Server running on http://localhost:3000');
```

### With Hono (recommended for APIs)

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

const app = new Hono();

app.use('*', logger());
app.use('/api/*', cors());

app.get('/api/users', (c) => {
  return c.json([{ id: 1, name: 'John' }]);
});

app.post('/api/users', async (c) => {
  const body = await c.req.json();
  return c.json({ id: 1, ...body }, 201);
});

export default app;
```

## File I/O

```typescript
// Read file (returns string or ArrayBuffer)
const text = await Bun.file('data.txt').text();
const json = await Bun.file('data.json').json();
const buffer = await Bun.file('image.png').arrayBuffer();

// Write file
await Bun.write('output.txt', 'Hello World');
await Bun.write('data.json', JSON.stringify(data));

// Stream large files
const file = Bun.file('large.csv');
const stream = file.stream();

for await (const chunk of stream) {
  process.stdout.write(chunk);
}

// File metadata
const file = Bun.file('data.txt');
console.log(file.size);  // bytes
console.log(file.type);  // MIME type
```

## SQLite (Built-in)

```typescript
import { Database } from 'bun:sqlite';

const db = new Database('app.db');

// Create table
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE
  )
`);

// Prepared statements (recommended)
const insert = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
insert.run('John', 'john@example.com');

const select = db.prepare('SELECT * FROM users WHERE id = ?');
const user = select.get(1);

// Query all
const all = db.prepare('SELECT * FROM users').all();

// Transaction
db.transaction(() => {
  insert.run('Alice', 'alice@example.com');
  insert.run('Bob', 'bob@example.com');
})();
```

## Environment Variables

```typescript
// .env file loaded automatically
const apiKey = Bun.env.API_KEY;
const port = Bun.env.PORT ?? '3000';

// process.env also works
const nodeEnv = process.env.NODE_ENV;
```

## Shell Commands

```typescript
import { $ } from 'bun';

// Simple command
const result = await $`ls -la`;
console.log(result.stdout.toString());

// With variables (auto-escaped)
const filename = 'my file.txt';
await $`cat ${filename}`;

// Piping
const files = await $`ls`.text();
const count = await $`echo ${files} | wc -l`.text();

// Error handling
try {
  await $`exit 1`;
} catch (error) {
  console.error('Command failed:', error.exitCode);
}
```

## Configuration (bunfig.toml)

```toml
# bunfig.toml

[install]
# Registry
registry = "https://registry.npmjs.org"

# Frozen lockfile in CI
frozenLockfile = true

[run]
# Shell for scripts
shell = "bash"

[test]
# Test configuration
coverage = true
coverageDir = "coverage"
```

## Node.js Compatibility

```typescript
// Most Node.js APIs work
import { readFile } from 'fs/promises';
import { createServer } from 'http';
import path from 'path';

// Some differences
import.meta.dir;  // __dirname equivalent
import.meta.file; // __filename equivalent

// Check runtime
const isBun = typeof Bun !== 'undefined';
```

---

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Node.js runtime specifics | `nodejs` skill |
| Hono framework | Framework-specific skill |
| Elysia framework | Framework-specific skill |
| TypeScript syntax | `typescript` skill |
| Testing strategies | `testing-vitest` skill |

---

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using node_modules/.bin | Not optimized for Bun | Use bunx instead |
| Ignoring compatibility | Some npm packages fail | Test compatibility |
| Complex routing in Bun.serve | Hard to maintain | Use Hono or Elysia |
| Not pinning versions | Breaking changes | Use bun.lockb |
| Mixing package managers | Inconsistent deps | Stick to bun |
| Not using built-in SQLite | Extra dependency | Use bun:sqlite |
| Blocking operations | Defeats performance | Use async APIs |
| Not using watch mode | Slow dev loop | Use --watch flag |

---

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Module not found" | npm compatibility issue | Check Bun compatibility list |
| "bun: command not found" | Not installed | Install Bun or add to PATH |
| Tests fail in Bun but not Jest | Different runtime | Check Bun-specific APIs |
| Slow install | Network/cache issue | Clear cache with bun pm cache |
| "Cannot find package" | Wrong specifier | Use npm: prefix for npm packages |
| Type errors with .ts files | tsconfig mismatch | Check Bun's default config |
| Build output incorrect | Wrong target | Set target in Bun.build |
| SQLite errors | Database locked | Close connections properly |

---

## Performance Comparison

| Task | Bun | Node.js |
|------|-----|---------|
| Install deps | ~2s | ~15s |
| Run TS file | <100ms | ~500ms (tsx) |
| HTTP requests/sec | ~100k | ~40k |
| Test execution | ~200ms | ~2s |

## Production Readiness

```dockerfile
# Dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

# Install deps
FROM base AS deps
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# Production
FROM base AS production
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./

USER bun
EXPOSE 3000
CMD ["bun", "run", "dist/index.js"]
```

## Checklist

- [ ] Bun installed (v1.0+)
- [ ] bunfig.toml configured
- [ ] Test suite with bun:test
- [ ] Build script configured
- [ ] Docker multi-stage for production
- [ ] npm package compatibility verified

---

## Reference Documentation
- [Bun Docs](https://bun.sh/docs)

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `bun` for comprehensive documentation.
