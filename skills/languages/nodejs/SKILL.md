---
name: nodejs
description: |
  Node.js runtime best practices. Covers event loop, async patterns, streams,
  worker threads, memory management, and production optimization.

  USE WHEN: user mentions "node.js", "event loop", "streams", "worker threads",
  asks about "process.nextTick", "memory leaks", "cluster mode", "async patterns"

  DO NOT USE FOR: Express/NestJS frameworks - use framework-specific skills
  DO NOT USE FOR: Language syntax - use `javascript` or `typescript` skills
  DO NOT USE FOR: Package management - use npm/pnpm/yarn skills
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---
# Node.js Best Practices

> **Full Reference**: See [advanced.md](advanced.md) for worker pool pattern, memory management, cluster mode, graceful shutdown, and performance flags.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `nodejs` for comprehensive documentation.

## Event Loop

### Phases

```
   ┌───────────────────────────┐
┌─>│           timers          │  ← setTimeout, setInterval
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │     pending callbacks     │  ← I/O callbacks
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │           poll            │  ← incoming I/O
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │           check           │  ← setImmediate
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
└──┤      close callbacks      │
   └───────────────────────────┘
```

### Priority Order

```
sync code > process.nextTick > Promises (microtasks) > timers > setImmediate
```

### Don't Block the Event Loop

```typescript
// BAD - blocks event loop
function hashSync(data: string): string {
  return crypto.pbkdf2Sync(data, 'salt', 100000, 64, 'sha512').toString('hex');
}

// GOOD - use async version
async function hashAsync(data: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(data, 'salt', 100000, 64, 'sha512', (err, key) => {
      if (err) reject(err);
      else resolve(key.toString('hex'));
    });
  });
}
```

## Async Patterns

```typescript
// GOOD - parallel execution
const [users, posts] = await Promise.all([
  fetchUsers(),
  fetchPosts()
]);

// BAD - sequential when parallel is possible
const users = await fetchUsers();
const posts = await fetchPosts(); // waits unnecessarily

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});
```

## Streams (Pipeline)

```typescript
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { createGzip } from 'zlib';

// GOOD - handles errors and cleanup
await pipeline(
  createReadStream('input.txt'),
  createGzip(),
  createWriteStream('output.txt.gz')
);
```

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Express.js framework | `backend-express` skill |
| NestJS framework | `backend-nestjs` skill |
| JavaScript/TypeScript syntax | `javascript` or `typescript` skills |
| Testing | `testing-vitest` or `testing-jest` skills |
| Database operations | Database-specific skills |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Blocking the event loop | Freezes all requests | Use async APIs or workers |
| Not handling rejections | Silent failures | Use process.on('unhandledRejection') |
| Synchronous file I/O | Blocks event loop | Use async fs methods |
| Unbounded caches | Memory leaks | Use LRU cache with limits |
| Not removing event listeners | Memory leaks | Use .off() or .removeListener() |
| Nested callbacks | Callback hell | Use async/await |
| Large sync JSON.parse | Blocks event loop | Stream parsing or workers |
| No concurrency limits | Resource exhaustion | Use p-limit or semaphores |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| High event loop lag | Blocking operations | Profile with --inspect, use workers |
| Memory leak | Unbounded cache/listeners | Use heap snapshots, fix leaks |
| "EADDRINUSE" | Port already in use | Kill process or use different port |
| "EMFILE: too many open files" | File descriptor leak | Close files, increase ulimit |
| Process crashes on error | Uncaught exception | Add error handlers |
| Slow startup | Too many sync operations | Make initialization async |
| High CPU usage | Infinite loop or blocking | Profile with --cpu-prof |
| "MaxListenersExceededWarning" | Too many listeners | Remove old listeners |

## Checklist

### Development
- [ ] Use async/await over callbacks
- [ ] Handle all Promise rejections
- [ ] Use streams for large data
- [ ] Limit concurrent operations
- [ ] Remove event listeners when done

### Production
- [ ] Use cluster mode or PM2
- [ ] Implement graceful shutdown
- [ ] Set appropriate heap size
- [ ] Monitor memory usage
- [ ] Use connection pooling
- [ ] Enable keep-alive for HTTP

### Metrics

| Metric | Target |
|--------|--------|
| Event loop lag | < 100ms |
| Heap usage | < 70% of limit |
| Active handles | Stable |
| GC pause | < 100ms |

## Reference Documentation

- [TypeScript](../typescript/SKILL.md)
- [Performance](../../best-practices/performance/SKILL.md)
