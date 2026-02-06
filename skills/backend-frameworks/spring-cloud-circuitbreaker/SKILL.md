---
name: spring-cloud-circuitbreaker
description: |
  Resilience patterns with Spring Cloud Circuit Breaker and Resilience4j.
  Covers circuit breaker, retry, rate limiter, bulkhead, and fallback patterns.

  USE WHEN: user mentions "circuit breaker", "resilience4j", "fallback",
  "retry pattern", "rate limiter", "bulkhead", "fault tolerance Spring"

  DO NOT USE FOR: basic HTTP errors - handle in code,
  Hystrix (deprecated) - use Resilience4j instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Cloud Circuit Breaker - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-cloud-circuitbreaker` for comprehensive documentation.

## Dependencies

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-circuitbreaker-resilience4j</artifactId>
</dependency>
<!-- For reactive -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-circuitbreaker-reactor-resilience4j</artifactId>
</dependency>
```

## Circuit Breaker States

```
         ┌─────────────────────────────────────┐
         │                                     │
         ▼                                     │
    ┌─────────┐    failure threshold    ┌──────────┐
    │ CLOSED  │ ──────────────────────▶ │   OPEN   │
    │ (normal)│                         │(rejecting)│
    └─────────┘                         └──────────┘
         ▲                                     │
         │                                     │
         │      wait duration expires          │
         │                                     ▼
         │                              ┌───────────┐
         └────── success ──────────────│ HALF_OPEN │
                                       │ (testing) │
                                       └───────────┘
```

## Basic Configuration

### application.yml
```yaml
resilience4j:
  circuitbreaker:
    configs:
      default:
        sliding-window-size: 10
        sliding-window-type: COUNT_BASED
        failure-rate-threshold: 50
        slow-call-rate-threshold: 100
        slow-call-duration-threshold: 2s
        permitted-number-of-calls-in-half-open-state: 3
        wait-duration-in-open-state: 10s
        automatic-transition-from-open-to-half-open-enabled: true
        record-exceptions:
          - java.io.IOException
          - java.net.SocketTimeoutException
        ignore-exceptions:
          - com.example.BusinessException

    instances:
      user-service:
        base-config: default
        failure-rate-threshold: 30
        wait-duration-in-open-state: 5s

      payment-service:
        base-config: default
        failure-rate-threshold: 20
        slow-call-duration-threshold: 1s

  retry:
    configs:
      default:
        max-attempts: 3
        wait-duration: 500ms
        retry-exceptions:
          - java.io.IOException
        ignore-exceptions:
          - com.example.BusinessException

    instances:
      user-service:
        base-config: default
        max-attempts: 5

  timelimiter:
    configs:
      default:
        timeout-duration: 3s
        cancel-running-future: true

    instances:
      user-service:
        timeout-duration: 5s

  bulkhead:
    configs:
      default:
        max-concurrent-calls: 25
        max-wait-duration: 0

    instances:
      user-service:
        max-concurrent-calls: 10

  ratelimiter:
    configs:
      default:
        limit-for-period: 100
        limit-refresh-period: 1s
        timeout-duration: 0

    instances:
      api-calls:
        limit-for-period: 50
        limit-refresh-period: 1s
```

## Programmatic Usage

### CircuitBreakerFactory
```java
@Service
@RequiredArgsConstructor
public class UserService {

    private final CircuitBreakerFactory circuitBreakerFactory;
    private final UserClient userClient;

    public User getUser(Long id) {
        CircuitBreaker circuitBreaker = circuitBreakerFactory.create("user-service");

        return circuitBreaker.run(
            () -> userClient.getUserById(id),
            throwable -> getDefaultUser(id, throwable)
        );
    }

    private User getDefaultUser(Long id, Throwable throwable) {
        log.warn("Fallback for user {}: {}", id, throwable.getMessage());
        return User.builder()
            .id(id)
            .name("Unknown")
            .status("FALLBACK")
            .build();
    }
}
```

### Reactive
```java
@Service
public class ReactiveUserService {

    private final ReactiveCircuitBreakerFactory circuitBreakerFactory;
    private final WebClient webClient;

    public Mono<User> getUser(Long id) {
        ReactiveCircuitBreaker circuitBreaker = circuitBreakerFactory.create("user-service");

        return circuitBreaker.run(
            webClient.get()
                .uri("/users/{id}", id)
                .retrieve()
                .bodyToMono(User.class),
            throwable -> Mono.just(User.fallback(id))
        );
    }
}
```

## Annotation-Based

### @CircuitBreaker
```java
@Service
public class PaymentService {

    @CircuitBreaker(name = "payment-service", fallbackMethod = "paymentFallback")
    public PaymentResult processPayment(PaymentRequest request) {
        return paymentClient.process(request);
    }

    private PaymentResult paymentFallback(PaymentRequest request, Throwable t) {
        log.error("Payment failed for order {}: {}", request.getOrderId(), t.getMessage());
        return PaymentResult.builder()
            .status("PENDING")
            .message("Payment service unavailable, will retry later")
            .build();
    }
}
```

### @Retry
```java
@Service
public class NotificationService {

    @Retry(name = "notification-service", fallbackMethod = "notifyFallback")
    public void sendNotification(Notification notification) {
        notificationClient.send(notification);
    }

    private void notifyFallback(Notification notification, Throwable t) {
        log.warn("Failed to send notification, queueing for retry: {}", t.getMessage());
        retryQueue.add(notification);
    }
}
```

### @RateLimiter
```java
@Service
public class ApiService {

    @RateLimiter(name = "api-calls", fallbackMethod = "rateLimitFallback")
    public ApiResponse callExternalApi(ApiRequest request) {
        return externalClient.call(request);
    }

    private ApiResponse rateLimitFallback(ApiRequest request, Throwable t) {
        throw new TooManyRequestsException("Rate limit exceeded");
    }
}
```

### @Bulkhead
```java
@Service
public class ReportService {

    @Bulkhead(name = "report-service", type = Bulkhead.Type.THREADPOOL)
    public CompletableFuture<Report> generateReport(ReportRequest request) {
        return CompletableFuture.supplyAsync(() -> reportGenerator.generate(request));
    }
}
```

### @TimeLimiter
```java
@Service
public class SlowService {

    @TimeLimiter(name = "slow-service", fallbackMethod = "timeoutFallback")
    public CompletableFuture<Result> slowOperation() {
        return CompletableFuture.supplyAsync(() -> {
            // Potentially slow operation
            return performSlowOperation();
        });
    }

    private CompletableFuture<Result> timeoutFallback(Throwable t) {
        return CompletableFuture.completedFuture(Result.timeout());
    }
}
```

### Combined Annotations
```java
@Service
public class ResilientService {

    @CircuitBreaker(name = "backend", fallbackMethod = "fallback")
    @Retry(name = "backend")
    @RateLimiter(name = "backend")
    @Bulkhead(name = "backend")
    @TimeLimiter(name = "backend")
    public CompletableFuture<Response> resilientCall(Request request) {
        return CompletableFuture.supplyAsync(() -> backendClient.call(request));
    }

    private CompletableFuture<Response> fallback(Request request, Throwable t) {
        log.error("All resilience measures failed: {}", t.getMessage());
        return CompletableFuture.completedFuture(Response.error());
    }
}
```

## Customization

### Custom CircuitBreaker Config
```java
@Configuration
public class CircuitBreakerConfig {

    @Bean
    public Customizer<Resilience4JCircuitBreakerFactory> defaultCustomizer() {
        return factory -> factory.configureDefault(id ->
            new Resilience4JConfigBuilder(id)
                .circuitBreakerConfig(CircuitBreakerConfig.custom()
                    .slidingWindowSize(10)
                    .failureRateThreshold(50)
                    .waitDurationInOpenState(Duration.ofSeconds(10))
                    .permittedNumberOfCallsInHalfOpenState(3)
                    .build())
                .timeLimiterConfig(TimeLimiterConfig.custom()
                    .timeoutDuration(Duration.ofSeconds(3))
                    .build())
                .build());
    }

    @Bean
    public Customizer<Resilience4JCircuitBreakerFactory> specificCustomizer() {
        return factory -> factory.configure(builder ->
            builder.circuitBreakerConfig(CircuitBreakerConfig.custom()
                .failureRateThreshold(25)
                .build()),
            "payment-service", "critical-service");
    }
}
```

### Event Listeners
```java
@Component
public class CircuitBreakerEventListener {

    @Autowired
    private CircuitBreakerRegistry circuitBreakerRegistry;

    @PostConstruct
    public void init() {
        circuitBreakerRegistry.getAllCircuitBreakers().forEach(cb -> {
            cb.getEventPublisher()
                .onStateTransition(event ->
                    log.info("Circuit breaker {} state changed: {} -> {}",
                        event.getCircuitBreakerName(),
                        event.getStateTransition().getFromState(),
                        event.getStateTransition().getToState()))
                .onFailureRateExceeded(event ->
                    log.warn("Circuit breaker {} failure rate exceeded: {}%",
                        event.getCircuitBreakerName(),
                        event.getFailureRate()))
                .onSlowCallRateExceeded(event ->
                    log.warn("Circuit breaker {} slow call rate exceeded: {}%",
                        event.getCircuitBreakerName(),
                        event.getSlowCallRate()));
        });
    }
}
```

## Metrics and Monitoring

### Actuator Endpoints
```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,circuitbreakers,retries,ratelimiters,bulkheads

  health:
    circuitbreakers:
      enabled: true
    ratelimiters:
      enabled: true
```

```bash
# Circuit breaker status
GET /actuator/circuitbreakers

# Specific circuit breaker
GET /actuator/circuitbreakers/{name}

# Circuit breaker events
GET /actuator/circuitbreakerevents

# Health with details
GET /actuator/health
```

### Metrics (Prometheus)
```yaml
management:
  metrics:
    tags:
      application: ${spring.application.name}
    export:
      prometheus:
        enabled: true
```

Key metrics:
- `resilience4j_circuitbreaker_state`
- `resilience4j_circuitbreaker_calls_total`
- `resilience4j_circuitbreaker_failure_rate`
- `resilience4j_retry_calls_total`
- `resilience4j_ratelimiter_available_permissions`
- `resilience4j_bulkhead_available_concurrent_calls`

## Spring Cloud Gateway Integration

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
            - name: CircuitBreaker
              args:
                name: userServiceCB
                fallbackUri: forward:/fallback/users
            - name: Retry
              args:
                retries: 3
                statuses: BAD_GATEWAY,SERVICE_UNAVAILABLE
```

## Best Practices

| Do | Don't |
|----|-------|
| Set appropriate thresholds | Use defaults in production |
| Implement meaningful fallbacks | Return errors in fallbacks |
| Monitor circuit breaker state | Ignore state transitions |
| Use bulkhead for isolation | Let one service exhaust resources |
| Configure retry with backoff | Retry indefinitely |

## Production Checklist

- [ ] Circuit breaker configured per service
- [ ] Fallbacks return meaningful responses
- [ ] Metrics exposed to monitoring
- [ ] Alerts on state transitions
- [ ] Proper timeout values
- [ ] Retry with exponential backoff
- [ ] Rate limiting for external APIs
- [ ] Bulkhead for resource isolation
- [ ] Health indicators enabled
- [ ] Events logged for debugging

## When NOT to Use This Skill

- **Internal errors** - Fix the bug, don't circuit break
- **Hystrix** - Deprecated, use Resilience4j
- **Database failures** - Use connection pool, retries
- **Simple retries** - Spring Retry may be sufficient

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Circuit breaker for everything | Overhead, complexity | Only for external/flaky calls |
| No fallback defined | Empty responses | Provide meaningful fallback |
| Wrong thresholds | Circuit opens too early/late | Tune based on SLA |
| No monitoring | Can't debug issues | Enable actuator metrics |
| Ignoring slow calls | Timeouts not configured | Add timeout configuration |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Circuit always open | Check failure rate | Tune threshold, fix underlying issue |
| Fallback not called | Check exception types | Configure correct exception handling |
| Too many retries | Check retry config | Reduce max attempts |
| Rate limiter too strict | Check permissions/second | Increase limit |
| Bulkhead rejected | Check concurrent calls | Increase max concurrent |

## Reference Documentation
- [Resilience4j Documentation](https://resilience4j.readme.io/)
- [Spring Cloud Circuit Breaker](https://docs.spring.io/spring-cloud-circuitbreaker/reference/)
