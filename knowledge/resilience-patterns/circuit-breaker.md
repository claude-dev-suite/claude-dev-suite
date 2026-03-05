# Circuit Breaker Pattern

## Overview

The circuit breaker pattern prevents cascading failures in distributed systems by wrapping calls to external services in a stateful proxy that monitors failures and short-circuits requests when a failure threshold is exceeded. This stops the application from repeatedly attempting an operation that is likely to fail, giving the downstream service time to recover.

## Circuit Breaker States

### Closed (Normal Operation)
- All requests pass through to the downstream service
- Failures are counted against a rolling window
- When failure count exceeds the threshold, the breaker trips to **Open**

### Open (Failing Fast)
- All requests immediately fail without attempting the call
- A timer runs for a configured wait duration
- After the wait duration expires, the breaker transitions to **Half-Open**

### Half-Open (Testing Recovery)
- A limited number of trial requests are allowed through
- If trial requests succeed, the breaker transitions back to **Closed**
- If any trial request fails, the breaker returns to **Open**

```
   ┌────────┐  failure threshold  ┌──────┐  wait duration  ┌───────────┐
   │ CLOSED │ ──────────────────> │ OPEN │ ──────────────> │ HALF-OPEN │
   └────────┘                     └──────┘                  └───────────┘
       ^                                                        │    │
       │              trial succeeds                            │    │
       └────────────────────────────────────────────────────────┘    │
                                                                     │
                      trial fails    ┌──────┐                        │
                      ──────────────>│ OPEN │<───────────────────────┘
                                     └──────┘
```

## Configuration Parameters

| Parameter | Description | Typical Default |
|-----------|-------------|-----------------|
| `failureRateThreshold` | Percentage of failures to trip the breaker | 50% |
| `slowCallRateThreshold` | Percentage of slow calls to trip | 100% |
| `slowCallDurationThreshold` | Duration to classify a call as slow | 60s |
| `waitDurationInOpenState` | Time to wait before transitioning to half-open | 60s |
| `permittedNumberOfCallsInHalfOpenState` | Trial calls allowed in half-open | 10 |
| `minimumNumberOfCalls` | Minimum calls before calculating failure rate | 100 |
| `slidingWindowType` | COUNT_BASED or TIME_BASED | COUNT_BASED |
| `slidingWindowSize` | Size of the sliding window | 100 |

## Resilience4j (Java)

### Basic Configuration

```java
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;

CircuitBreakerConfig config = CircuitBreakerConfig.custom()
    .failureRateThreshold(50)
    .slowCallRateThreshold(80)
    .slowCallDurationThreshold(Duration.ofSeconds(3))
    .waitDurationInOpenState(Duration.ofSeconds(30))
    .permittedNumberOfCallsInHalfOpenState(5)
    .minimumNumberOfCalls(10)
    .slidingWindowType(SlidingWindowType.COUNT_BASED)
    .slidingWindowSize(20)
    .recordExceptions(IOException.class, TimeoutException.class)
    .ignoreExceptions(BusinessException.class)
    .build();

CircuitBreakerRegistry registry = CircuitBreakerRegistry.of(config);
CircuitBreaker breaker = registry.circuitBreaker("paymentService");
```

### Decorating Calls

```java
Supplier<String> decoratedSupplier = CircuitBreaker
    .decorateSupplier(breaker, () -> paymentService.processPayment(order));

Try<String> result = Try.ofSupplier(decoratedSupplier)
    .recover(CallNotPermittedException.class, e -> fallbackPayment(order));
```

### Spring Boot Integration

```yaml
# application.yml
resilience4j:
  circuitbreaker:
    instances:
      paymentService:
        registerHealthIndicator: true
        slidingWindowSize: 20
        minimumNumberOfCalls: 10
        failureRateThreshold: 50
        waitDurationInOpenState: 30s
        permittedNumberOfCallsInHalfOpenState: 5
        slowCallDurationThreshold: 3s
        slowCallRateThreshold: 80
        recordExceptions:
          - java.io.IOException
          - java.util.concurrent.TimeoutException
        ignoreExceptions:
          - com.example.BusinessException
```

```java
@Service
public class PaymentService {

    @CircuitBreaker(name = "paymentService", fallbackMethod = "fallbackPayment")
    public PaymentResult processPayment(Order order) {
        return externalPaymentGateway.charge(order);
    }

    private PaymentResult fallbackPayment(Order order, Exception ex) {
        log.warn("Payment circuit breaker open for order {}: {}", order.getId(), ex.getMessage());
        return PaymentResult.deferred(order, "Payment queued for retry");
    }
}
```

### Actuator Metrics

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health, circuitbreakers, circuitbreakerevents
  health:
    circuitbreakers:
      enabled: true
```

## Opossum (Node.js)

```javascript
import CircuitBreaker from 'opossum';

const options = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 10,
  rollingCountTimeout: 10000,
  rollingCountBuckets: 10,
};

const breaker = new CircuitBreaker(async (orderId) => {
  const response = await fetch(`https://api.payments.com/orders/${orderId}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}, options);

// Fallback
breaker.fallback((orderId) => ({
  status: 'pending',
  message: 'Payment service temporarily unavailable',
}));

// Event listeners for monitoring
breaker.on('open', () => console.warn('Circuit breaker OPENED'));
breaker.on('halfOpen', () => console.info('Circuit breaker HALF-OPEN'));
breaker.on('close', () => console.info('Circuit breaker CLOSED'));
breaker.on('fallback', (result) => console.info('Fallback executed:', result));
breaker.on('reject', () => metrics.increment('circuit_breaker.rejected'));

// Usage
try {
  const result = await breaker.fire('order-123');
  console.log('Payment processed:', result);
} catch (err) {
  console.error('Payment failed after fallback:', err);
}
```

### Express Middleware with Opossum

```javascript
function circuitBreakerMiddleware(serviceCall, options) {
  const breaker = new CircuitBreaker(serviceCall, options);

  breaker.fallback(() => ({ error: 'Service unavailable', fallback: true }));

  return async (req, res, next) => {
    try {
      const result = await breaker.fire(req);
      req.serviceResult = result;
      next();
    } catch (err) {
      res.status(503).json({ error: 'Service temporarily unavailable' });
    }
  };
}

app.get('/api/orders/:id',
  circuitBreakerMiddleware(fetchOrder, { timeout: 3000, errorThresholdPercentage: 50 }),
  (req, res) => res.json(req.serviceResult)
);
```

## Pybreaker (Python)

```python
import pybreaker

class PaymentServiceListener(pybreaker.CircuitBreakerListener):
    def state_change(self, cb, old_state, new_state):
        logger.warning(f"Circuit breaker '{cb.name}' changed from {old_state} to {new_state}")

    def failure(self, cb, exc):
        logger.error(f"Circuit breaker '{cb.name}' recorded failure: {exc}")

payment_breaker = pybreaker.CircuitBreaker(
    fail_max=5,
    reset_timeout=30,
    exclude=[ValueError, ValidationError],
    listeners=[PaymentServiceListener()],
    name="payment_service",
)

@payment_breaker
def process_payment(order_id: str, amount: float) -> dict:
    response = requests.post(
        "https://api.payments.com/charge",
        json={"order_id": order_id, "amount": amount},
        timeout=5,
    )
    response.raise_for_status()
    return response.json()

# Usage with fallback
try:
    result = process_payment("order-123", 99.99)
except pybreaker.CircuitBreakerError:
    result = {"status": "queued", "message": "Payment will be retried"}
```

## Monitoring Circuit Breaker State

### Prometheus Metrics to Track

```
# Gauge: current state (0=closed, 1=open, 2=half-open)
circuit_breaker_state{name="paymentService"} 0

# Counter: total state transitions
circuit_breaker_state_transitions_total{name="paymentService", from="closed", to="open"} 3

# Counter: calls by outcome
circuit_breaker_calls_total{name="paymentService", outcome="success"} 1542
circuit_breaker_calls_total{name="paymentService", outcome="failure"} 23
circuit_breaker_calls_total{name="paymentService", outcome="not_permitted"} 87

# Histogram: call duration
circuit_breaker_call_duration_seconds{name="paymentService"} 0.045
```

### Alerting Rules

```yaml
groups:
  - name: circuit_breaker
    rules:
      - alert: CircuitBreakerOpen
        expr: circuit_breaker_state == 1
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "Circuit breaker {{ $labels.name }} is OPEN"

      - alert: CircuitBreakerHighFailureRate
        expr: rate(circuit_breaker_calls_total{outcome="failure"}[5m]) > 0.1
        for: 2m
        labels:
          severity: critical
```

## Fallback Strategies

| Strategy | Use Case | Example |
|----------|----------|---------|
| Default value | Non-critical data | Return empty list for recommendations |
| Cached response | Data with acceptable staleness | Serve last successful product catalog |
| Graceful degradation | Feature can be simplified | Show basic UI without personalization |
| Alternative service | Redundant providers available | Route to backup payment processor |
| Queue for retry | Action can be deferred | Save order, process payment later |

## Anti-Patterns

1. **Setting thresholds too low** - Trips on transient single failures; use `minimumNumberOfCalls` to require a meaningful sample.
2. **Ignoring slow calls** - Only counting exceptions misses services that are timing out; configure `slowCallRateThreshold`.
3. **Not testing the open state** - Never seeing the circuit breaker trip in testing means it may not work correctly in production.
4. **Circuit breaker per instance instead of per service** - Multiple instances calling the same failing service should share state or at least coordinate thresholds.
5. **No monitoring** - A circuit breaker without observability is invisible failure management.
6. **Wrapping local calls** - Circuit breakers are for remote/network calls, not local method invocations.

## Production Checklist

- [ ] Circuit breaker configured for each external service dependency
- [ ] Failure thresholds tuned based on observed error rates and SLAs
- [ ] Fallback behavior defined and tested for each breaker
- [ ] Metrics exported to monitoring system (Prometheus, Datadog, etc.)
- [ ] Alerts configured for open state and high failure rates
- [ ] Dashboard showing real-time circuit breaker states
- [ ] Load tested with downstream service failures simulated
- [ ] Half-open trial count set to a value that validates recovery without overwhelming the service
- [ ] Exceptions properly categorized (recorded vs ignored)
- [ ] Slow call thresholds aligned with SLO requirements
