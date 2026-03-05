---
name: resilience-patterns
description: |
  Application resilience patterns. Circuit breakers, retries with backoff,
  bulkheads, timeouts, fallbacks, and health checks. Polly (.NET),
  resilience4j (Java), cockatiel (Node.js).

  USE WHEN: user mentions "circuit breaker", "retry", "backoff", "bulkhead",
  "resilience", "fault tolerance", "Polly", "resilience4j", "fallback"

  DO NOT USE FOR: error handling basics - use language skills;
  monitoring - use `opentelemetry`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Resilience Patterns

## Retry with Exponential Backoff

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      if (!isRetryable(error)) throw error;
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}

function isRetryable(error: unknown): boolean {
  if (error instanceof Error && 'status' in error) {
    const status = (error as { status: number }).status;
    return status === 429 || status >= 500;
  }
  return true;
}
```

## Circuit Breaker

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold = 5,
    private resetTimeout = 30000,
  ) {}

  async execute<T>(fn: () => Promise<T>, fallback?: () => T): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        if (fallback) return fallback();
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback) return fallback();
      throw error;
    }
  }

  private onSuccess() { this.failures = 0; this.state = 'closed'; }
  private onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) this.state = 'open';
  }
}

// Usage
const breaker = new CircuitBreaker(5, 30000);
const result = await breaker.execute(
  () => externalApi.call(),
  () => cachedResult, // fallback
);
```

## resilience4j (Java/Spring)

```java
@CircuitBreaker(name = "paymentService", fallbackMethod = "paymentFallback")
@Retry(name = "paymentService")
@TimeLimiter(name = "paymentService")
public CompletableFuture<Payment> processPayment(Order order) {
    return CompletableFuture.supplyAsync(() -> paymentClient.charge(order));
}

public CompletableFuture<Payment> paymentFallback(Order order, Throwable t) {
    return CompletableFuture.completedFuture(Payment.pending(order.getId()));
}
```

```yaml
# application.yml
resilience4j:
  circuitbreaker:
    instances:
      paymentService:
        slidingWindowSize: 10
        failureRateThreshold: 50
        waitDurationInOpenState: 30s
  retry:
    instances:
      paymentService:
        maxAttempts: 3
        waitDuration: 1s
        exponentialBackoffMultiplier: 2
```

## Timeout Pattern

```typescript
async function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn();
  } finally {
    clearTimeout(timer);
  }
}
```

## Pattern Selection

| Pattern | Use When |
|---------|----------|
| Retry | Transient failures (network, 5xx, 429) |
| Circuit breaker | Repeated failures to same dependency |
| Timeout | Preventing hung connections |
| Bulkhead | Isolating resource pools per dependency |
| Fallback | Degraded but available service |

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Retrying non-idempotent operations | Only retry idempotent requests (GET, PUT with same key) |
| No jitter on retry delay | Add random jitter to prevent thundering herd |
| Circuit breaker per request (not per service) | Share breaker instance across requests to same service |
| No fallback for open circuit | Provide cached/degraded response |
| Retrying 400 errors | Only retry transient errors (429, 5xx, network) |

## Production Checklist

- [ ] Retry with exponential backoff + jitter
- [ ] Circuit breaker on all external service calls
- [ ] Timeouts on all outbound requests
- [ ] Fallback responses for critical paths
- [ ] Health check endpoints
- [ ] Monitoring: circuit breaker state, retry counts
