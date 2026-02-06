# Cache Managers

## Caffeine (Consigliato per single instance)

```xml
<dependency>
    <groupId>com.github.ben-manes.caffeine</groupId>
    <artifactId>caffeine</artifactId>
</dependency>
```

```java
@Configuration
@EnableCaching
public class CaffeineCacheConfig {

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager cacheManager = new CaffeineCacheManager();

        cacheManager.setCaffeine(Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterWrite(Duration.ofMinutes(10))
            .recordStats());  // Per metriche

        return cacheManager;
    }

    // Cache multiple con configurazioni diverse
    @Bean
    public CacheManager multiCacheManager() {
        SimpleCacheManager cacheManager = new SimpleCacheManager();

        cacheManager.setCaches(List.of(
            buildCache("users", 1000, Duration.ofMinutes(30)),
            buildCache("products", 5000, Duration.ofMinutes(10)),
            buildCache("sessions", 10000, Duration.ofMinutes(5)),
            buildCache("config", 100, Duration.ofHours(1))
        ));

        return cacheManager;
    }

    private CaffeineCache buildCache(String name, int maxSize, Duration ttl) {
        return new CaffeineCache(name, Caffeine.newBuilder()
            .maximumSize(maxSize)
            .expireAfterWrite(ttl)
            .recordStats()
            .build());
    }
}
```

```yaml
# Via properties
spring:
  cache:
    type: caffeine
    caffeine:
      spec: maximumSize=10000,expireAfterWrite=600s,recordStats
    cache-names:
      - users
      - products
      - sessions
```

---

## Redis (Per distributed caching)

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

```java
@Configuration
@EnableCaching
public class RedisCacheConfig {

    @Bean
    public CacheManager cacheManager(RedisConnectionFactory connectionFactory) {
        RedisCacheConfiguration defaultConfig = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(10))
            .serializeKeysWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new StringRedisSerializer()))
            .serializeValuesWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new GenericJackson2JsonRedisSerializer()))
            .disableCachingNullValues();

        // Configurazioni per cache specifiche
        Map<String, RedisCacheConfiguration> cacheConfigs = Map.of(
            "users", defaultConfig.entryTtl(Duration.ofMinutes(30)),
            "products", defaultConfig.entryTtl(Duration.ofMinutes(10)),
            "sessions", defaultConfig.entryTtl(Duration.ofMinutes(5)),
            "config", defaultConfig.entryTtl(Duration.ofHours(1))
        );

        return RedisCacheManager.builder(connectionFactory)
            .cacheDefaults(defaultConfig)
            .withInitialCacheConfigurations(cacheConfigs)
            .transactionAware()
            .build();
    }

    // Con prefix personalizzato
    @Bean
    public CacheManager prefixedCacheManager(RedisConnectionFactory connectionFactory) {
        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
            .prefixCacheNameWith("myapp:")
            .entryTtl(Duration.ofMinutes(10));

        return RedisCacheManager.builder(connectionFactory)
            .cacheDefaults(config)
            .build();
    }
}
```

```yaml
# application.yml
spring:
  data:
    redis:
      host: localhost
      port: 6379
      password: ${REDIS_PASSWORD:}
      timeout: 2000ms
      lettuce:
        pool:
          max-active: 8
          max-idle: 8
          min-idle: 2

  cache:
    type: redis
    redis:
      time-to-live: 600000  # 10 minuti in ms
      cache-null-values: false
      key-prefix: "cache:"
      use-key-prefix: true
```

---

## EhCache 3

```xml
<dependency>
    <groupId>org.ehcache</groupId>
    <artifactId>ehcache</artifactId>
</dependency>
<dependency>
    <groupId>javax.cache</groupId>
    <artifactId>cache-api</artifactId>
</dependency>
```

```xml
<!-- ehcache.xml -->
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns="http://www.ehcache.org/v3"
        xsi:schemaLocation="http://www.ehcache.org/v3 http://www.ehcache.org/schema/ehcache-core-3.0.xsd">

    <cache alias="users">
        <key-type>java.lang.Long</key-type>
        <value-type>com.example.User</value-type>
        <expiry>
            <ttl unit="minutes">30</ttl>
        </expiry>
        <resources>
            <heap unit="entries">1000</heap>
            <offheap unit="MB">100</offheap>
        </resources>
    </cache>

    <cache alias="products">
        <key-type>java.lang.Long</key-type>
        <value-type>com.example.Product</value-type>
        <expiry>
            <ttl unit="minutes">10</ttl>
        </expiry>
        <resources>
            <heap unit="entries">5000</heap>
        </resources>
    </cache>
</config>
```

```yaml
spring:
  cache:
    jcache:
      config: classpath:ehcache.xml
```

---

## Custom Key Generator

```java
@Component("customKeyGenerator")
public class CustomKeyGenerator implements KeyGenerator {

    @Override
    public Object generate(Object target, Method method, Object... params) {
        StringBuilder key = new StringBuilder();

        key.append(target.getClass().getSimpleName())
           .append(".")
           .append(method.getName());

        for (Object param : params) {
            key.append("_");
            if (param != null) {
                if (param instanceof Pageable pageable) {
                    key.append("p").append(pageable.getPageNumber())
                       .append("s").append(pageable.getPageSize());
                } else {
                    key.append(param.hashCode());
                }
            } else {
                key.append("null");
            }
        }

        return key.toString();
    }
}

// Key generator per filtri complessi
@Component("filterKeyGenerator")
public class FilterKeyGenerator implements KeyGenerator {

    private final ObjectMapper objectMapper;

    @Override
    public Object generate(Object target, Method method, Object... params) {
        try {
            String className = target.getClass().getSimpleName();
            String methodName = method.getName();
            String paramsHash = DigestUtils.md5DigestAsHex(
                objectMapper.writeValueAsBytes(params)
            );
            return className + ":" + methodName + ":" + paramsHash;
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Error generating cache key", e);
        }
    }
}
```

---

## Cache Resolver

```java
// Cache resolver dinamico basato su runtime conditions
@Component("dynamicCacheResolver")
public class DynamicCacheResolver implements CacheResolver {

    private final CacheManager localCacheManager;
    private final CacheManager redisCacheManager;

    @Override
    public Collection<? extends Cache> resolveCaches(CacheOperationInvocationContext<?> context) {
        String cacheName = getCacheName(context);

        // Usa Redis per dati condivisi, locale per altri
        if (isSharedData(context)) {
            return List.of(redisCacheManager.getCache(cacheName));
        } else {
            return List.of(localCacheManager.getCache(cacheName));
        }
    }

    private boolean isSharedData(CacheOperationInvocationContext<?> context) {
        return context.getTarget().getClass().isAnnotationPresent(SharedCache.class);
    }

    private String getCacheName(CacheOperationInvocationContext<?> context) {
        return context.getOperation().getCacheNames().iterator().next();
    }
}

// Uso
@Service
@SharedCache
public class SharedDataService {

    @Cacheable(cacheResolver = "dynamicCacheResolver")
    public Data getSharedData(String key) {
        return repository.findByKey(key);
    }
}
```
