---
name: performance
description: |
  Web performance optimization. Covers frontend, backend, and
  database optimization. Use for performance reviews.

  USE WHEN: user mentions "performance", "slow", "optimization", "Core Web Vitals", "LCP", "INP", "CLS",
  "bundle size", "lazy load", "caching", "N+1 query", "memory leak", asks about "how to speed up",
  "improve performance", "reduce load time", "database optimization"

  DO NOT USE FOR: Algorithm complexity - use computer science fundamentals,
  Code quality/readability - use `clean-code` instead,
  Security optimization - use security-specific skills
allowed-tools: Read, Grep, Glob
---
# Performance Optimization

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `performance` for comprehensive documentation.

## When NOT to Use This Skill

This skill focuses on runtime performance optimization. Do NOT use for:

- **Algorithm optimization** - Use computer science/data structures fundamentals
- **Code readability** - Use `clean-code` skill (don't sacrifice readability for micro-optimizations)
- **Build time optimization** - Use build tool specific skills (Vite, Webpack, etc.)
- **Developer experience** - Use DX-focused skills and tooling
- **Security hardening** - Use security-specific skills (performance != security)

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Performance Solution |
|--------------|--------------|---------------------|
| **Premature Optimization** | Waste time on non-bottlenecks | Measure first, optimize bottlenecks only |
| **SELECT *** | Fetches unnecessary data | Select only needed columns |
| **N+1 Queries** | Multiple DB roundtrips | Use joins or eager loading |
| **No Caching** | Repeated expensive computations | Cache at appropriate layer (memory, Redis, CDN) |
| **Blocking Operations** | Holds up main thread | Use async/background jobs |
| **Large Bundle** | Slow initial load | Code splitting, lazy loading |
| **No Image Optimization** | Huge assets over network | Compress, modern formats (WebP, AVIF), lazy load |
| **Missing Indexes** | Full table scans | Add indexes on queried columns |
| **Memory Leaks** | Unbounded growth | Clean up listeners, close connections, clear refs |
| **Synchronous I/O** | Blocks event loop | Use async I/O operations |

## Quick Troubleshooting

| Issue | Diagnostic | Solution |
|-------|------------|----------|
| **Slow page load** | Check Network tab | Optimize images, enable compression, use CDN |
| **Poor LCP** | Lighthouse audit | Preload critical resources, optimize largest element |
| **High INP** | Performance profiler | Debounce handlers, use web workers, reduce JS |
| **Layout shifts (CLS)** | Layout Shift Regions | Set dimensions on images/embeds, avoid dynamic content |
| **Slow API response** | APM tools, logging | Add database indexes, cache responses, optimize queries |
| **High memory usage** | Memory profiler | Fix leaks, clear intervals/listeners, use weak refs |
| **Large bundle** | Bundle analyzer | Code split, tree shake, lazy load routes |
| **Slow database query** | EXPLAIN ANALYZE | Add indexes, rewrite query, partition table |

## Frontend Performance

### Core Web Vitals

| Metric | Target | Measurement |
|--------|--------|-------------|
| LCP (Largest Contentful Paint) | < 2.5s | Largest visible element |
| INP (Interaction to Next Paint) | < 200ms | Input responsiveness |
| CLS (Cumulative Layout Shift) | < 0.1 | Visual stability |

### Optimization Techniques

```tsx
// Code splitting
const Dashboard = lazy(() => import('./Dashboard'));

// Image optimization
<Image
  src="/hero.jpg"
  width={1200}
  height={600}
  priority  // Above fold
  placeholder="blur"
/>

// Memoization
const MemoizedComponent = memo(ExpensiveComponent);
const memoizedValue = useMemo(() => computeExpensive(a, b), [a, b]);
const memoizedFn = useCallback(() => handleClick(id), [id]);

// Virtual lists for long lists
<VirtualList items={items} itemHeight={50} />
```

## Backend Performance

```typescript
// N+1 prevention
const usersWithPosts = await prisma.user.findMany({
  include: { posts: true }  // Single query with join
});

// Caching
const cached = await redis.get(key);
if (cached) return JSON.parse(cached);
const data = await db.query();
await redis.setex(key, 3600, JSON.stringify(data));

// Connection pooling
const pool = new Pool({ max: 20 });

// Async processing
await queue.add('sendEmail', { userId });
```

## Database Performance

```sql
-- Use EXPLAIN ANALYZE
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'x';

-- Add indexes for frequently queried columns
CREATE INDEX idx_users_email ON users(email);

-- Partial indexes
CREATE INDEX idx_active_users ON users(email) WHERE is_active = true;

-- Avoid SELECT *
SELECT id, name, email FROM users;

-- Pagination
SELECT * FROM users ORDER BY id LIMIT 20 OFFSET 0;
```

## Checklist

| Area | Check |
|------|-------|
| Images | Optimized, lazy loaded, proper format |
| JS Bundle | Code split, tree shaken, minified |
| CSS | Critical CSS inline, unused removed |
| Fonts | Preloaded, subset, font-display |
| Caching | CDN, browser cache, API cache |
| Database | Indexes, query optimization |

## Production Readiness

### Monitoring Setup

```typescript
// Web Vitals reporting
import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals';

function sendToAnalytics(metric: Metric) {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    id: metric.id,
    page: window.location.pathname,
  });

  // Use sendBeacon for reliability
  navigator.sendBeacon('/analytics', body);
}

onCLS(sendToAnalytics);
onINP(sendToAnalytics);
onLCP(sendToAnalytics);
onFCP(sendToAnalytics);
onTTFB(sendToAnalytics);
```

### Performance Budget

```javascript
// webpack.config.js or vite.config.ts
{
  performance: {
    maxAssetSize: 250000, // 250KB
    maxEntrypointSize: 500000, // 500KB
    hints: 'error',
  },
}

// Lighthouse CI budget
// lighthouserc.js
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:3000/'],
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'first-contentful-paint': ['error', { maxNumericValue: 2000 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 300 }],
      },
    },
  },
};
```

### Backend Optimization

```typescript
// Response compression
import compression from 'compression';
app.use(compression({ threshold: 1024 }));

// Response caching headers
function setCacheHeaders(res: Response, maxAge: number) {
  res.setHeader('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}`);
  res.setHeader('Vary', 'Accept-Encoding');
}

// Streaming responses
async function streamLargeData(res: Response) {
  const stream = db.users.findMany().cursor();

  res.setHeader('Content-Type', 'application/json');
  res.write('[');

  let first = true;
  for await (const user of stream) {
    if (!first) res.write(',');
    res.write(JSON.stringify(user));
    first = false;
  }

  res.write(']');
  res.end();
}

// Query optimization
const users = await prisma.user.findMany({
  select: { id: true, name: true, email: true }, // Only needed fields
  where: { isActive: true },
  take: 20,
  orderBy: { createdAt: 'desc' },
});
```

### Database Optimization

```sql
-- Composite indexes for common queries
CREATE INDEX idx_users_active_created
ON users(is_active, created_at DESC)
WHERE is_active = true;

-- Query analysis
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM users WHERE email = 'test@example.com';

-- Connection pooling configuration
-- pgbouncer.ini
[pgbouncer]
pool_mode = transaction
default_pool_size = 20
max_client_conn = 100
```

### CI Performance Testing

```yaml
# .github/workflows/performance.yml
name: Performance

on:
  pull_request:
    branches: [main]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build
        run: npm run build

      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v10
        with:
          configPath: ./lighthouserc.js
          uploadArtifacts: true

  bundle-size:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build
        run: npm run build

      - name: Check bundle size
        uses: siddharthkp/bundlesize@v2
        with:
          files: 'dist/*.js'
          maxSize: '250KB'
```

### Caching Strategy

```typescript
// Cache layers
const cacheStrategy = {
  // L1: In-memory (fastest, smallest)
  memory: new LRUCache({ max: 1000, ttl: 60000 }),

  // L2: Redis (fast, larger)
  redis: new Redis({ maxRetriesPerRequest: 3 }),

  // L3: CDN (edge caching)
  cdn: {
    cacheControl: 'public, max-age=31536000, immutable', // Static assets
    staleWhileRevalidate: 'public, max-age=60, stale-while-revalidate=600', // API
  },
};

async function getCachedData<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  // Check memory
  const memoryHit = cacheStrategy.memory.get(key);
  if (memoryHit) return memoryHit as T;

  // Check Redis
  const redisHit = await cacheStrategy.redis.get(key);
  if (redisHit) {
    const data = JSON.parse(redisHit);
    cacheStrategy.memory.set(key, data);
    return data;
  }

  // Fetch and cache
  const data = await fetcher();
  cacheStrategy.memory.set(key, data);
  await cacheStrategy.redis.setex(key, 300, JSON.stringify(data));

  return data;
}
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| LCP | < 2.5s |
| INP | < 200ms |
| CLS | < 0.1 |
| TTFB | < 200ms |
| API p95 latency | < 500ms |
| Database query time | < 100ms |
| Cache hit rate | > 90% |

### Production Checklist

- [ ] Core Web Vitals monitored
- [ ] Performance budget set
- [ ] Lighthouse CI in pipeline
- [ ] Bundle size monitoring
- [ ] Image optimization
- [ ] Code splitting enabled
- [ ] Compression enabled
- [ ] Caching strategy defined
- [ ] Database indexes optimized
- [ ] CDN configured

## Reference Documentation
- [Bundle Analysis](quick-ref/bundle.md)
- [Caching Strategies](quick-ref/caching.md)
