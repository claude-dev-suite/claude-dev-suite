# API Gateway

## Basic Configuration

```xml
<!-- pom.xml -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-gateway</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-netflix-eureka-client</artifactId>
</dependency>
```

```yaml
# application.yml - Gateway
server:
  port: 8080

spring:
  application:
    name: api-gateway
  cloud:
    gateway:
      discovery:
        locator:
          enabled: true
          lower-case-service-id: true
      routes:
        # Route with predicates
        - id: product-service
          uri: lb://product-service  # lb = load balanced
          predicates:
            - Path=/api/products/**
          filters:
            - StripPrefix=0
            - AddRequestHeader=X-Gateway, true

        - id: order-service
          uri: lb://order-service
          predicates:
            - Path=/api/orders/**
            - Method=GET,POST,PUT,DELETE
          filters:
            - StripPrefix=0
            - RewritePath=/api/orders/(?<segment>.*), /orders/${segment}

        - id: user-service
          uri: lb://user-service
          predicates:
            - Path=/api/users/**
            - Header=X-Request-Id, \d+
          filters:
            - StripPrefix=1
            - AddResponseHeader=X-Response-Time, %{time}

      # Global rate limiting
      default-filters:
        - name: RequestRateLimiter
          args:
            redis-rate-limiter.replenishRate: 10
            redis-rate-limiter.burstCapacity: 20
```

---

## Custom Filters

```java
@Component
public class AuthenticationFilter implements GlobalFilter, Ordered {

    private final JwtTokenProvider jwtProvider;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getPath().toString();

        // Skip auth for public paths
        if (isPublicPath(path)) {
            return chain.filter(exchange);
        }

        String authHeader = exchange.getRequest().getHeaders().getFirst("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        String token = authHeader.substring(7);
        try {
            String userId = jwtProvider.getUserId(token);
            ServerHttpRequest modifiedRequest = exchange.getRequest().mutate()
                .header("X-User-Id", userId)
                .build();
            return chain.filter(exchange.mutate().request(modifiedRequest).build());
        } catch (Exception e) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }
    }

    @Override
    public int getOrder() {
        return -100;  // High priority
    }

    private boolean isPublicPath(String path) {
        return path.startsWith("/api/auth") || path.equals("/actuator/health");
    }
}

@Component
public class LoggingFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(LoggingFilter.class);

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        long startTime = System.currentTimeMillis();
        String requestId = UUID.randomUUID().toString();

        ServerHttpRequest request = exchange.getRequest().mutate()
            .header("X-Request-Id", requestId)
            .build();

        log.info("[{}] {} {} started", requestId,
            request.getMethod(), request.getPath());

        return chain.filter(exchange.mutate().request(request).build())
            .then(Mono.fromRunnable(() -> {
                long duration = System.currentTimeMillis() - startTime;
                log.info("[{}] {} {} completed in {}ms - {}",
                    requestId,
                    request.getMethod(),
                    request.getPath(),
                    duration,
                    exchange.getResponse().getStatusCode());
            }));
    }

    @Override
    public int getOrder() {
        return -200;  // Before AuthenticationFilter
    }
}
```

---

## Programmatic Routes

```java
@Configuration
public class GatewayConfig {

    @Bean
    public RouteLocator customRouteLocator(RouteLocatorBuilder builder) {
        return builder.routes()
            .route("fallback", r -> r
                .path("/fallback")
                .filters(f -> f.setStatus(HttpStatus.SERVICE_UNAVAILABLE))
                .uri("no://op"))

            .route("product-service-v2", r -> r
                .path("/api/v2/products/**")
                .and()
                .header("X-Api-Version", "2")
                .filters(f -> f
                    .stripPrefix(2)
                    .addRequestHeader("X-Version", "2")
                    .circuitBreaker(c -> c
                        .setName("productCircuitBreaker")
                        .setFallbackUri("forward:/fallback")))
                .uri("lb://product-service-v2"))

            .route("retry-route", r -> r
                .path("/api/retry/**")
                .filters(f -> f
                    .retry(config -> config
                        .setRetries(3)
                        .setStatuses(HttpStatus.SERVICE_UNAVAILABLE)
                        .setMethods(HttpMethod.GET)
                        .setBackoff(Duration.ofMillis(100), Duration.ofSeconds(1), 2, true)))
                .uri("lb://flaky-service"))
            .build();
    }
}
```

---

## CORS Configuration

```java
@Configuration
public class CorsConfig {

    @Bean
    public CorsWebFilter corsWebFilter() {
        CorsConfiguration corsConfig = new CorsConfiguration();
        corsConfig.setAllowedOrigins(List.of("http://localhost:3000"));
        corsConfig.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        corsConfig.setAllowedHeaders(List.of("*"));
        corsConfig.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", corsConfig);

        return new CorsWebFilter(source);
    }
}
```
