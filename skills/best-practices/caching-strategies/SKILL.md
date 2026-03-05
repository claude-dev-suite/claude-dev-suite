---
name: caching-strategies
description: |
  Application caching patterns. Redis caching, in-memory caches, HTTP caching,
  cache invalidation strategies, cache-aside, write-through, and CDN caching.

  USE WHEN: user mentions "caching", "cache invalidation", "Redis cache",
  "HTTP cache", "CDN caching", "cache-aside", "write-through", "TTL",
  "stale-while-revalidate"

  DO NOT USE FOR: Redis as database/queue - use `redis` or `job-queues`;
  browser storage - use frontend skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Caching Strategies

## Cache-Aside (Lazy Loading) — Most Common

```typescript
async function getUser(id: string): Promise<User> {
  const cached = await redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);

  const user = await db.user.findUnique({ where: { id } });
  if (user) {
    await redis.set(`user:${id}`, JSON.stringify(user), 'EX', 3600); // 1h TTL
  }
  return user;
}

// Invalidate on update
async function updateUser(id: string, data: UpdateUserDto): Promise<User> {
  const user = await db.user.update({ where: { id }, data });
  await redis.del(`user:${id}`);
  return user;
}
```

## Write-Through

```typescript
async function updateProduct(id: string, data: UpdateDto): Promise<Product> {
  const product = await db.product.update({ where: { id }, data });
  await redis.set(`product:${id}`, JSON.stringify(product), 'EX', 3600);
  return product;
}
```

## HTTP Caching

```typescript
// Express middleware
app.get('/api/products', (req, res) => {
  res.set({
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    'ETag': generateETag(products),
  });
  res.json(products);
});

// Conditional requests
app.get('/api/products/:id', (req, res) => {
  const product = getProduct(req.params.id);
  const etag = generateETag(product);

  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  res.set({ ETag: etag, 'Cache-Control': 'private, max-age=0, must-revalidate' });
  res.json(product);
});
```

### Cache-Control Cheat Sheet

| Directive | Use Case |
|-----------|----------|
| `public, max-age=3600` | Static assets, CDN-cacheable |
| `private, max-age=60` | User-specific data |
| `no-cache` | Always revalidate (ETag/Last-Modified) |
| `no-store` | Sensitive data (banking, health) |
| `stale-while-revalidate=300` | Serve stale, refresh in background |

## Redis Caching Patterns

```typescript
// Hash for structured data
await redis.hset(`user:${id}`, { name, email, plan });
const user = await redis.hgetall(`user:${id}`);

// Sorted set for leaderboards
await redis.zadd('leaderboard', score, `user:${id}`);
const top10 = await redis.zrevrange('leaderboard', 0, 9, 'WITHSCORES');

// Cache with refresh-ahead
async function getWithRefresh<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = await redis.get(key);
  if (cached) {
    const { data, expiresAt } = JSON.parse(cached);
    // Refresh in background if nearing expiry
    if (Date.now() > expiresAt - ttl * 200) {
      fetcher().then((fresh) =>
        redis.set(key, JSON.stringify({ data: fresh, expiresAt: Date.now() + ttl * 1000 }), 'EX', ttl)
      );
    }
    return data;
  }
  const data = await fetcher();
  await redis.set(key, JSON.stringify({ data, expiresAt: Date.now() + ttl * 1000 }), 'EX', ttl);
  return data;
}
```

## Invalidation Strategies

| Strategy | Description |
|----------|-------------|
| TTL-based | Set expiration, tolerate staleness |
| Event-driven | Invalidate on write events |
| Tag-based | Group keys by tag, purge by tag |
| Versioned keys | `user:v2:${id}` — change version to invalidate all |

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| No TTL on cache entries | Always set TTL to prevent stale data |
| Cache stampede (many misses at once) | Use locking or stale-while-revalidate |
| Caching mutable data without invalidation | Invalidate on writes or use short TTL |
| Caching everything | Cache hot data only; measure hit rates |
| Serializing large objects | Cache only needed fields |

## Production Checklist

- [ ] TTL set on all cache entries
- [ ] Cache invalidation on data mutations
- [ ] Hit rate monitoring (aim for >90%)
- [ ] Memory limits configured on Redis
- [ ] Cache key naming convention documented
- [ ] Graceful fallback when cache unavailable
