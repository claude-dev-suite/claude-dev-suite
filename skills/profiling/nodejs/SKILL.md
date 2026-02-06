---
name: nodejs-profiling
description: |
  Node.js performance profiling with V8 CPU profiler, heap analysis,
  and perf_hooks. Use for identifying bottlenecks and memory leaks.

  USE WHEN: user mentions "Node.js performance", "profiling", "memory leak", asks about "V8 profiler", "heap snapshot", "CPU profile", "perf_hooks", "event loop lag", "Node.js optimization"

  DO NOT USE FOR: Java/Python profiling - use respective skills instead
allowed-tools: Read, Grep, Glob, Bash, mcp__performance_profiler__*
---
# Node.js Performance Profiling

## When NOT to Use This Skill

- **Java/JVM profiling** - Use the `java-profiling` skill for JFR, jcmd, and GC tuning
- **Python profiling** - Use the `python-profiling` skill for cProfile and memory_profiler
- **Frontend performance** - Use browser DevTools for client-side profiling
- **Database query optimization** - Use database-specific profiling tools
- **Network performance** - Use tools like curl, ab, or specialized load testers

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `nodejs` for comprehensive profiling guides, V8 flags, and optimization techniques.

## V8 CPU Profiling

### Command Line Profiling

```bash
# CPU profile (generates .cpuprofile)
node --cpu-prof --cpu-prof-dir=./profiles app.js

# V8 profile (generates .log)
node --prof app.js
node --prof-process isolate-*.log > processed.txt

# Heap snapshot on signal
node --heapsnapshot-signal=SIGUSR2 app.js
kill -USR2 <pid>
```

### Programmatic Profiling

```typescript
import { Session } from 'inspector';
import { writeFileSync } from 'fs';

const session = new Session();
session.connect();

// Start CPU profiling
session.post('Profiler.enable');
session.post('Profiler.start');

// Your code here...

// Stop and get profile
session.post('Profiler.stop', (err, { profile }) => {
  writeFileSync('profile.cpuprofile', JSON.stringify(profile));
});
```

## Memory Analysis

### Heap Statistics

```typescript
import v8 from 'v8';

const heapStats = v8.getHeapStatistics();
console.log({
  heapUsed: heapStats.used_heap_size,
  heapTotal: heapStats.total_heap_size,
  heapLimit: heapStats.heap_size_limit,
  external: heapStats.external_memory,
});

// Detailed heap space info
const heapSpaces = v8.getHeapSpaceStatistics();
heapSpaces.forEach(space => {
  console.log(`${space.space_name}: ${space.space_used_size}`);
});
```

### Memory Tracking

```typescript
import { performance, PerformanceObserver } from 'perf_hooks';

// Track memory at intervals
const memoryTracker = setInterval(() => {
  const usage = process.memoryUsage();
  console.log({
    rss: usage.rss,           // Resident Set Size
    heapTotal: usage.heapTotal,
    heapUsed: usage.heapUsed,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers,
  });
}, 1000);
```

## High-Resolution Timing

### perf_hooks API

```typescript
import { performance, PerformanceObserver } from 'perf_hooks';

// Mark start/end
performance.mark('operation-start');
await someOperation();
performance.mark('operation-end');

// Measure duration
performance.measure('operation', 'operation-start', 'operation-end');

// Observer for async measurements
const obs = new PerformanceObserver((list) => {
  const entries = list.getEntries();
  entries.forEach(entry => {
    console.log(`${entry.name}: ${entry.duration}ms`);
  });
});
obs.observe({ entryTypes: ['measure', 'function'] });

// Cleanup
performance.clearMarks();
performance.clearMeasures();
```

### Async Context Tracking

```typescript
import { AsyncLocalStorage, AsyncResource } from 'async_hooks';

const storage = new AsyncLocalStorage<{ requestId: string }>();

// Track request timing across async operations
function trackRequest(requestId: string) {
  storage.run({ requestId }, async () => {
    const start = performance.now();
    await handleRequest();
    const duration = performance.now() - start;
    console.log(`Request ${requestId}: ${duration}ms`);
  });
}
```

## Common Bottleneck Patterns

### CPU-Bound Issues

```typescript
// ❌ Bad: Blocking the event loop
function processLargeArray(arr: number[]): number {
  return arr.reduce((sum, n) => sum + expensiveComputation(n), 0);
}

// ✅ Good: Use worker threads
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

if (isMainThread) {
  const worker = new Worker(__filename, { workerData: largeArray });
  worker.on('message', (result) => console.log(result));
} else {
  const result = workerData.reduce((sum, n) => sum + expensiveComputation(n), 0);
  parentPort?.postMessage(result);
}
```

### I/O-Bound Issues

```typescript
// ❌ Bad: Sequential I/O
for (const file of files) {
  await fs.readFile(file);  // One at a time
}

// ✅ Good: Parallel I/O with concurrency limit
import pLimit from 'p-limit';
const limit = pLimit(10);

await Promise.all(
  files.map(file => limit(() => fs.readFile(file)))
);
```

### Memory Leaks

```typescript
// ❌ Bad: Unbounded cache
const cache = new Map();
function getUser(id: string) {
  if (!cache.has(id)) {
    cache.set(id, fetchUser(id));  // Never cleaned up
  }
  return cache.get(id);
}

// ✅ Good: LRU cache with max size
import { LRUCache } from 'lru-cache';
const cache = new LRUCache<string, User>({
  max: 1000,
  ttl: 1000 * 60 * 5,  // 5 minutes
});

// ❌ Bad: Event listener leak
element.addEventListener('click', handler);  // Never removed

// ✅ Good: Cleanup listeners
const abortController = new AbortController();
element.addEventListener('click', handler, { signal: abortController.signal });
// Later: abortController.abort();
```

### GC Pressure

```typescript
// ❌ Bad: Creating many temporary objects
function process(items: Item[]) {
  return items.map(item => ({
    ...item,
    computed: compute(item),
  }));
}

// ✅ Good: Mutate in place when safe
function process(items: Item[]) {
  for (const item of items) {
    item.computed = compute(item);
  }
  return items;
}

// ✅ Good: Object pooling
class ObjectPool<T> {
  private pool: T[] = [];

  acquire(): T {
    return this.pool.pop() || this.create();
  }

  release(obj: T) {
    this.reset(obj);
    this.pool.push(obj);
  }
}
```

## Optimization Techniques

### Buffer Optimization

```typescript
// ❌ Bad: Many small allocations
const chunks: Buffer[] = [];
for (const data of stream) {
  chunks.push(Buffer.from(data));
}
const result = Buffer.concat(chunks);

// ✅ Good: Pre-allocate when size known
const buffer = Buffer.allocUnsafe(totalSize);  // Faster, uninitialized
let offset = 0;
for (const data of stream) {
  offset += data.copy(buffer, offset);
}
```

### Stream Processing

```typescript
// ❌ Bad: Loading entire file in memory
const data = await fs.readFile('large-file.json');
const parsed = JSON.parse(data);

// ✅ Good: Stream processing
import { createReadStream } from 'fs';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';

const pipeline = createReadStream('large-file.json')
  .pipe(parser())
  .pipe(streamArray());

for await (const { value } of pipeline) {
  await processItem(value);
}
```

### V8 Optimization Hints

```typescript
// Force V8 to optimize a function
function criticalFunction(x: number): number {
  // Called many times with same types
  return x * 2;
}
// Warm up
for (let i = 0; i < 10000; i++) criticalFunction(i);

// Avoid deoptimization patterns:
// - Don't change object shapes after creation
// - Don't use delete on object properties
// - Don't use arguments object, use rest parameters
// - Don't use with statement
// - Keep function polymorphism low
```

## Profiling Checklist

| Check | Tool | Command |
|-------|------|---------|
| CPU hotspots | CPU profile | `node --cpu-prof app.js` |
| Memory usage | Heap stats | `v8.getHeapStatistics()` |
| Memory leaks | Heap snapshot | `--heapsnapshot-signal` |
| Event loop lag | perf_hooks | `monitorEventLoopDelay()` |
| Async operations | Async hooks | `async_hooks` module |
| Function timing | perf_hooks | `performance.measure()` |

## GC Tuning

```bash
# Increase heap size
node --max-old-space-size=4096 app.js

# GC logging
node --trace-gc app.js

# Expose GC for manual control
node --expose-gc app.js
# In code: global.gc();
```

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|-------------|----------------|------------------|
| Using `setImmediate()` for CPU work | Blocks event loop | Use worker threads for CPU-intensive tasks |
| Synchronous file operations | Blocks entire process | Use async `fs.promises` API |
| Large synchronous JSON parsing | Freezes event loop | Stream large JSON or use worker threads |
| Callback hell | Hard to profile, error-prone | Use async/await for cleaner async code |
| Not using connection pooling | Creates too many connections | Use connection pools (pg, mysql2) |
| `console.log()` in production | Slow, blocks event loop | Use structured logging (pino, winston) |
| Loading entire file into memory | Memory exhaustion | Use streams for large files |
| Manual cache without TTL/limits | Memory leaks | Use LRU cache with size/time limits |
| Not monitoring event loop lag | Undetected performance degradation | Use `perf_hooks.monitorEventLoopDelay()` |
| `delete` on object properties | Deoptimizes objects | Set to `undefined` or use Map |

## Quick Troubleshooting

| Issue | Diagnosis | Solution |
|-------|-----------|----------|
| High CPU usage | Tight loops, inefficient algorithms | Profile with `--cpu-prof`, optimize hot paths |
| Memory growing continuously | Memory leak (unbounded cache, listeners) | Take heap snapshots, compare over time |
| Event loop lag | Long synchronous operations | Use worker threads or break into async chunks |
| GC pauses causing latency spikes | Heap too large or fragmented | Reduce heap size, optimize object creation |
| Slow startup time | Too many synchronous requires | Lazy load modules, use dynamic imports |
| `FATAL ERROR: CALL_AND_RETRY_LAST` | Out of memory | Increase `--max-old-space-size` or fix memory leak |
| High memory usage | Large buffers, string operations | Use streams, avoid string concatenation |
| Unhandled promise rejections | Async errors not caught | Add `.catch()` or use try/catch with async/await |
| Function not optimized by V8 | Contains deopt triggers | Check with `--trace-deopt`, avoid problematic patterns |
| Slow JSON operations | Large payloads | Stream JSON or use faster parsers (simdjson) |
