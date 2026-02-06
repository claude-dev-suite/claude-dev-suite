---
name: spring-data-redis
description: |
  Spring Data Redis for caching, session storage, and data persistence.
  Covers RedisTemplate, @Cacheable, repositories, pub/sub, and distributed locks.

  USE WHEN: user mentions "spring data redis", "RedisTemplate", "@Cacheable",
  "Spring Boot caching", "@RedisHash", "spring session redis", "distributed lock Spring"

  DO NOT USE FOR: raw Redis commands - use `redis` instead,
  non-Spring Redis clients - use `redis` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Data Redis - Quick Reference

> **Full Reference**: See [advanced.md](advanced.md) for hash/list/set operations, sorted sets, @RedisHash repository pattern, pub/sub configuration, and distributed lock patterns.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-data-redis` for comprehensive documentation.

## Dependencies

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
<!-- For reactive -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis-reactive</artifactId>
</dependency>
```

## Configuration

```yaml
spring:
  data:
    redis:
      host: localhost
      port: 6379
      password: ${REDIS_PASSWORD:}
      database: 0
      timeout: 2000ms
      lettuce:
        pool:
          max-active: 8
          max-idle: 8
          min-idle: 2

  cache:
    type: redis
    redis:
      time-to-live: 3600000  # 1 hour
      cache-null-values: false
      key-prefix: "myapp:"
```

## RedisTemplate Configuration

```java
@Configuration
public class RedisConfig {

    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory connectionFactory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);

        Jackson2JsonRedisSerializer<Object> jsonSerializer =
            new Jackson2JsonRedisSerializer<>(Object.class);

        template.setKeySerializer(new StringRedisSerializer());
        template.setHashKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(jsonSerializer);
        template.setHashValueSerializer(jsonSerializer);

        template.afterPropertiesSet();
        return template;
    }
}
```

## Basic String Operations

```java
@Service
@RequiredArgsConstructor
public class RedisService {

    private final RedisTemplate<String, Object> redisTemplate;

    public void set(String key, Object value, Duration ttl) {
        redisTemplate.opsForValue().set(key, value, ttl);
    }

    public Object get(String key) {
        return redisTemplate.opsForValue().get(key);
    }

    public boolean setIfAbsent(String key, Object value, Duration ttl) {
        return Boolean.TRUE.equals(
            redisTemplate.opsForValue().setIfAbsent(key, value, ttl));
    }

    public Long increment(String key) {
        return redisTemplate.opsForValue().increment(key);
    }

    public void delete(String key) {
        redisTemplate.delete(key);
    }
}
```

## Spring Cache Integration

```java
@SpringBootApplication
@EnableCaching
public class Application { }

@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public RedisCacheManager cacheManager(RedisConnectionFactory connectionFactory) {
        RedisCacheConfiguration defaultConfig = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(30))
            .disableCachingNullValues()
            .serializeKeysWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new StringRedisSerializer()))
            .serializeValuesWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new GenericJackson2JsonRedisSerializer()));

        Map<String, RedisCacheConfiguration> cacheConfigs = Map.of(
            "users", defaultConfig.entryTtl(Duration.ofHours(1)),
            "products", defaultConfig.entryTtl(Duration.ofMinutes(15))
        );

        return RedisCacheManager.builder(connectionFactory)
            .cacheDefaults(defaultConfig)
            .withInitialCacheConfigurations(cacheConfigs)
            .build();
    }
}
```

## Cache Annotations

```java
@Service
public class UserService {

    @Cacheable(value = "users", key = "#id")
    public User getUserById(Long id) {
        return userRepository.findById(id).orElse(null);
    }

    @CachePut(value = "users", key = "#user.id")
    public User updateUser(User user) {
        return userRepository.save(user);
    }

    @CacheEvict(value = "users", key = "#id")
    public void deleteUser(Long id) {
        userRepository.deleteById(id);
    }

    @CacheEvict(value = "users", allEntries = true)
    public void clearUserCache() { }
}
```

## When NOT to Use This Skill

- **Raw Redis commands** - Use `redis` skill for low-level operations
- **Non-Spring applications** - Use Jedis or Lettuce directly
- **Primary database** - Redis is for caching, not primary storage
- **Complex queries** - Use SQL databases for complex queries

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| No TTL on cached data | Memory exhaustion | Always set expiration |
| Large objects in cache | Memory pressure | Keep values small |
| Cache stampede | Thundering herd | Use distributed locks |
| @Cacheable on void methods | No effect | Only cache return values |
| Caching mutable objects | Stale data | Cache immutable or clone |
| No connection pooling | Connection exhaustion | Configure Lettuce pool |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Connection refused | Check Redis running | Start Redis, check host/port |
| Cache not working | Check @EnableCaching | Add annotation, verify AOP proxy |
| Serialization error | Check object type | Configure proper serializer |
| Memory issues | `redis-cli INFO memory` | Set maxmemory, eviction policy |

## Production Checklist

- [ ] Connection pool configured
- [ ] TTL set on all keys
- [ ] Serializers configured
- [ ] Cluster/Sentinel for HA
- [ ] Memory limits set
- [ ] Eviction policy configured
- [ ] Monitoring enabled
- [ ] Error handling for failures

## Reference Documentation
- [Spring Data Redis Reference](https://docs.spring.io/spring-data/redis/reference/)
