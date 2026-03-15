# Backend Performance Quick Reference

> **Knowledge Base:** Read `knowledge/performance/backend.md` for complete documentation.

## Database Optimization

```sql
-- Indexing
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_orders_user_date ON orders(user_id, created_at DESC);

-- Explain analyze queries
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'test@example.com';

-- Avoid SELECT *
SELECT id, name, email FROM users WHERE status = 'active';

-- Use LIMIT
SELECT * FROM logs ORDER BY created_at DESC LIMIT 100;

-- Batch operations
INSERT INTO users (name, email) VALUES
  ('John', 'john@example.com'),
  ('Jane', 'jane@example.com'),
  ('Bob', 'bob@example.com');

-- Pagination with cursor (faster than OFFSET)
SELECT * FROM posts
WHERE id > :last_id
ORDER BY id
LIMIT 20;
```

## N+1 Query Prevention

```typescript
// BAD: N+1 queries
const users = await prisma.user.findMany();
for (const user of users) {
  const posts = await prisma.post.findMany({ where: { authorId: user.id } });
}

// GOOD: Eager loading
const users = await prisma.user.findMany({
  include: { posts: true }
});

// GOOD: DataLoader batching
const postsByAuthorLoader = new DataLoader(async (authorIds) => {
  const posts = await prisma.post.findMany({
    where: { authorId: { in: authorIds } }
  });
  return authorIds.map(id => posts.filter(p => p.authorId === id));
});
```

## Caching Strategies

```typescript
// In-memory cache (simple)
const cache = new Map<string, { data: any; expiry: number }>();

async function getCached<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = cache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  const data = await fetcher();
  cache.set(key, { data, expiry: Date.now() + ttl });
  return data;
}

// Redis caching
async function getUser(id: string): Promise<User> {
  const cacheKey = `user:${id}`;

  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Fetch from database
  const user = await prisma.user.findUnique({ where: { id } });

  // Store in cache
  await redis.setex(cacheKey, 3600, JSON.stringify(user));

  return user;
}

// Cache invalidation
async function updateUser(id: string, data: UpdateData): Promise<User> {
  const user = await prisma.user.update({ where: { id }, data });
  await redis.del(`user:${id}`);
  return user;
}
```

## Connection Pooling

```typescript
// PostgreSQL with connection pool
import { Pool } from 'pg';

const pool = new Pool({
  max: 20,               // Max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Prisma connection pool
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // connection_limit in URL: ?connection_limit=20
}

// HTTP client pooling
import { Agent } from 'https';

const agent = new Agent({
  keepAlive: true,
  maxSockets: 100,
  maxFreeSockets: 10,
  timeout: 60000,
});
```

## Async Processing

```typescript
// Background jobs with queue
import Bull from 'bull';

const emailQueue = new Bull('email', {
  redis: { host: 'localhost', port: 6379 }
});

// Producer
await emailQueue.add({
  to: 'user@example.com',
  subject: 'Welcome!',
  body: '...'
});

// Consumer
emailQueue.process(async (job) => {
  await sendEmail(job.data);
});

// Batch processing
async function processInBatches<T>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await processor(batch);
  }
}

// Parallel with concurrency limit
import pLimit from 'p-limit';

const limit = pLimit(5); // Max 5 concurrent
const results = await Promise.all(
  items.map(item => limit(() => processItem(item)))
);
```

## HTTP Optimization

```typescript
// Compression
import compression from 'compression';
app.use(compression());

// Response caching
app.get('/api/products', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300'); // 5 minutes
  res.json(products);
});

// ETags
app.use(express.static('public', { etag: true }));

// Streaming large responses
app.get('/api/export', (req, res) => {
  res.setHeader('Content-Type', 'text/csv');

  const cursor = db.collection.find().cursor();
  cursor.on('data', (doc) => res.write(formatCSV(doc)));
  cursor.on('end', () => res.end());
});

// Pagination
app.get('/api/users', async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count(),
  ]);

  res.json({
    data: users,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});
```

## Memory Management

```typescript
// Stream large files
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';

app.get('/download/:id', async (req, res) => {
  const filePath = await getFilePath(req.params.id);
  const stream = createReadStream(filePath);
  await pipeline(stream, res);
});

// Process large JSON incrementally
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';

const pipeline = fs.createReadStream('large.json')
  .pipe(parser())
  .pipe(streamArray());

for await (const { value } of pipeline) {
  await processItem(value);
}

// Avoid memory leaks
class Service {
  private cache = new Map();
  private maxSize = 1000;

  set(key: string, value: any) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}
```

## Monitoring

```typescript
// Response time tracking
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    metrics.histogram('http_request_duration', duration, {
      method: req.method,
      path: req.route?.path,
      status: res.statusCode,
    });
  });
  next();
});

// Health check
app.get('/health', async (req, res) => {
  const health = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: await checkDatabase(),
    redis: await checkRedis(),
  };
  res.json(health);
});
```

**Tools:** APM (New Relic, Datadog), k6, Artillery, Prometheus
