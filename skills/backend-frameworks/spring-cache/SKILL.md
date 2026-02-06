---
name: spring-cache
description: |
  Spring Cache abstraction for Spring Boot 3.x. Covers @Cacheable, @CacheEvict,
  @CachePut, cache managers (Caffeine, Redis, EhCache), TTL configuration,
  cache keys, conditional caching, and cache synchronization.

  USE WHEN: user mentions "spring cache", "@Cacheable", "@CacheEvict",
  "cache manager", "Caffeine cache", "@EnableCaching", "cache abstraction"

  DO NOT USE FOR: Redis operations - use `spring-data-redis` instead,
  distributed caching architecture - combine with `redis` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Cache

## Quick Start

```java
@SpringBootApplication
@EnableCaching
public class Application {}

@Service
public class UserService {

    @Cacheable("users")
    public User findById(Long id) {
        return userRepository.findById(id).orElseThrow();
    }

    @CacheEvict(value = "users", key = "#id")
    public void deleteUser(Long id) {
        userRepository.deleteById(id);
    }
}
```

```yaml
spring:
  cache:
    type: caffeine
    caffeine:
      spec: maximumSize=1000,expireAfterWrite=10m
```

---

## Cache Annotations

### @Cacheable

```java
@Cacheable("products")
public Product findById(Long id) { }

@Cacheable(value = "products", key = "#category + '-' + #status")
public List<Product> findByCategoryAndStatus(String category, String status) { }

@Cacheable(value = "products", condition = "#id > 0")
public Product findByIdConditional(Long id) { }

@Cacheable(value = "products", unless = "#result == null")
public Product findByIdUnlessNull(Long id) { }

@Cacheable(value = "products", sync = true)  // One thread populates
public Product findByIdSync(Long id) { }
```

### @CacheEvict

```java
@CacheEvict(value = "products", key = "#id")
public void deleteProduct(Long id) { }

@CacheEvict(value = "products", allEntries = true)
public void clearProductCache() { }

@CacheEvict(value = "products", key = "#id", beforeInvocation = true)
public void deleteProductBeforeInvocation(Long id) { }
```

### @CachePut

```java
@CachePut(value = "products", key = "#product.id")
public Product saveProduct(Product product) {
    return productRepository.save(product);
}

@CachePut(value = "products", key = "#result.id")
public Product createProduct(CreateProductRequest request) {
    return productRepository.save(new Product(request));
}
```

### @Caching (Multiple Operations)

```java
@Caching(
    put = {
        @CachePut(value = "products", key = "#result.id"),
        @CachePut(value = "productsBySku", key = "#result.sku")
    },
    evict = {
        @CacheEvict(value = "productList", allEntries = true)
    }
)
public Product createProduct(CreateProductRequest request) { }
```

### @CacheConfig (Class-Level)

```java
@Service
@CacheConfig(cacheNames = "products", keyGenerator = "customKeyGenerator")
public class ProductService {

    @Cacheable  // Uses class config
    public Product findById(Long id) { }

    @Cacheable(cacheNames = "inventory")  // Override cache name
    public Inventory getInventory(Long productId) { }
}
```

> **Full Reference**: See [managers.md](managers.md) for Caffeine, Redis, EhCache configurations.

---

## Quick Cache Manager Setup

### Caffeine (Single Instance)

```java
@Bean
public CacheManager cacheManager() {
    CaffeineCacheManager manager = new CaffeineCacheManager();
    manager.setCaffeine(Caffeine.newBuilder()
        .maximumSize(10_000)
        .expireAfterWrite(Duration.ofMinutes(10))
        .recordStats());
    return manager;
}
```

### Redis (Distributed)

```java
@Bean
public CacheManager cacheManager(RedisConnectionFactory factory) {
    RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
        .entryTtl(Duration.ofMinutes(10))
        .serializeValuesWith(SerializationPair
            .fromSerializer(new GenericJackson2JsonRedisSerializer()));

    return RedisCacheManager.builder(factory)
        .cacheDefaults(config)
        .build();
}
```

> **Full Reference**: See [advanced.md](advanced.md) for Multi-Level Caching, Metrics, Synchronization.

---

## Best Practices

| Do | Don't |
|----|-------|
| Use Caffeine for single-instance | Skip TTL configuration |
| Use Redis for distributed | Cache mutable objects |
| Configure TTL always | Ignore cache eviction |
| Use sync=true for expensive ops | Use high cardinality keys |
| Implement cache metrics | Cache sensitive data unencrypted |

---

## Production Checklist

- [ ] Cache provider configured (Caffeine/Redis)
- [ ] TTL configured for every cache
- [ ] Cache eviction on write operations
- [ ] Metrics configured
- [ ] Serialization tested
- [ ] Distributed lock for critical ops

---

## When NOT to Use This Skill

- **Distributed caching** - Use `spring-data-redis`
- **Redis operations** - Use `redis` skill
- **Session storage** - Use Spring Session

---

## Common Pitfalls

| Error | Cause | Solution |
|-------|-------|----------|
| Cache not working | Internal call (same bean) | Use self-injection |
| Null pointer | Null values cached | Use `unless = "#result == null"` |
| Memory leak | TTL not configured | Set expireAfterWrite |
| Serialization error | Non-serializable objects | Implement Serializable |

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Caching mutable objects | Stale data | Cache immutable data |
| No TTL configured | Stale cache forever | Set expireAfterWrite |
| @Cacheable on void | No effect | Only cache with return |
| No cache sync | Race conditions | Use sync=true or locks |

---

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Cache not working | Check @EnableCaching | Add annotation |
| Wrong data cached | Check cache key | Define explicit key |
| Cache not evicted | Check key expression | Verify key matches |
| Self-invocation bypass | Same class call | Inject self |

---

## Reference Files

| File | Content |
|------|---------|
| [managers.md](managers.md) | Caffeine, Redis, EhCache, Key Generators |
| [advanced.md](advanced.md) | Multi-Level, Metrics, Sync, Testing |

---

## External Documentation

- [Spring Cache Abstraction](https://docs.spring.io/spring-framework/reference/integration/cache.html)
- [Spring Boot Caching](https://docs.spring.io/spring-boot/reference/io/caching.html)
- [Caffeine](https://github.com/ben-manes/caffeine/wiki)
