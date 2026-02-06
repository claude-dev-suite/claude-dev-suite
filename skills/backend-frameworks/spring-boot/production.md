# Production Readiness

## Configuration & Profiles

```yaml
spring:
  profiles:
    active: ${SPRING_PROFILES_ACTIVE:dev}

---
spring:
  config:
    activate:
      on-profile: prod
  datasource:
    hikari:
      minimum-idle: 5
      maximum-pool-size: 20
      idle-timeout: 30000
      connection-timeout: 20000
  jpa:
    open-in-view: false
    properties:
      hibernate:
        jdbc:
          batch_size: 50
        order_inserts: true
        order_updates: true

server:
  compression:
    enabled: true
    mime-types: application/json,application/xml,text/plain
  tomcat:
    max-threads: 200
    accept-count: 100

management:
  endpoints:
    web:
      exposure:
        include: health,metrics,prometheus
  endpoint:
    health:
      show-details: when_authorized
```

---

## Health Checks

```java
@Component
public class DatabaseHealthIndicator implements HealthIndicator {

    private final DataSource dataSource;

    @Override
    public Health health() {
        try (Connection conn = dataSource.getConnection()) {
            if (conn.isValid(1)) {
                return Health.up()
                    .withDetail("database", "Available")
                    .build();
            }
        } catch (SQLException e) {
            return Health.down()
                .withDetail("error", e.getMessage())
                .build();
        }
        return Health.down().build();
    }
}
```

---

## Logging Configuration

```xml
<!-- logback-spring.xml -->
<configuration>
    <springProfile name="prod">
        <appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
            <encoder class="net.logstash.logback.encoder.LogstashEncoder">
                <includeMdcKeyName>requestId</includeMdcKeyName>
                <includeMdcKeyName>userId</includeMdcKeyName>
            </encoder>
        </appender>
        <root level="INFO">
            <appender-ref ref="JSON"/>
        </root>
    </springProfile>
</configuration>
```

```java
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestLoggingFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
            HttpServletResponse response, FilterChain chain) throws Exception {
        String requestId = UUID.randomUUID().toString();
        MDC.put("requestId", requestId);
        response.setHeader("X-Request-ID", requestId);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.clear();
        }
    }
}
```

---

## Graceful Shutdown

```yaml
server:
  shutdown: graceful

spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s
```

```java
@Component
public class GracefulShutdown implements ApplicationListener<ContextClosedEvent> {

    private final ExecutorService executorService;

    @Override
    public void onApplicationEvent(ContextClosedEvent event) {
        executorService.shutdown();
        try {
            if (!executorService.awaitTermination(30, TimeUnit.SECONDS)) {
                executorService.shutdownNow();
            }
        } catch (InterruptedException e) {
            executorService.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}
```

---

## Caching

```java
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public CacheManager cacheManager(RedisConnectionFactory factory) {
        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(10))
            .serializeKeysWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new StringRedisSerializer()))
            .serializeValuesWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new GenericJackson2JsonRedisSerializer()));

        return RedisCacheManager.builder(factory)
            .cacheDefaults(config)
            .build();
    }
}

// Usage
@Service
public class UserService {
    @Cacheable(value = "users", key = "#id")
    public UserResponse findById(Long id) { ... }

    @CacheEvict(value = "users", key = "#id")
    public void delete(Long id) { ... }
}
```

---

## Monitoring Metrics

| Metric | Target |
|--------|--------|
| Response time (p99) | < 200ms |
| Error rate | < 0.1% |
| Health check | 100% |
| Connection pool usage | < 80% |

---

## Production Checklist

- [ ] Profile-based configuration
- [ ] Connection pool sizing (HikariCP)
- [ ] Health checks with Actuator
- [ ] Structured JSON logging (Logstash)
- [ ] Request ID tracing (MDC)
- [ ] Graceful shutdown configured
- [ ] Caching layer (Redis)
- [ ] JPA batch operations
- [ ] open-in-view disabled
- [ ] Metrics exported (Prometheus)
