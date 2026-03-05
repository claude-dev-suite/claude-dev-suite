# Distributed Caching

## Overview

Distributed caching stores data across multiple nodes, providing shared cache access for horizontally scaled applications. Unlike in-process caches (Caffeine, node-cache), a distributed cache survives application restarts and is accessible by every instance. Redis is the dominant solution, though Memcached, Hazelcast, and Apache Ignite serve specific niches.

## Redis Cluster

Redis Cluster partitions data across multiple master nodes using hash slots (16384 total). Each key is assigned to a hash slot via `CRC16(key) mod 16384`. Each master handles a subset of hash slots and can have one or more replicas for failover.

### Architecture

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Master A   │  │  Master B   │  │  Master C   │
│ Slots 0-5460│  │Slots 5461-  │  │Slots 10923- │
│             │  │   10922     │  │   16383     │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐
│  Replica A1 │  │  Replica B1 │  │  Replica C1 │
└─────────────┘  └─────────────┘  └─────────────┘
```

### Node.js Connection

```javascript
import Redis from 'ioredis';

const cluster = new Redis.Cluster([
  { host: 'redis-node-1', port: 6379 },
  { host: 'redis-node-2', port: 6379 },
  { host: 'redis-node-3', port: 6379 },
], {
  redisOptions: {
    password: process.env.REDIS_PASSWORD,
    tls: process.env.NODE_ENV === 'production' ? {} : undefined,
  },
  scaleReads: 'slave',          // Read from replicas
  maxRedirections: 16,          // Max MOVED/ASK redirections
  retryDelayOnFailover: 300,
  retryDelayOnClusterDown: 1000,
  enableReadyCheck: true,
  slotsRefreshTimeout: 2000,
});

cluster.on('error', (err) => console.error('Redis Cluster Error:', err));
cluster.on('+node', (node) => console.log('Node added:', node.options.host));
cluster.on('-node', (node) => console.log('Node removed:', node.options.host));
```

### Java (Jedis Cluster)

```java
import redis.clients.jedis.JedisCluster;
import redis.clients.jedis.HostAndPort;

Set<HostAndPort> nodes = Set.of(
    new HostAndPort("redis-node-1", 6379),
    new HostAndPort("redis-node-2", 6379),
    new HostAndPort("redis-node-3", 6379)
);

JedisCluster jedis = new JedisCluster(nodes,
    3000,   // connection timeout
    3000,   // socket timeout
    5,      // max attempts
    password,
    new GenericObjectPoolConfig<>()
);

jedis.setex("product:123", 3600, productJson);
String cached = jedis.get("product:123");
```

### Hash Tags for Multi-Key Operations

Redis Cluster does not support multi-key operations across different hash slots. Use hash tags `{...}` to force related keys to the same slot.

```bash
# These keys go to the same slot because {user:123} is the hash tag
SET {user:123}:profile '{"name":"Alice"}'
SET {user:123}:preferences '{"theme":"dark"}'
SET {user:123}:cart '["item1","item2"]'

# Multi-key operation now works
MGET {user:123}:profile {user:123}:preferences {user:123}:cart
```

## Redis Sentinel

Redis Sentinel provides high availability for standalone Redis (non-clustered). It monitors master/replica groups, performs automatic failover, and provides service discovery.

### Configuration

```
# sentinel.conf
sentinel monitor mymaster redis-master 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 60000
sentinel parallel-syncs mymaster 1
sentinel auth-pass mymaster <password>
```

### Node.js with Sentinel

```javascript
import Redis from 'ioredis';

const redis = new Redis({
  sentinels: [
    { host: 'sentinel-1', port: 26379 },
    { host: 'sentinel-2', port: 26379 },
    { host: 'sentinel-3', port: 26379 },
  ],
  name: 'mymaster',
  password: process.env.REDIS_PASSWORD,
  sentinelPassword: process.env.SENTINEL_PASSWORD,
  db: 0,
  retryStrategy(times) {
    return Math.min(times * 200, 5000);
  },
});
```

### Cluster vs Sentinel

| Feature | Redis Cluster | Redis Sentinel |
|---------|---------------|----------------|
| Data partitioning | Automatic (hash slots) | None (single dataset) |
| Max dataset size | Sum of all masters | Single master memory |
| Multi-key operations | Same hash slot only | Full support |
| Failover | Automatic per shard | Automatic (one master) |
| Complexity | Higher | Lower |
| Use case | Large datasets, high throughput | Moderate datasets, HA needed |

## Consistent Hashing

Distributes keys across cache nodes so that adding or removing a node only reassigns a minimal number of keys.

```javascript
import crypto from 'crypto';

class ConsistentHashRing {
  #ring = new Map();     // hash -> node
  #sortedHashes = [];
  #replicas;

  constructor(replicas = 150) {
    this.#replicas = replicas;
  }

  #hash(key) {
    return parseInt(
      crypto.createHash('md5').update(key).digest('hex').substring(0, 8),
      16
    );
  }

  addNode(node) {
    for (let i = 0; i < this.#replicas; i++) {
      const hash = this.#hash(`${node}:${i}`);
      this.#ring.set(hash, node);
      this.#sortedHashes.push(hash);
    }
    this.#sortedHashes.sort((a, b) => a - b);
  }

  removeNode(node) {
    for (let i = 0; i < this.#replicas; i++) {
      const hash = this.#hash(`${node}:${i}`);
      this.#ring.delete(hash);
      this.#sortedHashes = this.#sortedHashes.filter((h) => h !== hash);
    }
  }

  getNode(key) {
    if (this.#ring.size === 0) return null;
    const hash = this.#hash(key);

    // Find the first node clockwise from the key's hash
    for (const nodeHash of this.#sortedHashes) {
      if (nodeHash >= hash) return this.#ring.get(nodeHash);
    }
    // Wrap around to the first node
    return this.#ring.get(this.#sortedHashes[0]);
  }
}

// Usage
const ring = new ConsistentHashRing();
ring.addNode('cache-1:6379');
ring.addNode('cache-2:6379');
ring.addNode('cache-3:6379');

const node = ring.getNode('product:123'); // Deterministic node selection
```

## Near-Cache Pattern (Local + Distributed)

A two-tier cache combining a fast in-process cache (L1) with a shared distributed cache (L2). Reduces network round trips for frequently accessed data while maintaining consistency across instances.

```javascript
import NodeCache from 'node-cache';
import Redis from 'ioredis';

class NearCache {
  #local;
  #redis;
  #subscriber;
  #prefix;

  constructor(redis, options = {}) {
    this.#redis = redis;
    this.#prefix = options.prefix || 'nc';
    this.#local = new NodeCache({
      stdTTL: options.localTTL || 30,   // Short local TTL
      maxKeys: options.maxLocalKeys || 1000,
    });

    // Subscribe to invalidation events
    this.#subscriber = redis.duplicate();
    this.#subscriber.subscribe(`${this.#prefix}:invalidate`);
    this.#subscriber.on('message', (channel, key) => {
      this.#local.del(key);
    });
  }

  async get(key) {
    // L1: local cache
    const local = this.#local.get(key);
    if (local !== undefined) return local;

    // L2: Redis
    const remote = await this.#redis.get(`${this.#prefix}:${key}`);
    if (remote) {
      const parsed = JSON.parse(remote);
      this.#local.set(key, parsed); // Promote to L1
      return parsed;
    }

    return null;
  }

  async set(key, value, remoteTTL = 3600) {
    this.#local.set(key, value);
    await this.#redis.setex(`${this.#prefix}:${key}`, remoteTTL, JSON.stringify(value));
  }

  async invalidate(key) {
    this.#local.del(key);
    await this.#redis.del(`${this.#prefix}:${key}`);
    // Notify other instances to clear their L1
    await this.#redis.publish(`${this.#prefix}:invalidate`, key);
  }
}
```

### Java (Caffeine + Redis)

```java
@Service
public class NearCacheService {

    private final Cache<String, Product> localCache;
    private final RedisTemplate<String, Product> redisTemplate;

    public NearCacheService(RedisTemplate<String, Product> redisTemplate) {
        this.redisTemplate = redisTemplate;
        this.localCache = Caffeine.newBuilder()
            .maximumSize(1000)
            .expireAfterWrite(Duration.ofSeconds(30))
            .build();
    }

    public Product getProduct(String productId) {
        // L1: local
        Product local = localCache.getIfPresent(productId);
        if (local != null) return local;

        // L2: Redis
        Product remote = redisTemplate.opsForValue().get("product:" + productId);
        if (remote != null) {
            localCache.put(productId, remote);
            return remote;
        }

        // L3: Database
        Product product = productRepository.findById(productId).orElseThrow();
        localCache.put(productId, product);
        redisTemplate.opsForValue().set("product:" + productId, product, Duration.ofHours(1));
        return product;
    }
}
```

## Serialization Formats

| Format | Size | Speed | Schema | Debugging |
|--------|------|-------|--------|-----------|
| JSON | Large | Moderate | None | Easy (human-readable) |
| MessagePack | Small | Fast | None | Harder |
| Protocol Buffers | Smallest | Fastest | Required (.proto) | Needs tooling |
| Avro | Small | Fast | Required | Needs tooling |
| CBOR | Small | Fast | None | Harder |

### MessagePack Example (Node.js)

```javascript
import { encode, decode } from '@msgpack/msgpack';

async function setCached(redis, key, value, ttl) {
  const buffer = Buffer.from(encode(value));
  await redis.setex(key, ttl, buffer);
}

async function getCached(redis, key) {
  const buffer = await redis.getBuffer(key);
  return buffer ? decode(buffer) : null;
}
```

## Connection Pooling

### Node.js (ioredis)

```javascript
import Redis from 'ioredis';
import genericPool from 'generic-pool';

const pool = genericPool.createPool({
  create: () => new Redis({
    host: 'redis-master',
    port: 6379,
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
  }),
  destroy: (client) => client.quit(),
}, {
  min: 5,
  max: 20,
  acquireTimeoutMillis: 3000,
  idleTimeoutMillis: 30000,
});

// Usage
async function cachedGet(key) {
  const client = await pool.acquire();
  try {
    return await client.get(key);
  } finally {
    pool.release(client);
  }
}
```

### Java (Lettuce Connection Pool)

```java
@Bean
public LettuceConnectionFactory redisConnectionFactory() {
    LettucePoolingClientConfiguration poolConfig = LettucePoolingClientConfiguration.builder()
        .poolConfig(new GenericObjectPoolConfig<>() {{
            setMaxTotal(20);
            setMaxIdle(10);
            setMinIdle(5);
            setMaxWait(Duration.ofSeconds(3));
            setTestOnBorrow(true);
        }})
        .commandTimeout(Duration.ofSeconds(5))
        .build();

    RedisStandaloneConfiguration serverConfig = new RedisStandaloneConfiguration();
    serverConfig.setHostName("redis-master");
    serverConfig.setPort(6379);
    serverConfig.setPassword(RedisPassword.of(redisPassword));

    return new LettuceConnectionFactory(serverConfig, poolConfig);
}
```

## Redis Data Structures for Caching

### String: Simple Key-Value
```bash
SET user:123:profile '{"name":"Alice","email":"alice@example.com"}' EX 3600
GET user:123:profile
```

### Hash: Structured Data (Partial Read/Write)
```bash
HSET product:123 name "Widget" price "9.99" stock "42" updated_at "2025-01-15"
HGET product:123 price          # Read single field
HMGET product:123 name price    # Read multiple fields
HINCRBY product:123 stock -1    # Atomic field update
```

### Sorted Set: Ranked Data
```bash
# Leaderboard / top-N cache
ZADD trending 150 "product:123" 89 "product:456" 203 "product:789"
ZREVRANGE trending 0 9 WITHSCORES  # Top 10

# Time-based expiration set
ZADD expiring_keys <unix_timestamp> "session:abc"
ZRANGEBYSCORE expiring_keys 0 <now>  # Find expired entries
```

### HyperLogLog: Approximate Cardinality
```bash
# Count unique visitors (fixed 12KB memory regardless of cardinality)
PFADD page_views:2025-01-15 "user:123" "user:456" "user:789"
PFCOUNT page_views:2025-01-15  # ~3
```

## Anti-Patterns

1. **No connection pooling** - Creating a new Redis connection per request adds latency and can exhaust file descriptors.
2. **Large values without compression** - Storing multi-MB JSON objects wastes network bandwidth and Redis memory.
3. **Ignoring MOVED/ASK errors in Cluster** - Client libraries handle this, but custom implementations must follow redirections.
4. **Single Redis instance in production** - No high availability. Use Sentinel or Cluster for failover.
5. **Using KEYS command** - `KEYS *` blocks the server and scans all keys. Use `SCAN` for production.
6. **Not monitoring memory** - Redis evicts data when maxmemory is reached. Monitor and size appropriately.
7. **Storing non-serializable objects** - Functions, circular references, and symbols fail during serialization. Normalize data before caching.

## Production Checklist

- [ ] Redis deployed with high availability (Cluster or Sentinel)
- [ ] Connection pooling configured with appropriate min/max
- [ ] Serialization format chosen (JSON for development, binary for production performance)
- [ ] Memory limits set with eviction policy (allkeys-lru recommended)
- [ ] Near-cache invalidation mechanism in place (pub/sub or polling)
- [ ] Key naming convention established (e.g., `entity:id:field`)
- [ ] Hash tags used for related keys in Cluster mode
- [ ] Monitoring: memory usage, hit rate, connection count, latency
- [ ] Backup strategy configured (RDB snapshots or AOF)
- [ ] Network latency to Redis measured and acceptable (< 1ms in same region)
- [ ] Compression enabled for values larger than 1KB
- [ ] Key expiration set to prevent unbounded memory growth
