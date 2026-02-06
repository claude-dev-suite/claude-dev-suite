---
name: spring-cloud-gateway
description: |
  Spring Cloud Gateway for API routing, filtering, and load balancing.
  Covers route predicates, filters, rate limiting, and circuit breaker integration.

  USE WHEN: user mentions "spring cloud gateway", "API gateway", "route predicates",
  "gateway filters", "rate limiting gateway", "load balancing gateway"

  DO NOT USE FOR: simple reverse proxy - use nginx,
  Zuul (deprecated) - use Spring Cloud Gateway instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Cloud Gateway - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-cloud-gateway` for comprehensive documentation.

## Dependencies

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-gateway</artifactId>
</dependency>
<!-- For service discovery -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-netflix-eureka-client</artifactId>
</dependency>
```

## Basic Configuration

### application.yml
```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: user-service
          uri: lb://USER-SERVICE
          predicates:
            - Path=/api/users/**
          filters:
            - StripPrefix=1
            - AddRequestHeader=X-Gateway, true

        - id: order-service
          uri: lb://ORDER-SERVICE
          predicates:
            - Path=/api/orders/**
            - Method=GET,POST,PUT,DELETE
          filters:
            - StripPrefix=1
            - name: CircuitBreaker
              args:
                name: orderCB
                fallbackUri: forward:/fallback/orders

      discovery:
        locator:
          enabled: true
          lower-case-service-id: true

      default-filters:
        - DedupeResponseHeader=Access-Control-Allow-Origin
        - AddResponseHeader=X-Response-Time, ${now}
```

## Route Predicates

### Path Predicate
```yaml
predicates:
  - Path=/api/users/**
  - Path=/api/v{version}/users/**  # Path variable
```

### Header Predicate
```yaml
predicates:
  - Header=X-Request-Id, \d+
  - Header=Authorization, Bearer.*
```

### Method Predicate
```yaml
predicates:
  - Method=GET,POST
```

### Query Predicate
```yaml
predicates:
  - Query=page
  - Query=status, active|pending
```

### Host Predicate
```yaml
predicates:
  - Host=**.myhost.org
```

### Time Predicates
```yaml
predicates:
  - After=2024-01-01T00:00:00+00:00
  - Before=2025-12-31T23:59:59+00:00
  - Between=2024-01-01T00:00:00+00:00, 2025-12-31T23:59:59+00:00
```

## Built-in Filters

### Request Modification
```yaml
filters:
  - AddRequestHeader=X-Request-Foo, Bar
  - AddRequestParameter=foo, bar
  - RemoveRequestHeader=Cookie
  - SetPath=/api/v2/{segment}
  - RewritePath=/api/(?<segment>.*), /$\{segment}
  - StripPrefix=2
  - PrefixPath=/api
```

### Response Modification
```yaml
filters:
  - AddResponseHeader=X-Response-Foo, Bar
  - RemoveResponseHeader=X-Internal-Header
  - RewriteResponseHeader=X-Request-Id, , -
  - SetStatus=401
```

### Rate Limiting
```yaml
filters:
  - name: RequestRateLimiter
    args:
      redis-rate-limiter.replenishRate: 10
      redis-rate-limiter.burstCapacity: 20
      redis-rate-limiter.requestedTokens: 1
      key-resolver: "#{@userKeyResolver}"
```

```java
@Bean
public KeyResolver userKeyResolver() {
    return exchange -> Mono.just(
        exchange.getRequest().getHeaders()
            .getFirst("X-User-Id"));
}
```

### Circuit Breaker
```yaml
filters:
  - name: CircuitBreaker
    args:
      name: myCircuitBreaker
      fallbackUri: forward:/fallback
      statusCodes:
        - 500
        - 503
```

### Retry
```yaml
filters:
  - name: Retry
    args:
      retries: 3
      statuses: BAD_GATEWAY,SERVICE_UNAVAILABLE
      methods: GET
      backoff:
        firstBackoff: 100ms
        maxBackoff: 500ms
        factor: 2
```

## Java Configuration

### RouteLocator Bean
```java
@Configuration
public class GatewayConfig {

    @Bean
    public RouteLocator customRouteLocator(RouteLocatorBuilder builder) {
        return builder.routes()
            .route("user-service", r -> r
                .path("/api/users/**")
                .filters(f -> f
                    .stripPrefix(1)
                    .addRequestHeader("X-Gateway", "true")
                    .circuitBreaker(c -> c
                        .setName("userCB")
                        .setFallbackUri("forward:/fallback/users")))
                .uri("lb://USER-SERVICE"))

            .route("order-service", r -> r
                .path("/api/orders/**")
                .and()
                .method(HttpMethod.GET, HttpMethod.POST)
                .filters(f -> f
                    .stripPrefix(1)
                    .retry(retryConfig -> retryConfig
                        .setRetries(3)
                        .setStatuses(HttpStatus.BAD_GATEWAY)))
                .uri("lb://ORDER-SERVICE"))
            .build();
    }
}
```

## Custom Filters

### Global Filter
```java
@Component
@Order(-1)
public class LoggingGlobalFilter implements GlobalFilter {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        long startTime = System.currentTimeMillis();
        String requestId = UUID.randomUUID().toString();

        exchange.getRequest().mutate()
            .header("X-Request-Id", requestId);

        log.info("Request {} {} started - ID: {}",
            exchange.getRequest().getMethod(),
            exchange.getRequest().getURI().getPath(),
            requestId);

        return chain.filter(exchange)
            .then(Mono.fromRunnable(() -> {
                long duration = System.currentTimeMillis() - startTime;
                log.info("Request {} completed in {}ms - Status: {}",
                    requestId, duration,
                    exchange.getResponse().getStatusCode());
            }));
    }
}
```

### Custom GatewayFilter
```java
@Component
public class AuthenticationFilter implements GatewayFilterFactory<AuthenticationFilter.Config> {

    @Override
    public GatewayFilter apply(Config config) {
        return (exchange, chain) -> {
            String token = exchange.getRequest().getHeaders()
                .getFirst(HttpHeaders.AUTHORIZATION);

            if (token == null || !token.startsWith("Bearer ")) {
                exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                return exchange.getResponse().setComplete();
            }

            // Validate token
            try {
                Claims claims = validateToken(token.substring(7));
                exchange.getRequest().mutate()
                    .header("X-User-Id", claims.getSubject())
                    .header("X-User-Roles", claims.get("roles", String.class));
            } catch (Exception e) {
                exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                return exchange.getResponse().setComplete();
            }

            return chain.filter(exchange);
        };
    }

    @Override
    public Class<Config> getConfigClass() {
        return Config.class;
    }

    public static class Config {
        // Configuration properties
    }
}
```

## Fallback Controller

```java
@RestController
@RequestMapping("/fallback")
public class FallbackController {

    @GetMapping("/users")
    public Mono<ResponseEntity<Map<String, String>>> usersFallback() {
        return Mono.just(ResponseEntity
            .status(HttpStatus.SERVICE_UNAVAILABLE)
            .body(Map.of(
                "error", "User service is currently unavailable",
                "message", "Please try again later"
            )));
    }

    @GetMapping("/orders")
    public Mono<ResponseEntity<Map<String, String>>> ordersFallback() {
        return Mono.just(ResponseEntity
            .status(HttpStatus.SERVICE_UNAVAILABLE)
            .body(Map.of(
                "error", "Order service is currently unavailable",
                "message", "Please try again later"
            )));
    }
}
```

## CORS Configuration

```java
@Configuration
public class CorsConfig {

    @Bean
    public CorsWebFilter corsWebFilter() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of("https://myapp.com"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);

        return new CorsWebFilter(source);
    }
}
```

## Actuator Endpoints

```yaml
management:
  endpoints:
    web:
      exposure:
        include: gateway,health,info
  endpoint:
    gateway:
      enabled: true
```

```bash
# List all routes
GET /actuator/gateway/routes

# Get specific route
GET /actuator/gateway/routes/{id}

# Refresh routes
POST /actuator/gateway/refresh

# Get global filters
GET /actuator/gateway/globalfilters

# Get route filters
GET /actuator/gateway/routefilters
```

## Best Practices

| Do | Don't |
|----|-------|
| Use service discovery (lb://) | Hardcode service URLs |
| Implement circuit breakers | Let failures cascade |
| Add request/response logging | Deploy without observability |
| Configure rate limiting | Allow unlimited requests |
| Use path-based routing | Over-complicate predicates |

## Production Checklist

- [ ] Service discovery enabled
- [ ] Circuit breakers configured
- [ ] Rate limiting implemented
- [ ] CORS properly configured
- [ ] Authentication filter added
- [ ] Logging/tracing enabled
- [ ] Fallback handlers defined
- [ ] Actuator endpoints secured
- [ ] Timeouts configured
- [ ] Health checks enabled

## When NOT to Use This Skill

- **Simple proxy** - Use nginx for basic routing
- **Zuul** - Deprecated, migrate to Gateway
- **Non-reactive** - Gateway is WebFlux-based
- **Edge functions** - Consider Cloudflare Workers, Lambda@Edge

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Blocking calls in filters | Degrades performance | Use reactive operators |
| No rate limiting | DDoS vulnerability | Add RequestRateLimiter |
| Missing circuit breaker | Cascading failures | Integrate with Resilience4j |
| No timeouts | Hanging requests | Configure response timeout |
| Logging body | Memory issues | Log only metadata |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Route not matching | Check predicates | Verify path, method, headers |
| Service unavailable | Check discovery | Verify lb:// service name |
| Filters not executing | Check order | Verify filter chain order |
| CORS issues | Check CORS config | Add GlobalCorsProperties |
| Timeouts | Check response-timeout | Increase or fix downstream |

## Reference Documentation
- [Spring Cloud Gateway Reference](https://docs.spring.io/spring-cloud-gateway/reference/)
