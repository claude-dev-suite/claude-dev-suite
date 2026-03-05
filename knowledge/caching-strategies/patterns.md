# Caching Patterns

## Overview

Caching reduces latency and load on backend systems by storing frequently accessed data closer to the consumer. The choice of caching pattern determines the tradeoffs between data consistency, write latency, read latency, and implementation complexity. Each pattern suits different access characteristics.

## Cache-Aside (Lazy Loading)

The application manages the cache directly. On read, it checks the cache first; on miss, it fetches from the data source and populates the cache. On write, it updates the data source and invalidates or updates the cache.

```
Read path:
  1. Application checks cache
  2. Cache HIT → return data
  3. Cache MISS → fetch from DB → store in cache → return data

Write path:
  1. Application writes to DB
  2. Application invalidates cache entry (or updates it)
```

### Java (Caffeine)

```java
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Cache;

Cache<String, Product> cache = Caffeine.newBuilder()
    .maximumSize(10_000)
    .expireAfterWrite(Duration.ofMinutes(10))
    .recordStats()
    .build();

public Product getProduct(String productId) {
    return cache.get(productId, key -> {
        // Cache miss: load from database
        return productRepository.findById(key)
            .orElseThrow(() -> new ProductNotFoundException(key));
    });
}

public void updateProduct(Product product) {
    productRepository.save(product);
    cache.invalidate(product.getId());  // Invalidate on write
}
```

### Node.js (node-cache)

```javascript
import NodeCache from 'node-cache';

const cache = new NodeCache({
  stdTTL: 600,          // Default TTL: 10 minutes
  checkperiod: 120,     // Cleanup interval: 2 minutes
  maxKeys: 10000,
  useClones: false,      // Return references for performance
});

async function getProduct(productId) {
  const cached = cache.get(productId);
  if (cached) return cached;

  const product = await db.products.findById(productId);
  if (product) {
    cache.set(productId, product);
  }
  return product;
}

async function updateProduct(productId, data) {
  await db.products.update(productId, data);
  cache.del(productId);  // Invalidate
}
```

### Python (cachetools)

```python
from cachetools import TTLCache, cached
from threading import Lock

product_cache = TTLCache(maxsize=10000, ttl=600)
cache_lock = Lock()

@cached(cache=product_cache, lock=cache_lock)
def get_product(product_id: str) -> dict:
    return product_repository.find_by_id(product_id)

def update_product(product_id: str, data: dict) -> None:
    product_repository.save(product_id, data)
    with cache_lock:
        product_cache.pop(product_id, None)
```

## Write-Through

Every write goes to both the cache and the data source synchronously. The cache is always up to date, so reads are always cache hits (after initial population).

```
Write path:
  1. Application writes to cache
  2. Cache writes to DB (synchronously)
  3. Confirm to application

Read path:
  1. Application reads from cache (always a HIT after initial load)
```

### Java Implementation

```java
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.LoadingCache;
import com.github.benmanes.caffeine.cache.CacheWriter;

Cache<String, Product> cache = Caffeine.newBuilder()
    .maximumSize(10_000)
    .build();

// Write-through wrapper
public Product getProduct(String productId) {
    return cache.get(productId, key -> productRepository.findById(key).orElse(null));
}

public void saveProduct(Product product) {
    // Write to DB first, then cache
    productRepository.save(product);
    cache.put(product.getId(), product);
}
```

### Redis Write-Through (Node.js)

```javascript
import Redis from 'ioredis';

const redis = new Redis();

async function saveProduct(product) {
  // Write to both DB and cache atomically (best effort)
  await db.products.save(product);
  await redis.setex(
    `product:${product.id}`,
    600,
    JSON.stringify(product)
  );
}

async function getProduct(productId) {
  const cached = await redis.get(`product:${productId}`);
  if (cached) return JSON.parse(cached);

  const product = await db.products.findById(productId);
  if (product) {
    await redis.setex(`product:${productId}`, 600, JSON.stringify(product));
  }
  return product;
}
```

## Write-Behind (Write-Back)

Writes go to the cache immediately but are flushed to the data source asynchronously. This reduces write latency but introduces a window where cache and database are inconsistent.

```
Write path:
  1. Application writes to cache (immediate return)
  2. Cache asynchronously flushes to DB (batched, delayed)

Read path:
  1. Application reads from cache
```

### Node.js Implementation

```javascript
class WriteBehindCache {
  #cache = new Map();
  #dirtyKeys = new Set();
  #flushInterval;

  constructor(db, flushIntervalMs = 5000) {
    this.db = db;
    this.#flushInterval = setInterval(() => this.flush(), flushIntervalMs);
  }

  get(key) {
    return this.#cache.get(key) ?? null;
  }

  set(key, value) {
    this.#cache.set(key, value);
    this.#dirtyKeys.add(key);
  }

  async flush() {
    if (this.#dirtyKeys.size === 0) return;

    const batch = [...this.#dirtyKeys];
    this.#dirtyKeys.clear();

    const writes = batch.map((key) => {
      const value = this.#cache.get(key);
      return this.db.save(key, value).catch((err) => {
        // Re-mark as dirty on failure
        this.#dirtyKeys.add(key);
        console.error(`Write-behind failed for key ${key}:`, err);
      });
    });

    await Promise.allSettled(writes);
  }

  destroy() {
    clearInterval(this.#flushInterval);
    return this.flush(); // Final flush
  }
}
```

## Read-Through

The cache itself handles loading data from the data source on a miss. The application only interacts with the cache, never directly with the data source for reads.

### Java (Spring @Cacheable)

```java
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager("products", "categories");
        manager.setCaffeine(Caffeine.newBuilder()
            .maximumSize(5000)
            .expireAfterWrite(Duration.ofMinutes(15))
            .recordStats());
        return manager;
    }
}

@Service
public class ProductService {

    @Cacheable(value = "products", key = "#productId")
    public Product getProduct(String productId) {
        // This method is only called on cache miss
        return productRepository.findById(productId)
            .orElseThrow(() -> new ProductNotFoundException(productId));
    }

    @CachePut(value = "products", key = "#product.id")
    public Product updateProduct(Product product) {
        return productRepository.save(product);
    }

    @CacheEvict(value = "products", key = "#productId")
    public void deleteProduct(String productId) {
        productRepository.deleteById(productId);
    }
}
```

## Cache Warming

Pre-populate the cache before traffic hits, eliminating cold-start cache misses.

```java
@Component
public class CacheWarmer implements ApplicationRunner {

    private final ProductService productService;
    private final Cache<String, Product> productCache;

    @Override
    public void run(ApplicationArguments args) {
        log.info("Warming product cache...");
        List<String> topProductIds = productRepository.findTopProductIds(1000);

        topProductIds.parallelStream().forEach(id -> {
            try {
                productService.getProduct(id); // Triggers read-through
            } catch (Exception e) {
                log.warn("Failed to warm cache for product {}", id, e);
            }
        });

        log.info("Cache warming complete: {} products loaded", topProductIds.size());
    }
}
```

```javascript
async function warmCache(redis, db) {
  console.log('Starting cache warming...');

  const topProducts = await db.products.findTopSelling(1000);
  const pipeline = redis.pipeline();

  for (const product of topProducts) {
    pipeline.setex(`product:${product.id}`, 3600, JSON.stringify(product));
  }

  await pipeline.exec();
  console.log(`Cache warmed with ${topProducts.length} products`);
}
```

## Pattern Comparison

| Pattern | Consistency | Read Latency | Write Latency | Complexity | Best For |
|---------|-------------|--------------|---------------|------------|----------|
| Cache-Aside | Eventual | Low (hit) / High (miss) | Low | Low | General purpose, read-heavy |
| Write-Through | Strong | Low | Higher (sync write) | Medium | Read-heavy with consistency needs |
| Write-Behind | Eventual | Low | Very Low | High | Write-heavy, latency-sensitive |
| Read-Through | Eventual | Low (hit) / High (miss) | N/A | Medium | Simplified app code |
| Cache Warming | N/A | Low from start | N/A | Medium | Predictable access patterns |

## Cache Eviction Policies

| Policy | Description | Use Case |
|--------|-------------|----------|
| LRU (Least Recently Used) | Evicts the entry accessed longest ago | General purpose |
| LFU (Least Frequently Used) | Evicts the entry accessed fewest times | Hot/cold data separation |
| FIFO (First In First Out) | Evicts oldest entry | Time-ordered data |
| TTL (Time-To-Live) | Evicts after a fixed duration | Data with known freshness window |
| Random | Evicts a random entry | Simple, low overhead |
| W-TinyLFU (Caffeine default) | Admission filter + LRU | High hit rates, diverse access |

## Redis Data Structures for Caching

```bash
# String: simple key-value
SET product:123 '{"name":"Widget","price":9.99}' EX 3600

# Hash: structured data (partial reads/writes)
HSET product:123 name "Widget" price 9.99 stock 42
HGET product:123 price

# Sorted Set: leaderboards, top-N
ZADD trending_products 150 "product:123"
ZREVRANGE trending_products 0 9 WITHSCORES

# List: recent items, queues
LPUSH user:456:recent_views "product:123"
LTRIM user:456:recent_views 0 49
```

## Anti-Patterns

1. **Caching without TTL** - Data that never expires becomes permanently stale. Always set a TTL, even a long one.
2. **Cache-aside with race conditions** - Two concurrent misses can lead to double-load and stale overwrites. Use locking or accept eventual consistency.
3. **Write-behind without persistence guarantee** - If the application crashes before flushing, written data is lost. Use write-ahead logs or accept data loss risk.
4. **Caching errors** - Caching a 404 or error response means the error persists for the TTL duration. Only cache successful responses.
5. **Unbounded cache** - Without `maxSize`, the cache grows until it causes memory pressure. Always set size limits.
6. **Ignoring serialization cost** - For large objects, serialization/deserialization can negate caching benefits. Profile before assuming cache helps.
7. **Single global TTL** - Different data types have different freshness requirements. Configure per-key or per-type TTLs.

## Production Checklist

- [ ] Caching pattern chosen based on read/write ratio and consistency needs
- [ ] TTL configured per data type based on acceptable staleness
- [ ] Maximum cache size set with appropriate eviction policy
- [ ] Cache hit/miss metrics exported to monitoring system
- [ ] Cache warming implemented for predictable hot data
- [ ] Serialization format chosen (JSON for debugging, protobuf/msgpack for performance)
- [ ] Error responses excluded from caching
- [ ] Cache invalidation strategy defined for write operations
- [ ] Memory usage monitored and alerted on
- [ ] Fallback to data source verified when cache is unavailable
- [ ] Load tested to measure actual latency improvement
