# Bulkhead Pattern

## Overview

The bulkhead pattern isolates elements of an application into pools so that if one fails, the others continue to function. Named after the watertight compartments in a ship's hull, this pattern prevents a slow or failing dependency from consuming all available resources and bringing down the entire application. When a thread pool or semaphore for one service is exhausted, calls to other services remain unaffected.

## Isolation Strategies

### Thread Pool Isolation

Each service call gets a dedicated thread pool. When the pool is full, new requests are rejected immediately rather than queuing on the caller's threads.

```
┌─────────────────────────────────────────────┐
│                Application                   │
│                                              │
│  ┌──────────────┐  ┌──────────────┐         │
│  │ Payment Pool │  │ Catalog Pool │         │
│  │  (10 threads)│  │  (20 threads)│         │
│  │  ┌──┐ ┌──┐  │  │  ┌──┐ ┌──┐  │         │
│  │  │T1│ │T2│..│  │  │T1│ │T2│..│         │
│  │  └──┘ └──┘  │  │  └──┘ └──┘  │         │
│  └──────┬───────┘  └──────┬───────┘         │
│         │                  │                 │
└─────────┼──────────────────┼─────────────────┘
          ▼                  ▼
    Payment Service    Catalog Service
```

**Pros**: Full isolation, includes timeout per pool, queued requests do not block caller threads.

**Cons**: Higher resource consumption (each pool has dedicated threads), context switching overhead.

### Semaphore Isolation

Limits concurrent calls using a semaphore counter. Calls execute on the caller's thread but are gated by the semaphore permit count.

**Pros**: Lower overhead, no additional threads, suitable for high-throughput non-blocking calls.

**Cons**: No timeout enforcement (must combine with TimeLimiter), less isolation than thread pools.

## Sizing Thread Pools

### Formula

```
Pool Size = Peak RPS * p99 Latency (seconds) * Safety Multiplier

Example:
- Peak RPS to payment service: 100
- p99 latency: 200ms (0.2s)
- Safety multiplier: 1.5

Pool Size = 100 * 0.2 * 1.5 = 30 threads
```

### Guidelines

| Factor | Recommendation |
|--------|----------------|
| Non-critical service | Smaller pool (5-10), fail fast |
| Critical service | Larger pool, but still bounded |
| Queue capacity | 0 for fail-fast, small (5-10) for burst absorption |
| CPU-bound calls | Pool size near core count |
| I/O-bound calls | Pool size can exceed core count significantly |

## Resilience4j BulkheadConfig (Java)

### Semaphore Bulkhead

```java
import io.github.resilience4j.bulkhead.Bulkhead;
import io.github.resilience4j.bulkhead.BulkheadConfig;
import io.github.resilience4j.bulkhead.BulkheadRegistry;

BulkheadConfig config = BulkheadConfig.custom()
    .maxConcurrentCalls(25)
    .maxWaitDuration(Duration.ofMillis(500))
    .build();

BulkheadRegistry registry = BulkheadRegistry.of(config);
Bulkhead bulkhead = registry.bulkhead("paymentService");

Supplier<PaymentResult> decoratedSupplier = Bulkhead.decorateSupplier(
    bulkhead,
    () -> paymentService.processPayment(order)
);

Try<PaymentResult> result = Try.ofSupplier(decoratedSupplier)
    .recover(BulkheadFullException.class, e -> PaymentResult.rejected("Service busy"));
```

### Thread Pool Bulkhead

```java
import io.github.resilience4j.bulkhead.ThreadPoolBulkhead;
import io.github.resilience4j.bulkhead.ThreadPoolBulkheadConfig;

ThreadPoolBulkheadConfig config = ThreadPoolBulkheadConfig.custom()
    .maxThreadPoolSize(20)
    .coreThreadPoolSize(10)
    .queueCapacity(5)
    .keepAliveDuration(Duration.ofMillis(100))
    .build();

ThreadPoolBulkhead bulkhead = ThreadPoolBulkhead.of("paymentService", config);

CompletionStage<PaymentResult> future = bulkhead.executeSupplier(
    () -> paymentService.processPayment(order)
);

future.thenAccept(result -> log.info("Payment: {}", result))
      .exceptionally(ex -> {
          log.error("Bulkhead rejected or service failed", ex);
          return null;
      });
```

### Spring Boot Configuration

```yaml
resilience4j:
  bulkhead:
    instances:
      paymentService:
        maxConcurrentCalls: 25
        maxWaitDuration: 500ms
      catalogService:
        maxConcurrentCalls: 50
        maxWaitDuration: 200ms

  thread-pool-bulkhead:
    instances:
      paymentService:
        maxThreadPoolSize: 20
        coreThreadPoolSize: 10
        queueCapacity: 5
        keepAliveDuration: 100ms
```

```java
@Service
public class PaymentService {

    @Bulkhead(name = "paymentService", fallbackMethod = "paymentBusy")
    public PaymentResult processPayment(Order order) {
        return gateway.charge(order);
    }

    private PaymentResult paymentBusy(Order order, BulkheadFullException ex) {
        log.warn("Payment bulkhead full for order {}", order.getId());
        return PaymentResult.rejected("Service at capacity, please retry");
    }
}
```

## Node.js Implementation with p-limit

### Basic Concurrency Limiter

```javascript
import pLimit from 'p-limit';

// Allow max 10 concurrent calls to payment service
const paymentLimit = pLimit(10);

// Allow max 25 concurrent calls to catalog service
const catalogLimit = pLimit(25);

async function processOrder(order) {
  const [payment, catalog] = await Promise.all([
    paymentLimit(() => paymentService.charge(order)),
    catalogLimit(() => catalogService.reserveItems(order.items)),
  ]);

  return { payment, catalog };
}
```

### Express Middleware Bulkhead

```javascript
import pLimit from 'p-limit';

function bulkheadMiddleware(name, maxConcurrent) {
  const limit = pLimit(maxConcurrent);
  let waiting = 0;
  const MAX_WAITING = maxConcurrent * 2;

  return (req, res, next) => {
    if (limit.pendingCount >= MAX_WAITING) {
      res.status(503).json({
        error: 'Service at capacity',
        bulkhead: name,
        pendingCount: limit.pendingCount,
      });
      return;
    }

    waiting++;
    limit(async () => {
      waiting--;
      return new Promise((resolve, reject) => {
        res.on('finish', resolve);
        res.on('error', reject);
        next();
      });
    }).catch((err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal error' });
      }
    });
  };
}

// Apply different bulkheads to different routes
app.use('/api/payments', bulkheadMiddleware('payments', 10));
app.use('/api/catalog', bulkheadMiddleware('catalog', 30));
app.use('/api/search', bulkheadMiddleware('search', 50));
```

### Class-Based Bulkhead

```javascript
class Bulkhead {
  #name;
  #maxConcurrent;
  #activeCount = 0;
  #queue = [];

  constructor(name, maxConcurrent, maxQueueSize = 0) {
    this.#name = name;
    this.#maxConcurrent = maxConcurrent;
    this.maxQueueSize = maxQueueSize;
  }

  async execute(fn) {
    if (this.#activeCount >= this.#maxConcurrent) {
      if (this.#queue.length >= this.maxQueueSize) {
        throw new Error(`Bulkhead '${this.#name}' full: ${this.#activeCount} active, ${this.#queue.length} queued`);
      }

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const idx = this.#queue.findIndex((e) => e.resolve === resolve);
          if (idx >= 0) this.#queue.splice(idx, 1);
          reject(new Error(`Bulkhead '${this.#name}' queue timeout`));
        }, 5000);

        this.#queue.push({ resolve, reject, timeout });
      });
    }

    this.#activeCount++;
    try {
      return await fn();
    } finally {
      this.#activeCount--;
      if (this.#queue.length > 0) {
        const next = this.#queue.shift();
        clearTimeout(next.timeout);
        next.resolve();
      }
    }
  }

  get stats() {
    return {
      name: this.#name,
      active: this.#activeCount,
      queued: this.#queue.length,
      available: Math.max(0, this.#maxConcurrent - this.#activeCount),
    };
  }
}

// Usage
const paymentBulkhead = new Bulkhead('payments', 10, 5);

try {
  const result = await paymentBulkhead.execute(() => paymentService.charge(order));
} catch (err) {
  if (err.message.includes('Bulkhead')) {
    return { status: 'rejected', reason: 'Service at capacity' };
  }
  throw err;
}
```

## Combining Bulkhead with Circuit Breaker

The bulkhead limits concurrent load while the circuit breaker prevents repeated calls to a failing service. Use them together for comprehensive protection.

### Java (Resilience4j)

```java
@Service
public class PaymentService {

    @Bulkhead(name = "paymentService", fallbackMethod = "fallback")
    @CircuitBreaker(name = "paymentService", fallbackMethod = "fallback")
    @TimeLimiter(name = "paymentService", fallbackMethod = "fallback")
    public CompletableFuture<PaymentResult> processPayment(Order order) {
        return CompletableFuture.supplyAsync(() -> gateway.charge(order));
    }

    private CompletableFuture<PaymentResult> fallback(Order order, Exception ex) {
        log.warn("Payment fallback triggered: {}", ex.getMessage());
        return CompletableFuture.completedFuture(PaymentResult.deferred());
    }
}
```

**Decorator order matters.** Resilience4j applies decorators in this order:
```
Retry → CircuitBreaker → RateLimiter → TimeLimiter → Bulkhead → Function
```
The outermost decorator (Retry) wraps all inner decorators. The innermost (Bulkhead) executes first.

### Node.js

```javascript
import CircuitBreaker from 'opossum';
import pLimit from 'p-limit';

const concurrencyLimit = pLimit(10);

const breaker = new CircuitBreaker(
  async (orderId) => {
    // Bulkhead wraps the actual call
    return concurrencyLimit(() => paymentGateway.charge(orderId));
  },
  {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
  }
);

breaker.fallback(() => ({ status: 'deferred' }));

const result = await breaker.fire('order-123');
```

## Monitoring

### Key Metrics

```
# Active calls per bulkhead
bulkhead_active_calls{name="paymentService"} 8

# Available permits
bulkhead_available_permits{name="paymentService"} 2

# Rejected calls (bulkhead full)
bulkhead_rejected_total{name="paymentService"} 47

# Queue depth (thread pool bulkhead)
bulkhead_queue_depth{name="paymentService"} 3
```

### Alerting

```yaml
groups:
  - name: bulkhead
    rules:
      - alert: BulkheadHighUtilization
        expr: bulkhead_active_calls / (bulkhead_active_calls + bulkhead_available_permits) > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Bulkhead {{ $labels.name }} above 80% utilization"

      - alert: BulkheadRejectingRequests
        expr: rate(bulkhead_rejected_total[5m]) > 0
        for: 2m
        labels:
          severity: critical
```

## Anti-Patterns

1. **Single shared pool for all services** - Defeats the purpose of isolation; a slow service consumes all shared threads.
2. **Oversized pools** - If every bulkhead is sized for peak load, the total thread count can exceed system capacity.
3. **No queue limit** - Unbounded queues cause memory exhaustion and latency spikes.
4. **Not monitoring utilization** - Without metrics, you cannot right-size pools or detect saturation.
5. **Bulkhead without timeout** - If a call hangs indefinitely, it permanently occupies a permit. Always combine with a timeout.
6. **Identical sizing for all services** - Critical services should have larger pools than non-critical ones.

## Production Checklist

- [ ] Each external dependency has its own bulkhead
- [ ] Pool sizes calculated from observed RPS and latency percentiles
- [ ] Queue capacity set (or zero for fail-fast behavior)
- [ ] Combined with circuit breaker and timeout patterns
- [ ] Metrics exported: active calls, available permits, rejected count
- [ ] Alerts for high utilization and rejected requests
- [ ] Fallback behavior defined for when the bulkhead rejects a request
- [ ] Load tested to verify isolation under simulated dependency failure
- [ ] Pool sizes reviewed and adjusted based on production traffic patterns
- [ ] Thread pool bulkhead used for blocking I/O, semaphore for non-blocking
