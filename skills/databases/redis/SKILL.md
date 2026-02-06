---
name: redis
description: |
  Redis in-memory data store. Covers data structures, caching,
  and pub/sub. Use for caching and real-time features.

  USE WHEN: user mentions "redis", "caching", "session storage", "rate limiting",
  "pub/sub", "sorted sets", "in-memory database", "cache invalidation"

  DO NOT USE FOR: relational data - use `postgresql` or `mysql` instead,
  document storage - use `mongodb` instead, full-text search - use `elasticsearch` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Redis Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `redis` for comprehensive documentation.

## Data Types

### Strings
```redis
SET user:1:name "John"
GET user:1:name
SETEX session:abc 3600 "user_data"  # Expires in 1h
INCR page:views
```

### Hashes
```redis
HSET user:1 name "John" email "john@example.com"
HGET user:1 name
HGETALL user:1
HINCRBY user:1 loginCount 1
```

### Lists
```redis
LPUSH notifications:1 "New message"
RPUSH queue:jobs '{"task": "send_email"}'
LRANGE notifications:1 0 9
LPOP queue:jobs
```

### Sets
```redis
SADD user:1:roles "admin" "editor"
SISMEMBER user:1:roles "admin"
SMEMBERS user:1:roles
SINTER user:1:friends user:2:friends  # Common friends
```

### Sorted Sets
```redis
ZADD leaderboard 100 "user:1" 200 "user:2"
ZRANGE leaderboard 0 9 REV WITHSCORES  # Top 10
ZINCRBY leaderboard 10 "user:1"
```

## Common Patterns

### Caching
```javascript
async function getUser(id) {
  const cached = await redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);

  const user = await db.users.find(id);
  await redis.setex(`user:${id}`, 3600, JSON.stringify(user));
  return user;
}
```

### Rate Limiting
```javascript
async function rateLimit(ip) {
  const key = `ratelimit:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  return count <= 100;
}
```

## Production Readiness

### Connection Configuration

```typescript
// redis.ts
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),

  // Connection pool
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 10) return null; // Stop retrying
    return Math.min(times * 100, 3000);
  },

  // TLS for production
  tls: process.env.NODE_ENV === 'production' ? {} : undefined,

  // Keep-alive
  keepAlive: 30000,
  connectTimeout: 10000,
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected');
});

export { redis };
```

### Cache Patterns

```typescript
// Generalized cache-aside pattern
async function cacheAside<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) {
    return JSON.parse(cached);
  }

  const data = await fetcher();
  await redis.setex(key, ttl, JSON.stringify(data));
  return data;
}

// Cache invalidation
async function invalidatePattern(pattern: string): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

// Example usage
const user = await cacheAside(
  `user:${id}`,
  3600, // 1 hour TTL
  () => db.users.findUnique({ where: { id } })
);

// On user update
await invalidatePattern(`user:${id}*`);
```

### Rate Limiting (Sliding Window)

```typescript
async function slidingWindowRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  const multi = redis.multi();
  multi.zremrangebyscore(key, 0, windowStart);
  multi.zadd(key, now, `${now}-${Math.random()}`);
  multi.zcard(key);
  multi.expire(key, windowSeconds);

  const results = await multi.exec();
  const count = results?.[2]?.[1] as number;

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
  };
}
```

### Session Storage

```typescript
interface SessionData {
  userId: string;
  roles: string[];
  createdAt: number;
}

async function createSession(userId: string, roles: string[]): Promise<string> {
  const sessionId = crypto.randomUUID();
  const session: SessionData = {
    userId,
    roles,
    createdAt: Date.now(),
  };

  await redis.setex(
    `session:${sessionId}`,
    86400, // 24 hours
    JSON.stringify(session)
  );

  return sessionId;
}

async function getSession(sessionId: string): Promise<SessionData | null> {
  const data = await redis.get(`session:${sessionId}`);
  return data ? JSON.parse(data) : null;
}

async function deleteSession(sessionId: string): Promise<void> {
  await redis.del(`session:${sessionId}`);
}
```

### Distributed Locking

```typescript
async function acquireLock(
  resource: string,
  ttlMs: number
): Promise<string | null> {
  const lockId = crypto.randomUUID();
  const result = await redis.set(
    `lock:${resource}`,
    lockId,
    'PX',
    ttlMs,
    'NX'
  );
  return result === 'OK' ? lockId : null;
}

async function releaseLock(resource: string, lockId: string): Promise<boolean> {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  const result = await redis.eval(script, 1, `lock:${resource}`, lockId);
  return result === 1;
}
```

### Monitoring

```typescript
// Health check
async function healthCheck(): Promise<{ status: string; latency: number }> {
  const start = Date.now();
  await redis.ping();
  return {
    status: 'healthy',
    latency: Date.now() - start,
  };
}

// Key metrics
async function getMetrics() {
  const info = await redis.info('stats');
  const memory = await redis.info('memory');
  return { info, memory };
}
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Connection pool usage | < 80% |
| Cache hit ratio | > 90% |
| Latency (p99) | < 5ms |
| Memory usage | < 80% max |

### Checklist

- [ ] Connection pooling configured
- [ ] TLS enabled in production
- [ ] Retry strategy with backoff
- [ ] Password authentication
- [ ] Key expiration on all cached data
- [ ] Cache invalidation strategy
- [ ] Rate limiting implemented
- [ ] Distributed locking for critical sections
- [ ] Health check endpoint
- [ ] Memory monitoring alerts

## When NOT to Use This Skill

- **Relational data** - Use `postgresql` or `mysql` for structured data with relationships
- **Document storage** - Use `mongodb` for complex document structures
- **Full-text search** - Use `elasticsearch` for search indexing and analytics
- **Primary database** - Redis is for caching/sessions, not as main data store
- **Large objects** - Store references in Redis, data in object storage

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| No TTL on keys | Memory leak, unbounded growth | Always set expiration with SETEX or EXPIRE |
| Storing large objects | Performance degradation, memory pressure | Keep values small (<100KB), use compression |
| Using KEYS in production | Blocks server, O(N) operation | Use SCAN for iteration |
| No connection pooling | Connection exhaustion | Configure pool (ioredis, node-redis) |
| Ignoring eviction policy | Random data loss when full | Set appropriate policy (allkeys-lru) |
| Single Redis instance | Single point of failure | Use Redis Cluster or Sentinel |
| No password in production | Security vulnerability | Always configure AUTH |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Memory full | `INFO memory`, `MEMORY STATS` | Increase maxmemory, set eviction policy |
| Slow responses | `SLOWLOG GET 10` | Optimize queries, use pipelining |
| Connection refused | Check `maxclients` limit | Increase limit or fix connection leaks |
| High latency | `redis-cli --latency` | Check network, enable keep-alive |
| Keys not expiring | `TTL key` returns -1 | Set TTL on keys, check PERSIST calls |
| Replication lag | `INFO replication` | Check network, reduce write load |

## Reference Documentation
- [Data Patterns](quick-ref/patterns.md)
- [Pub/Sub](quick-ref/pubsub.md)
