# Cache Invalidation

## Overview

Cache invalidation is the process of removing or updating stale data in a cache when the source of truth changes. It is famously one of the two hard problems in computer science. Incorrect invalidation leads to serving stale data; overly aggressive invalidation negates caching benefits. The goal is to invalidate precisely when data changes and not before.

## TTL-Based Expiration

The simplest invalidation strategy: entries expire automatically after a fixed duration. No coordination required between writers and cache.

### Redis TTL

```bash
# Set with TTL
SET product:123 '{"name":"Widget","price":9.99}' EX 3600

# Set TTL on existing key
EXPIRE product:123 3600

# Check remaining TTL
TTL product:123

# Set with millisecond precision
SET product:123 '{"name":"Widget"}' PX 60000

# Set expiry at a specific Unix timestamp
EXPIREAT product:123 1700000000
```

### Choosing TTL Values

| Data Type | Suggested TTL | Rationale |
|-----------|---------------|-----------|
| Product catalog | 5-15 minutes | Changes infrequently, moderate staleness OK |
| User session | 30 minutes | Security sensitive, refresh on activity |
| Exchange rates | 1-5 minutes | Financial data, needs freshness |
| Static config | 1-24 hours | Rarely changes |
| Search results | 1-5 minutes | Freshness matters for relevance |
| API rate limit counters | Match rate limit window | Must be precise |

### Sliding vs Fixed TTL

```javascript
// Fixed TTL: expires X seconds after creation
await redis.setex(`session:${userId}`, 1800, sessionData);

// Sliding TTL: resets expiry on every access
async function getSession(userId) {
  const key = `session:${userId}`;
  const data = await redis.get(key);
  if (data) {
    await redis.expire(key, 1800); // Reset TTL on access
    return JSON.parse(data);
  }
  return null;
}
```

## Event-Driven Invalidation

Invalidate cache entries in response to data change events. Provides lower latency between write and invalidation compared to TTL alone.

### Redis Pub/Sub

```javascript
import Redis from 'ioredis';

// Publisher (in the write service)
const publisher = new Redis();

async function updateProduct(product) {
  await db.products.save(product);
  await publisher.publish('cache:invalidate', JSON.stringify({
    type: 'product',
    id: product.id,
    action: 'update',
    timestamp: Date.now(),
  }));
}

// Subscriber (in every cache-holding service instance)
const subscriber = new Redis();
const localCache = new Map();

subscriber.subscribe('cache:invalidate');
subscriber.on('message', (channel, message) => {
  const event = JSON.parse(message);

  if (event.type === 'product') {
    localCache.delete(`product:${event.id}`);
    console.log(`Invalidated product:${event.id} due to ${event.action}`);
  }
});
```

### Database Change Data Capture (CDC)

```java
// Using Debezium CDC connector to invalidate cache on DB changes
@KafkaListener(topics = "dbserver1.inventory.products")
public void onProductChange(ConsumerRecord<String, String> record) {
    JsonNode payload = objectMapper.readTree(record.value()).get("payload");
    String operation = payload.get("op").asText(); // c=create, u=update, d=delete
    String productId = payload.get("after").get("id").asText();

    switch (operation) {
        case "u", "d" -> {
            cache.invalidate("product:" + productId);
            log.info("Cache invalidated for product {} (op={})", productId, operation);
        }
    }
}
```

## Version-Based Invalidation

Include a version number in cache keys. When data changes, increment the version so old entries are naturally bypassed.

```javascript
class VersionedCache {
  constructor(redis) {
    this.redis = redis;
  }

  async get(entity, id) {
    const version = await this.redis.get(`${entity}:${id}:version`) || '0';
    const key = `${entity}:${id}:v${version}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async set(entity, id, data, ttl = 3600) {
    const version = await this.redis.get(`${entity}:${id}:version`) || '0';
    const key = `${entity}:${id}:v${version}`;
    await this.redis.setex(key, ttl, JSON.stringify(data));
  }

  async invalidate(entity, id) {
    // Increment version; old versioned key expires naturally via TTL
    await this.redis.incr(`${entity}:${id}:version`);
  }
}

// Usage
const cache = new VersionedCache(redis);

await cache.set('product', '123', { name: 'Widget', price: 9.99 });
const product = await cache.get('product', '123'); // Cache hit

await cache.invalidate('product', '123'); // Increment version
const stale = await cache.get('product', '123'); // Cache miss (new version key)
```

## Tag-Based Invalidation

Associate cache entries with one or more tags. Invalidate all entries sharing a tag in a single operation.

```javascript
class TaggedCache {
  constructor(redis) {
    this.redis = redis;
  }

  async set(key, value, tags = [], ttl = 3600) {
    const pipeline = this.redis.pipeline();
    pipeline.setex(key, ttl, JSON.stringify(value));

    for (const tag of tags) {
      pipeline.sadd(`tag:${tag}`, key);
      pipeline.expire(`tag:${tag}`, ttl + 60); // Tag set lives slightly longer
    }

    await pipeline.exec();
  }

  async get(key) {
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async invalidateByTag(tag) {
    const keys = await this.redis.smembers(`tag:${tag}`);
    if (keys.length === 0) return 0;

    const pipeline = this.redis.pipeline();
    for (const key of keys) {
      pipeline.del(key);
    }
    pipeline.del(`tag:${tag}`);
    await pipeline.exec();

    return keys.length;
  }
}

// Usage
const cache = new TaggedCache(redis);

// Cache product with tags for category and brand
await cache.set('product:123', productData, ['category:electronics', 'brand:acme']);
await cache.set('product:456', productData2, ['category:electronics', 'brand:widgets']);

// Invalidate all electronics products
const count = await cache.invalidateByTag('category:electronics');
console.log(`Invalidated ${count} entries`); // 2
```

### Spring Cache with Custom Tags

```java
@Service
public class ProductService {

    private final TaggedCacheManager cacheManager;

    @Cacheable(value = "products", key = "#productId")
    public Product getProduct(String productId) {
        Product product = productRepository.findById(productId).orElseThrow();
        cacheManager.tagEntry("products", productId,
            "category:" + product.getCategory(),
            "brand:" + product.getBrand());
        return product;
    }

    public void onCategoryUpdate(String category) {
        cacheManager.invalidateByTag("category:" + category);
    }
}
```

## Cache Stampede Prevention

A cache stampede (thundering herd) occurs when a popular cache entry expires and many concurrent requests all attempt to reload it simultaneously, overwhelming the backend.

### Mutex Lock (Exclusive Recomputation)

Only one request recomputes the value; others wait or serve stale data.

```javascript
async function getWithMutex(key, loadFn, ttl = 3600) {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const lockKey = `lock:${key}`;
  const lockAcquired = await redis.set(lockKey, '1', 'NX', 'EX', 10);

  if (lockAcquired) {
    try {
      // This request recomputes the value
      const value = await loadFn();
      await redis.setex(key, ttl, JSON.stringify(value));
      return value;
    } finally {
      await redis.del(lockKey);
    }
  } else {
    // Another request is recomputing; wait and retry
    await new Promise((r) => setTimeout(r, 100));
    return getWithMutex(key, loadFn, ttl);
  }
}
```

### Probabilistic Early Expiration (XFetch)

Each request has a small probability of recomputing the value before it actually expires. This spreads recomputation over time.

```javascript
async function getWithEarlyExpiration(key, loadFn, ttl = 3600, beta = 1.0) {
  const raw = await redis.get(key);

  if (raw) {
    const { value, expiry, computeTime } = JSON.parse(raw);
    const now = Date.now() / 1000;

    // XFetch algorithm: recompute early with probability based on remaining TTL
    const timeToExpiry = expiry - now;
    const shouldRecompute = timeToExpiry - beta * computeTime * Math.log(Math.random()) <= 0;

    if (!shouldRecompute) {
      return value;
    }
    // Fall through to recompute
  }

  const startTime = Date.now();
  const value = await loadFn();
  const computeTime = (Date.now() - startTime) / 1000;

  const entry = {
    value,
    expiry: Date.now() / 1000 + ttl,
    computeTime,
  };

  await redis.setex(key, ttl, JSON.stringify(entry));
  return value;
}
```

### Stale-While-Revalidate

Serve the stale value immediately while recomputing in the background.

```javascript
async function getStaleWhileRevalidate(key, loadFn, ttl = 3600, staleTTL = 7200) {
  const raw = await redis.get(key);

  if (raw) {
    const { value, expiresAt } = JSON.parse(raw);
    const isStale = Date.now() > expiresAt;

    if (isStale) {
      // Return stale value immediately, revalidate in background
      setImmediate(async () => {
        try {
          const freshValue = await loadFn();
          await redis.setex(key, staleTTL, JSON.stringify({
            value: freshValue,
            expiresAt: Date.now() + ttl * 1000,
          }));
        } catch (err) {
          console.error(`Background revalidation failed for ${key}:`, err);
        }
      });
    }

    return value;
  }

  // No cache at all: must wait for fresh value
  const value = await loadFn();
  await redis.setex(key, staleTTL, JSON.stringify({
    value,
    expiresAt: Date.now() + ttl * 1000,
  }));
  return value;
}
```

## Spring @CacheEvict

```java
@Service
public class ProductService {

    @Cacheable(value = "products", key = "#productId")
    public Product getProduct(String productId) {
        return productRepository.findById(productId).orElseThrow();
    }

    @CacheEvict(value = "products", key = "#product.id")
    public Product updateProduct(Product product) {
        return productRepository.save(product);
    }

    @CacheEvict(value = "products", allEntries = true)
    public void clearProductCache() {
        log.info("Product cache cleared");
    }

    // Evict after successful execution only
    @CacheEvict(value = "products", key = "#productId", beforeInvocation = false)
    public void deleteProduct(String productId) {
        productRepository.deleteById(productId);
    }

    // Multiple cache operations
    @Caching(evict = {
        @CacheEvict(value = "products", key = "#product.id"),
        @CacheEvict(value = "categories", key = "#product.category")
    })
    public Product recategorizeProduct(Product product) {
        return productRepository.save(product);
    }
}
```

## Anti-Patterns

1. **Delete-then-write race condition** - Deleting cache then writing to DB allows a concurrent read to re-cache stale data. Write DB first, then invalidate cache.
2. **Invalidating too broadly** - Clearing the entire cache because one item changed wastes cached data and causes a stampede.
3. **No stampede protection on hot keys** - A single popular key expiring can generate thousands of simultaneous backend requests.
4. **TTL of zero or very short** - Effectively disables caching. If data changes that fast, consider not caching it.
5. **Forgetting to invalidate on all write paths** - If data can be changed through an admin panel, batch job, or direct DB query, all paths must trigger invalidation.
6. **Pub/sub without TTL backup** - If the invalidation message is lost (subscriber down), the entry stays stale forever. Always pair event-driven invalidation with a TTL safety net.
7. **Blocking on lock in stampede prevention** - If the lock holder crashes, all waiters block indefinitely. Use lock TTL and retry limits.

## Production Checklist

- [ ] TTL configured for every cache entry type
- [ ] Event-driven invalidation set up for write-heavy data
- [ ] TTL serves as safety net even when event-driven invalidation is primary
- [ ] Cache stampede protection implemented for high-traffic keys
- [ ] All write paths trigger appropriate invalidation
- [ ] Invalidation metrics tracked (invalidation count, reason, latency)
- [ ] Tag-based invalidation used for related entity groups
- [ ] Race condition analysis completed for concurrent read/write scenarios
- [ ] Pub/sub reliability verified (dead letter queue for missed messages)
- [ ] Stale data detection mechanism in place (version, timestamp)
- [ ] Load tested with cache invalidation storms to verify backend capacity
