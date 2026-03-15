# Redis Patterns Quick Reference

> **Knowledge Base:** Read `knowledge/redis/patterns.md` for complete documentation.

## Caching Patterns

```javascript
// Cache-aside (Lazy loading)
async function getUser(id) {
  const cached = await redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);

  const user = await db.users.findById(id);
  await redis.setex(`user:${id}`, 3600, JSON.stringify(user));
  return user;
}

// Write-through
async function updateUser(id, data) {
  const user = await db.users.update(id, data);
  await redis.setex(`user:${id}`, 3600, JSON.stringify(user));
  return user;
}

// Cache invalidation
async function deleteUser(id) {
  await db.users.delete(id);
  await redis.del(`user:${id}`);
}
```

## Session Storage

```javascript
// Store session
await redis.setex(
  `session:${sessionId}`,
  86400, // 24 hours
  JSON.stringify({ userId, permissions })
);

// Get session
const session = JSON.parse(
  await redis.get(`session:${sessionId}`)
);

// Refresh TTL on activity
await redis.expire(`session:${sessionId}`, 86400);
```

## Rate Limiting

```javascript
// Fixed window
async function rateLimit(key, limit, window) {
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, window);
  }
  return current <= limit;
}

// Sliding window (more accurate)
async function slidingRateLimit(key, limit, window) {
  const now = Date.now();
  const pipe = redis.pipeline();

  pipe.zremrangebyscore(key, 0, now - window * 1000);
  pipe.zadd(key, now, `${now}`);
  pipe.zcard(key);
  pipe.expire(key, window);

  const [,, count] = await pipe.exec();
  return count <= limit;
}
```

## Distributed Locking

```javascript
// Acquire lock
async function acquireLock(resource, ttl = 10000) {
  const lockKey = `lock:${resource}`;
  const token = crypto.randomUUID();

  const acquired = await redis.set(
    lockKey, token, 'NX', 'PX', ttl
  );

  return acquired ? token : null;
}

// Release lock (Lua for atomicity)
const releaseLockScript = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

async function releaseLock(resource, token) {
  return redis.eval(releaseLockScript, 1, `lock:${resource}`, token);
}
```

## Leaderboard

```javascript
// Add/update score
await redis.zadd('leaderboard', score, odUserId);

// Get rank (0-based)
const rank = await redis.zrevrank('leaderboard', odUserId);

// Get top 10
const top10 = await redis.zrevrange('leaderboard', 0, 9, 'WITHSCORES');

// Get user's position with neighbors
async function getLeaderboardContext(userId, range = 2) {
  const rank = await redis.zrevrank('leaderboard', odUserId);
  const start = Math.max(0, rank - range);
  const end = rank + range;
  return redis.zrevrange('leaderboard', start, end, 'WITHSCORES');
}
```

## Job Queue

```javascript
// Producer: add job
await redis.lpush('queue:jobs', JSON.stringify({
  id: jobId,
  type: 'email',
  data: { to: 'user@example.com' }
}));

// Consumer: process jobs
async function processJobs() {
  while (true) {
    const [, job] = await redis.brpop('queue:jobs', 0);
    const { id, type, data } = JSON.parse(job);

    try {
      await handlers[type](data);
    } catch (error) {
      // Re-queue or move to dead letter
      await redis.lpush('queue:failed', job);
    }
  }
}
```

## Real-time Features

```javascript
// Online users tracking
await redis.sadd('online', userId);
await redis.expire(`online:${userId}`, 60); // Heartbeat

// Presence with pub/sub
await redis.publish('presence', JSON.stringify({
  userId,
  status: 'online'
}));

// Typing indicator (short TTL)
await redis.setex(`typing:${roomId}:${userId}`, 3, '1');
```

**Official docs:** https://redis.io/docs/manual/patterns/
