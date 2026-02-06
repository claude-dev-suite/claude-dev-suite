---
name: spring-retry
description: |
  Spring Retry for transparent retry support in Spring applications.
  Covers @Retryable, @Recover, RetryTemplate, backoff policies, and circuit breakers.

  USE WHEN: user mentions "spring retry", "@Retryable", "@Recover", "RetryTemplate",
  "backoff policy", "retry transient failure", "automatic retry"

  DO NOT USE FOR: circuit breaker patterns - use `spring-cloud-circuitbreaker` skill,
  message retry - use `spring-kafka` or messaging skill retry topics
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Retry - Quick Reference

> **Full Reference**: See [advanced.md](advanced.md) for RetryTemplate patterns, custom retry policies, retry listeners, stateful retry, async retry, and testing.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-retry` for comprehensive documentation.

## Dependencies

```xml
<dependency>
    <groupId>org.springframework.retry</groupId>
    <artifactId>spring-retry</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework</groupId>
    <artifactId>spring-aspects</artifactId>
</dependency>
```

## Enable Retry

```java
@SpringBootApplication
@EnableRetry
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

## @Retryable Annotation

### Basic Usage
```java
@Retryable(maxAttempts = 3)
public String callExternalApi(String endpoint) {
    return restClient.get(endpoint);
}
```

### With Specific Exceptions
```java
@Retryable(
    retryFor = {ServiceUnavailableException.class, TimeoutException.class},
    noRetryFor = {PaymentDeclinedException.class},
    maxAttempts = 5
)
public PaymentResult processPayment(PaymentRequest request) {
    return paymentGateway.charge(request);
}
```

### With Backoff
```java
@Retryable(
    maxAttempts = 4,
    backoff = @Backoff(
        delay = 1000,       // Initial delay: 1 second
        multiplier = 2,     // Exponential: 1s, 2s, 4s
        maxDelay = 10000    // Max delay: 10 seconds
    )
)
public void sendNotification(Notification notification) {
    notificationClient.send(notification);
}

@Recover
public void recoverNotification(Exception e, Notification notification) {
    log.error("Failed to send notification after retries: {}", notification.getId());
    deadLetterQueue.add(notification);
}
```

## @Recover Method

```java
@Service
public class UserService {

    @Retryable(retryFor = ServiceException.class, maxAttempts = 3)
    public User getUser(Long id) {
        return userClient.findById(id);
    }

    // Must have same return type
    // First parameter can be the exception
    @Recover
    public User recoverGetUser(ServiceException e, Long id) {
        log.warn("Falling back to cached user for id: {}", id);
        return userCache.get(id);
    }

    // Multiple recover methods for different exceptions
    @Recover
    public User recoverGetUserTimeout(TimeoutException e, Long id) {
        return User.unknown(id);
    }
}
```

## Best Practices

| Do | Don't |
|----|-------|
| Use exponential backoff | Fixed rapid retries |
| Set max attempts limit | Retry indefinitely |
| Handle non-retryable exceptions | Retry business errors |
| Log retry attempts | Silent retries |
| Implement recovery fallback | Let retries fail silently |

## When NOT to Use This Skill

- **Circuit breaker** - Use `spring-cloud-circuitbreaker` or Resilience4j
- **Message retry** - Use Kafka retry topics or DLT
- **Non-idempotent operations** - Ensure idempotency first
- **Business errors** - Only retry transient failures

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Retry indefinitely | Hangs forever | Set max attempts |
| Fixed rapid retry | Overwhelms service | Use exponential backoff |
| Retrying business errors | Wastes resources | Use noRetryFor |
| No recovery method | Silent failures | Implement @Recover |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Retry not happening | Check @EnableRetry | Add to config class |
| @Recover not called | Check method signature | Match return type and params |
| Too many retries | Check maxAttempts | Reduce or add timeout |
| Backoff not working | Check annotation | Verify @Backoff config |

## Production Checklist

- [ ] Appropriate max attempts set
- [ ] Exponential backoff configured
- [ ] Max delay capped
- [ ] Non-retryable exceptions defined
- [ ] Recovery methods implemented
- [ ] Retry listeners for monitoring
- [ ] Metrics on retry counts

## Reference Documentation
- [Spring Retry Reference](https://docs.spring.io/spring-retry/reference/)
