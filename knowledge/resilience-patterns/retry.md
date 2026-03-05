# Retry Pattern

## Overview

The retry pattern handles transient failures by automatically re-attempting failed operations. Transient failures include network timeouts, temporary service unavailability, rate limiting (HTTP 429), and database connection drops. A well-configured retry strategy improves reliability without overwhelming downstream services.

## Retry Strategies

### Fixed Delay

Wait the same duration between every attempt.

```
Attempt 1 → fail → wait 1s → Attempt 2 → fail → wait 1s → Attempt 3
```

Best for: Simple scenarios, interactions with a single backend instance.

### Exponential Backoff

Each retry waits exponentially longer: `delay * 2^attempt`.

```
Attempt 1 → fail → wait 1s → Attempt 2 → fail → wait 2s → Attempt 3 → fail → wait 4s → Attempt 4
```

Best for: Rate-limited APIs, shared resources where thundering herd is a concern.

### Exponential Backoff with Jitter

Adds randomness to exponential backoff to prevent synchronized retries from multiple clients.

```
delay = min(cap, base * 2^attempt) * random(0.5, 1.5)
```

**Full jitter** (recommended by AWS):
```
delay = random(0, min(cap, base * 2^attempt))
```

**Decorrelated jitter**:
```
delay = min(cap, random(base, previous_delay * 3))
```

Best for: High-concurrency systems, cloud services, any scenario with multiple clients retrying simultaneously.

## Retryable vs Non-Retryable Errors

| Retryable | Non-Retryable |
|-----------|---------------|
| HTTP 408, 429, 500, 502, 503, 504 | HTTP 400, 401, 403, 404, 409, 422 |
| `ECONNRESET`, `ETIMEDOUT` | `ENOTFOUND` (DNS resolution failure) |
| `SocketTimeoutException` | `MalformedURLException` |
| Database deadlock | Constraint violation |
| Connection pool exhausted | Authentication failure |
| `IOException` (network) | `IllegalArgumentException` |

**Rule of thumb**: Retry on infrastructure/transient failures. Do not retry on client errors or validation failures -- they will never succeed.

## Idempotency Requirements

Retries are only safe for idempotent operations. An operation is idempotent if executing it multiple times produces the same result as executing it once.

```
GET /users/123          → Idempotent (safe to retry)
PUT /users/123          → Idempotent (full replacement)
DELETE /users/123       → Idempotent (already deleted = same result)
POST /users             → NOT idempotent (creates duplicate)
PATCH /users/123        → Context-dependent
POST /payments          → NOT idempotent without idempotency key
```

### Idempotency Keys

```javascript
// Client sends a unique key with the request
const response = await fetch('/api/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': crypto.randomUUID(),
  },
  body: JSON.stringify({ amount: 99.99, currency: 'USD' }),
});
```

```java
// Server-side idempotency check
@PostMapping("/payments")
public ResponseEntity<Payment> createPayment(
    @RequestHeader("Idempotency-Key") String idempotencyKey,
    @RequestBody PaymentRequest request) {

    Optional<Payment> existing = paymentRepo.findByIdempotencyKey(idempotencyKey);
    if (existing.isPresent()) {
        return ResponseEntity.ok(existing.get());
    }

    Payment payment = paymentService.process(request);
    payment.setIdempotencyKey(idempotencyKey);
    paymentRepo.save(payment);
    return ResponseEntity.status(201).body(payment);
}
```

## Resilience4j RetryConfig (Java)

### Programmatic Configuration

```java
import io.github.resilience4j.retry.Retry;
import io.github.resilience4j.retry.RetryConfig;
import io.github.resilience4j.retry.RetryRegistry;

RetryConfig config = RetryConfig.custom()
    .maxAttempts(3)
    .waitDuration(Duration.ofMillis(500))
    .retryOnResult(response -> response.getStatusCode() == 503)
    .retryExceptions(IOException.class, TimeoutException.class)
    .ignoreExceptions(BusinessException.class)
    .failAfterMaxAttempts(true)
    .build();

RetryRegistry registry = RetryRegistry.of(config);
Retry retry = registry.retry("paymentService");

Supplier<PaymentResult> supplier = Retry.decorateSupplier(
    retry, () -> paymentGateway.processPayment(order));

PaymentResult result = Try.ofSupplier(supplier)
    .recover(ex -> PaymentResult.failed(ex.getMessage()))
    .get();
```

### Exponential Backoff Configuration

```java
RetryConfig config = RetryConfig.custom()
    .maxAttempts(5)
    .intervalFunction(IntervalFunction.ofExponentialBackoff(
        Duration.ofMillis(500),  // initial interval
        2.0                       // multiplier
    ))
    .build();

// With randomized backoff (jitter)
RetryConfig configWithJitter = RetryConfig.custom()
    .maxAttempts(5)
    .intervalFunction(IntervalFunction.ofExponentialRandomBackoff(
        Duration.ofMillis(500),   // initial interval
        2.0,                       // multiplier
        0.5                        // randomization factor
    ))
    .build();
```

### Spring Boot Integration

```yaml
resilience4j:
  retry:
    instances:
      paymentService:
        maxAttempts: 3
        waitDuration: 500ms
        enableExponentialBackoff: true
        exponentialBackoffMultiplier: 2
        enableRandomizedWait: true
        randomizedWaitFactor: 0.5
        retryExceptions:
          - java.io.IOException
          - java.util.concurrent.TimeoutException
        ignoreExceptions:
          - com.example.BusinessException
```

```java
@Service
public class PaymentService {

    @Retry(name = "paymentService", fallbackMethod = "paymentFallback")
    public PaymentResult processPayment(Order order) {
        return gateway.charge(order);
    }

    private PaymentResult paymentFallback(Order order, Exception ex) {
        log.warn("All retries exhausted for order {}", order.getId(), ex);
        return PaymentResult.deferred("Queued for manual processing");
    }
}
```

### Spring @Retryable Annotation

```java
@EnableRetry
@Configuration
public class RetryConfig {}

@Service
public class NotificationService {

    @Retryable(
        retryFor = {IOException.class, MessagingException.class},
        noRetryFor = {InvalidAddressException.class},
        maxAttempts = 4,
        backoff = @Backoff(delay = 1000, multiplier = 2, maxDelay = 10000)
    )
    public void sendNotification(String userId, String message) {
        emailClient.send(userId, message);
    }

    @Recover
    public void recoverNotification(Exception ex, String userId, String message) {
        log.error("Failed to send notification to {} after retries", userId, ex);
        deadLetterQueue.enqueue(new FailedNotification(userId, message, ex));
    }
}
```

## p-retry (Node.js)

```javascript
import pRetry, { AbortError } from 'p-retry';

async function fetchUserProfile(userId) {
  const response = await fetch(`https://api.example.com/users/${userId}`);

  if (response.status === 404) {
    throw new AbortError(`User ${userId} not found`); // Do not retry
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

const profile = await pRetry(() => fetchUserProfile('user-123'), {
  retries: 4,
  minTimeout: 1000,
  maxTimeout: 10000,
  factor: 2,
  randomize: true,
  onFailedAttempt: (error) => {
    console.warn(
      `Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`
    );
  },
});
```

### Custom Retry with Axios

```javascript
import axios from 'axios';

async function requestWithRetry(config, options = {}) {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await axios(config);
    } catch (error) {
      const status = error.response?.status;

      // Do not retry client errors (except 429)
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw error;
      }

      if (attempt === maxRetries) throw error;

      let delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      delay *= 0.5 + Math.random(); // Add jitter

      // Respect Retry-After header
      const retryAfter = error.response?.headers['retry-after'];
      if (retryAfter) {
        delay = parseInt(retryAfter, 10) * 1000 || delay;
      }

      console.warn(`Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
```

## Tenacity (Python)

```python
from tenacity import (
    retry, stop_after_attempt, stop_after_delay,
    wait_exponential, wait_random_exponential,
    retry_if_exception_type, retry_if_result,
    before_log, after_log, RetryError,
)
import logging
import requests

logger = logging.getLogger(__name__)

@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=1, max=30),
    retry=retry_if_exception_type((requests.ConnectionError, requests.Timeout)),
    before=before_log(logger, logging.WARNING),
    after=after_log(logger, logging.WARNING),
    reraise=True,
)
def fetch_order(order_id: str) -> dict:
    response = requests.get(
        f"https://api.orders.com/orders/{order_id}",
        timeout=5,
    )
    response.raise_for_status()
    return response.json()

# Retry based on response content
@retry(
    stop=stop_after_attempt(3),
    wait=wait_random_exponential(multiplier=1, max=10),
    retry=retry_if_result(lambda r: r.get("status") == "processing"),
)
def poll_payment_status(payment_id: str) -> dict:
    response = requests.get(f"https://api.payments.com/status/{payment_id}")
    return response.json()

# Combined stop conditions
@retry(
    stop=(stop_after_attempt(5) | stop_after_delay(60)),
    wait=wait_exponential(multiplier=0.5, min=0.5, max=15),
)
def resilient_call():
    return external_service.call()
```

### Custom Retry Callback

```python
from tenacity import retry, stop_after_attempt, wait_exponential

def log_retry(retry_state):
    logger.warning(
        "Retry attempt %d for %s (exception: %s)",
        retry_state.attempt_number,
        retry_state.fn.__name__,
        retry_state.outcome.exception() if retry_state.outcome.failed else None,
    )

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(min=1, max=10),
    before_sleep=log_retry,
)
def process_webhook(payload: dict) -> None:
    response = requests.post("https://partner.api/webhook", json=payload, timeout=10)
    response.raise_for_status()
```

## Anti-Patterns

1. **Retrying non-idempotent operations** - Causes duplicate charges, double inserts, or conflicting updates. Always ensure idempotency before enabling retries.
2. **No maximum retry limit** - Infinite retries waste resources and mask permanent failures. Always set `maxAttempts`.
3. **Fixed delay without jitter** - Multiple clients retry at the same instant, causing thundering herd. Always add randomization.
4. **Retrying on non-retryable errors** - Retrying HTTP 400 or 403 will never succeed. Classify exceptions correctly.
5. **Not respecting Retry-After headers** - API rate limits include backoff guidance; ignoring it leads to bans.
6. **Retry storm amplification** - Service A retries 3x calling service B, which retries 3x calling service C = 27 attempts at C for 1 user request. Use circuit breakers to limit cascading retries.
7. **Silent retries** - Not logging or metering retries makes it impossible to detect degradation.

## Production Checklist

- [ ] Maximum attempts configured (typically 3-5 for synchronous, more for async)
- [ ] Exponential backoff with jitter enabled
- [ ] Non-retryable exceptions explicitly excluded
- [ ] Idempotency ensured for all retried operations
- [ ] Retry-After header respected for rate-limited APIs
- [ ] Retry metrics exported (attempt count, success after retry, exhausted retries)
- [ ] Fallback defined for when all retries are exhausted
- [ ] Combined with circuit breaker to prevent retry storms
- [ ] Total retry duration bounded (not just attempt count)
- [ ] Tested with fault injection to verify retry behavior
