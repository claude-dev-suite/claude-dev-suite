# Advanced Cache Patterns

## Multi-Level Caching

```java
@Configuration
@EnableCaching
public class MultiLevelCacheConfig {

    @Bean
    @Primary
    public CacheManager cacheManager(
            CaffeineCacheManager localCacheManager,
            RedisCacheManager redisCacheManager) {

        return new CompositeCacheManager(localCacheManager, redisCacheManager);
    }

    @Bean
    public CaffeineCacheManager localCacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager();
        manager.setCaffeine(Caffeine.newBuilder()
            .maximumSize(1000)
            .expireAfterWrite(Duration.ofMinutes(5)));
        return manager;
    }

    @Bean
    public RedisCacheManager redisCacheManager(RedisConnectionFactory factory) {
        return RedisCacheManager.builder(factory)
            .cacheDefaults(RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofMinutes(30)))
            .build();
    }
}

// Custom CompositeCacheManager
public class CompositeCacheManager implements CacheManager {

    private final List<CacheManager> cacheManagers;

    @Override
    public Cache getCache(String name) {
        return new CompositeCache(name,
            cacheManagers.stream()
                .map(cm -> cm.getCache(name))
                .filter(Objects::nonNull)
                .toList()
        );
    }

    @Override
    public Collection<String> getCacheNames() {
        return cacheManagers.stream()
            .flatMap(cm -> cm.getCacheNames().stream())
            .distinct()
            .toList();
    }
}

// CompositeCache - Read-through L1 -> L2, Write-through L1 + L2
public class CompositeCache implements Cache {

    private final String name;
    private final List<Cache> caches;

    @Override
    public ValueWrapper get(Object key) {
        for (Cache cache : caches) {
            ValueWrapper value = cache.get(key);
            if (value != null) {
                // Populate higher-level caches
                populateHigherLevelCaches(key, value.get(), cache);
                return value;
            }
        }
        return null;
    }

    @Override
    public void put(Object key, Object value) {
        // Write to all levels
        caches.forEach(cache -> cache.put(key, value));
    }

    @Override
    public void evict(Object key) {
        caches.forEach(cache -> cache.evict(key));
    }

    private void populateHigherLevelCaches(Object key, Object value, Cache sourceCache) {
        for (Cache cache : caches) {
            if (cache == sourceCache) break;
            cache.put(key, value);
        }
    }
}
```

---

## Cache Metrics

```java
@Configuration
public class CacheMetricsConfig {

    @Bean
    public CacheManager cacheManagerWithMetrics(MeterRegistry meterRegistry) {
        CaffeineCacheManager cacheManager = new CaffeineCacheManager();

        cacheManager.setCaffeine(Caffeine.newBuilder()
            .maximumSize(10000)
            .expireAfterWrite(Duration.ofMinutes(10))
            .recordStats());

        // Register metrics for each cache
        cacheManager.setCacheNames(List.of("users", "products", "sessions"));

        return cacheManager;
    }

    // Manual metrics
    @Component
    public class CacheMetricsCollector {

        private final CacheManager cacheManager;
        private final MeterRegistry meterRegistry;

        @Scheduled(fixedRate = 60000)
        public void collectMetrics() {
            cacheManager.getCacheNames().forEach(cacheName -> {
                Cache cache = cacheManager.getCache(cacheName);
                if (cache instanceof CaffeineCache caffeineCache) {
                    com.github.benmanes.caffeine.cache.Cache<Object, Object> nativeCache =
                        caffeineCache.getNativeCache();
                    CacheStats stats = nativeCache.stats();

                    Gauge.builder("cache.size", nativeCache, c -> c.estimatedSize())
                        .tag("cache", cacheName)
                        .register(meterRegistry);

                    Gauge.builder("cache.hit.rate", stats, CacheStats::hitRate)
                        .tag("cache", cacheName)
                        .register(meterRegistry);

                    Gauge.builder("cache.eviction.count", stats, CacheStats::evictionCount)
                        .tag("cache", cacheName)
                        .register(meterRegistry);
                }
            });
        }
    }
}
```

---

## Cache Synchronization

```java
// To avoid race conditions during cache population
@Service
public class ProductService {

    // sync=true ensures that only one thread populates the cache
    @Cacheable(value = "products", key = "#id", sync = true)
    public Product findById(Long id) {
        return productRepository.findById(id).orElseThrow();
    }
}

// Distributed lock for Redis
@Component
public class DistributedCacheService {

    private final RedisTemplate<String, Object> redisTemplate;
    private final RedisLockRegistry lockRegistry;

    @Cacheable(value = "expensive-data", key = "#key")
    public Object getExpensiveData(String key) {
        Lock lock = lockRegistry.obtain("cache-lock:" + key);

        try {
            if (lock.tryLock(10, TimeUnit.SECONDS)) {
                try {
                    // Check cache again after acquiring the lock
                    Object cached = redisTemplate.opsForValue().get("expensive-data:" + key);
                    if (cached != null) {
                        return cached;
                    }

                    // Compute expensive operation
                    Object result = computeExpensiveOperation(key);

                    // Store in cache
                    redisTemplate.opsForValue().set(
                        "expensive-data:" + key,
                        result,
                        Duration.ofMinutes(10)
                    );

                    return result;
                } finally {
                    lock.unlock();
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        throw new RuntimeException("Could not acquire lock");
    }
}
```

---

## Testing Cache

```java
@SpringBootTest
class CacheTest {

    @Autowired
    private ProductService productService;

    @Autowired
    private CacheManager cacheManager;

    @BeforeEach
    void clearCache() {
        cacheManager.getCacheNames()
            .forEach(name -> cacheManager.getCache(name).clear());
    }

    @Test
    void findById_shouldCacheResult() {
        Long productId = 1L;

        // First call - cache miss
        Product first = productService.findById(productId);

        // Second call - cache hit
        Product second = productService.findById(productId);

        assertThat(first).isSameAs(second);

        // Verify cache contains the value
        Cache cache = cacheManager.getCache("products");
        assertThat(cache.get(productId)).isNotNull();
    }

    @Test
    void updateProduct_shouldEvictCache() {
        Long productId = 1L;

        // Populate cache
        productService.findById(productId);

        // Verify cache populated
        Cache cache = cacheManager.getCache("products");
        assertThat(cache.get(productId)).isNotNull();

        // Update - should evict
        productService.updateProduct(productId, new ProductUpdate());

        // Verify cache evicted
        assertThat(cache.get(productId)).isNull();
    }
}

// Test with mock CacheManager
@SpringBootTest
@AutoConfigureCache
class CacheDisabledTest {

    @MockBean
    private CacheManager cacheManager;

    @Test
    void test_withNoOpCache() {
        when(cacheManager.getCache(anyString()))
            .thenReturn(new NoOpCache("test"));

        // Test logic without real caching
    }
}
```
