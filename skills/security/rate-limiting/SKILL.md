---
name: rate-limiting
description: |
  Rate limiting and throttling. Token bucket, sliding window, fixed window
  algorithms. Express rate limit, Spring rate limiting, Redis-based distributed
  rate limiting, and API quota management.

  USE WHEN: user mentions "rate limit", "throttle", "API quota", "too many requests",
  "429", "express-rate-limit", "sliding window", "token bucket"

  DO NOT USE FOR: circuit breaker patterns - use `resilience-patterns`;
  DDoS protection - use infrastructure/WAF solutions
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Rate Limiting

## Express (express-rate-limit)

```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });

// Global rate limit
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: new RedisStore({ sendCommand: (...args) => redis.sendCommand(args) }),
  message: { error: 'Too many requests, try again later' },
});

app.use(globalLimiter);

// Stricter limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => req.body.email || req.ip, // By email, not just IP
  store: new RedisStore({ sendCommand: (...args) => redis.sendCommand(args) }),
});

app.use('/api/auth/login', authLimiter);
```

## Redis Sliding Window (custom)

```typescript
async function isRateLimited(key: string, limit: number, windowSec: number): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - windowSec * 1000;

  const multi = redis.multi();
  multi.zRemRangeByScore(key, 0, windowStart);    // Remove old entries
  multi.zAdd(key, { score: now, value: `${now}` });
  multi.zCard(key);                                  // Count in window
  multi.expire(key, windowSec);

  const results = await multi.exec();
  const count = results![2] as number;
  return count > limit;
}

// Usage
if (await isRateLimited(`rl:${userId}`, 100, 60)) {
  return res.status(429).json({ error: 'Rate limit exceeded' });
}
```

## Algorithm Comparison

| Algorithm | Precision | Memory | Best For |
|-----------|-----------|--------|----------|
| Fixed window | Low (burst at edges) | Very low | Simple APIs |
| Sliding window log | High | Medium | Accurate limiting |
| Sliding window counter | Medium | Low | Balance of accuracy & memory |
| Token bucket | Medium | Low | Burst-friendly APIs |

## Spring Boot (Bucket4j)

```java
@Bean
public FilterRegistrationBean<RateLimitFilter> rateLimitFilter() {
    var filter = new RateLimitFilter(
        Bandwidth.classic(100, Refill.intervally(100, Duration.ofMinutes(1)))
    );
    var registration = new FilterRegistrationBean<>(filter);
    registration.addUrlPatterns("/api/*");
    return registration;
}
```

## Response Headers

```typescript
// Standard rate limit headers (RFC draft-7)
res.set({
  'RateLimit-Limit': '100',
  'RateLimit-Remaining': `${remaining}`,
  'RateLimit-Reset': `${resetTimestamp}`,
  'Retry-After': `${retryAfterSeconds}`, // On 429 responses
});
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| In-memory rate limiting in multi-server | Use Redis-backed store |
| Rate limit by IP only | Also limit by user ID or API key |
| No rate limit headers in response | Send RateLimit-* headers for client awareness |
| Same limit for all endpoints | Tighter limits on auth, webhooks, expensive ops |
| No Retry-After on 429 | Include Retry-After header |

## Production Checklist

- [ ] Redis-backed rate limiting for distributed deployments
- [ ] Per-endpoint rate limit configuration
- [ ] Standard rate limit headers in responses
- [ ] Retry-After header on 429 responses
- [ ] Rate limit by user ID (not just IP)
- [ ] Monitoring: rate limit hit frequency
