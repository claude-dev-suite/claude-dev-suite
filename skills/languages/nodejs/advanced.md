# Node.js Advanced Patterns

## Worker Pool Pattern

```typescript
import { Worker } from 'worker_threads';
import { cpus } from 'os';

class WorkerPool {
  private workers: Worker[] = [];
  private queue: Array<{
    task: unknown;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }> = [];
  private freeWorkers: Worker[] = [];

  constructor(workerPath: string, size = cpus().length) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(workerPath);
      worker.on('message', (result) => {
        this.freeWorkers.push(worker);
        this.processQueue();
      });
      this.workers.push(worker);
      this.freeWorkers.push(worker);
    }
  }

  async execute<T>(task: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.queue.length === 0 || this.freeWorkers.length === 0) return;

    const worker = this.freeWorkers.pop()!;
    const { task, resolve, reject } = this.queue.shift()!;

    worker.once('message', resolve);
    worker.once('error', reject);
    worker.postMessage(task);
  }
}
```

---

## Memory Monitoring

```typescript
// Memory usage
const used = process.memoryUsage();
console.log({
  heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
  heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
  external: `${Math.round(used.external / 1024 / 1024)}MB`,
  rss: `${Math.round(used.rss / 1024 / 1024)}MB`
});

// V8 heap statistics
import v8 from 'v8';
const heapStats = v8.getHeapStatistics();
console.log({
  heapSizeLimit: `${Math.round(heapStats.heap_size_limit / 1024 / 1024)}MB`,
  totalAvailable: `${Math.round(heapStats.total_available_size / 1024 / 1024)}MB`
});
```

---

## Common Memory Leaks and Fixes

```typescript
// LEAK - unbounded cache
const cache = new Map();
function getUser(id: string) {
  if (!cache.has(id)) {
    cache.set(id, fetchUser(id)); // Never cleared!
  }
  return cache.get(id);
}

// FIX - LRU cache with max size
import { LRUCache } from 'lru-cache';
const cache = new LRUCache<string, User>({ max: 1000 });

// LEAK - event listeners not removed
class MyEmitter extends EventEmitter {
  start() {
    process.on('SIGINT', this.cleanup); // Leaks on each call!
  }
}

// FIX - remove listeners
class MyEmitter extends EventEmitter {
  private boundCleanup = this.cleanup.bind(this);

  start() {
    process.on('SIGINT', this.boundCleanup);
  }

  stop() {
    process.off('SIGINT', this.boundCleanup);
  }
}

// LEAK - closures holding references
function createHandler(largeData: Buffer) {
  return () => {
    // largeData captured in closure, never released
    console.log('Handler called');
  };
}

// FIX - extract only what's needed
function createHandler(dataSize: number) {
  return () => {
    console.log(`Handler called, original size: ${dataSize}`);
  };
}
```

---

## Cluster Mode

```typescript
import cluster from 'cluster';
import { cpus } from 'os';
import http from 'http';

if (cluster.isPrimary) {
  const numCPUs = cpus().length;

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died, restarting...`);
    cluster.fork();
  });
} else {
  http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Hello World\n');
  }).listen(8000);
}
```

---

## Graceful Shutdown

```typescript
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, shutting down gracefully...`);

  // Stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed');
  });

  // Close database connections
  await db.close();

  // Close other resources
  await redis.quit();

  // Force exit after timeout
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);

  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

---

## Performance Flags

```bash
# Production flags
node \
  --max-old-space-size=4096 \      # Heap size in MB
  --optimize-for-size \             # Optimize for memory
  --gc-interval=100 \               # GC every N allocations
  --expose-gc \                     # Allow manual GC
  app.js

# Profiling
node --prof app.js
node --prof-process isolate-*.log > processed.txt

# Heap snapshot
node --inspect app.js
# In Chrome DevTools: Memory tab > Take snapshot

# Command line snapshot
node --heapsnapshot-signal=SIGUSR2 app.js
kill -USR2 <pid>
```

---

## Concurrency Control

```typescript
import pLimit from 'p-limit';

// Limit concurrent operations
const limit = pLimit(5); // max 5 concurrent

const results = await Promise.all(
  urls.map(url => limit(() => fetch(url)))
);

// Manual semaphore
class Semaphore {
  private queue: (() => void)[] = [];
  private running = 0;

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return;
    }
    await new Promise<void>(resolve => this.queue.push(resolve));
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }
}
```
