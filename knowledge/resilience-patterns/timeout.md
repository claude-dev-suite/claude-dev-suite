# Timeout Pattern

## Overview

The timeout pattern sets upper bounds on how long an operation can take before it is abandoned. In distributed systems, uncontrolled timeouts are one of the most common causes of cascading failures -- a single slow dependency can exhaust all threads or connections in the calling service. Proper timeout configuration at every layer is critical for system stability.

## Timeout Types

### Connection Timeout
Time allowed to establish a TCP connection. Fails fast if the remote host is unreachable.

- Typical value: 1-5 seconds
- Failure indicates: host down, network partition, firewall blocking

### Read Timeout (Socket Timeout)
Time allowed to receive data after the connection is established. Triggers if the server accepts the connection but does not respond.

- Typical value: 5-30 seconds depending on operation
- Failure indicates: server overloaded, long-running query, deadlock

### Overall Timeout
Total wall-clock time allowed for the entire operation including connection, request, and response. Useful when individual timeouts exist but you need a hard upper bound.

- Typical value: 10-60 seconds for synchronous API calls
- This catches scenarios where connection succeeds but multiple retries and slow responses accumulate

```
├─ Connection Timeout (1-5s) ─┤
│                              ├─ Read Timeout (5-30s) ──────┤
│                                                             │
├──────────── Overall Timeout (10-60s) ───────────────────────┤
```

## Cascading Timeouts in Microservices

When Service A calls Service B, which calls Service C, timeouts must be progressively shorter toward the leaf services. If all three have 30-second timeouts, Service A can wait up to 90 seconds total.

### Correct Approach

```
User → API Gateway (timeout: 10s)
         → Service A (timeout: 8s)
              → Service B (timeout: 5s)
                   → Database (timeout: 3s)
```

**Rule**: Each downstream timeout should be shorter than its caller's timeout, leaving room for processing and retries.

### Budget-Based Timeouts

Pass a deadline or remaining budget through the call chain:

```java
// Service A receives a request with a deadline
Instant deadline = Instant.now().plus(Duration.ofSeconds(10));

// Before calling Service B, check remaining budget
Duration remaining = Duration.between(Instant.now(), deadline);
if (remaining.isNegative()) {
    throw new TimeoutException("Deadline already exceeded");
}

// Call Service B with the remaining budget (minus local processing buffer)
Duration downstreamTimeout = remaining.minus(Duration.ofMillis(500));
serviceBClient.call(request, downstreamTimeout);
```

### gRPC Deadline Propagation

```java
// gRPC automatically propagates deadlines
ManagedChannel channel = ManagedChannelBuilder.forTarget("service-b:8080").build();
PaymentServiceGrpc.PaymentServiceBlockingStub stub =
    PaymentServiceGrpc.newBlockingStub(channel)
        .withDeadlineAfter(5, TimeUnit.SECONDS);

// The deadline is propagated to downstream gRPC calls automatically
PaymentResponse response = stub.processPayment(request);
```

## Resilience4j TimeLimiter (Java)

```java
import io.github.resilience4j.timelimiter.TimeLimiter;
import io.github.resilience4j.timelimiter.TimeLimiterConfig;

TimeLimiterConfig config = TimeLimiterConfig.custom()
    .timeoutDuration(Duration.ofSeconds(5))
    .cancelRunningFuture(true)
    .build();

TimeLimiter timeLimiter = TimeLimiter.of("paymentService", config);

CompletableFuture<PaymentResult> future = CompletableFuture.supplyAsync(
    () -> paymentGateway.charge(order)
);

Callable<PaymentResult> restricted = TimeLimiter.decorateFutureSupplier(
    timeLimiter, () -> future);

try {
    PaymentResult result = restricted.call();
} catch (TimeoutException e) {
    log.warn("Payment timed out for order {}", order.getId());
    return PaymentResult.timeout();
}
```

### Spring Boot Configuration

```yaml
resilience4j:
  timelimiter:
    instances:
      paymentService:
        timeoutDuration: 5s
        cancelRunningFuture: true
      catalogService:
        timeoutDuration: 3s
        cancelRunningFuture: true
```

```java
@Service
public class PaymentService {

    @TimeLimiter(name = "paymentService", fallbackMethod = "timeoutFallback")
    @CircuitBreaker(name = "paymentService", fallbackMethod = "timeoutFallback")
    public CompletableFuture<PaymentResult> processPayment(Order order) {
        return CompletableFuture.supplyAsync(() -> gateway.charge(order));
    }

    private CompletableFuture<PaymentResult> timeoutFallback(Order order, TimeoutException ex) {
        log.warn("Payment timed out for order {}", order.getId());
        return CompletableFuture.completedFuture(PaymentResult.deferred());
    }
}
```

## AbortController (Node.js)

### Fetch with Timeout

```javascript
async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Usage
try {
  const response = await fetchWithTimeout(
    'https://api.payments.com/charge',
    { method: 'POST', body: JSON.stringify(order) },
    5000
  );
  const result = await response.json();
} catch (err) {
  console.error('Payment failed:', err.message);
}
```

### Composable Timeout Utility

```javascript
function withTimeout(promise, ms, message) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(message || `Operation timed out after ${ms}ms`)),
      ms
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() =>
    clearTimeout(timeoutId)
  );
}

// Usage with any async operation
const result = await withTimeout(
  paymentService.charge(order),
  5000,
  'Payment processing timed out'
);
```

### AbortController with Multiple Signals

```javascript
// Combine user cancellation with timeout
function createCombinedSignal(timeoutMs, externalSignal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (externalSignal) {
    externalSignal.addEventListener('abort', () => controller.abort());
  }

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}

// Express route with request-scoped timeout
app.get('/api/orders/:id', async (req, res) => {
  const { signal, cleanup } = createCombinedSignal(8000, req.signal);

  try {
    const order = await fetchWithTimeout(
      `http://order-service/orders/${req.params.id}`,
      { signal },
      5000
    );
    const enriched = await fetchWithTimeout(
      `http://catalog-service/items?ids=${order.itemIds}`,
      { signal },
      3000
    );
    res.json({ ...order, items: enriched });
  } catch (err) {
    if (err.name === 'AbortError') {
      res.status(504).json({ error: 'Request timed out' });
    } else {
      res.status(500).json({ error: 'Internal error' });
    }
  } finally {
    cleanup();
  }
});
```

## asyncio.timeout (Python)

### Python 3.11+ asyncio.timeout

```python
import asyncio
import aiohttp

async def fetch_order(session: aiohttp.ClientSession, order_id: str) -> dict:
    async with asyncio.timeout(5):
        async with session.get(f"https://api.orders.com/orders/{order_id}") as resp:
            resp.raise_for_status()
            return await resp.json()

async def main():
    async with aiohttp.ClientSession() as session:
        try:
            order = await fetch_order(session, "order-123")
        except TimeoutError:
            print("Order fetch timed out")
        except aiohttp.ClientError as e:
            print(f"HTTP error: {e}")
```

### Cascading Timeouts in Python

```python
import asyncio
import aiohttp

async def get_enriched_order(order_id: str) -> dict:
    """Overall timeout of 10s, individual service timeouts shorter."""
    async with asyncio.timeout(10):  # Overall budget
        async with aiohttp.ClientSession() as session:
            # Fetch order (5s max)
            async with asyncio.timeout(5):
                async with session.get(f"http://order-service/orders/{order_id}") as resp:
                    order = await resp.json()

            # Fetch catalog items (3s max)
            item_ids = ",".join(order["item_ids"])
            async with asyncio.timeout(3):
                async with session.get(f"http://catalog-service/items?ids={item_ids}") as resp:
                    items = await resp.json()

            order["items"] = items
            return order
```

## HTTP Client Timeouts

### Axios (Node.js)

```javascript
import axios from 'axios';

const client = axios.create({
  baseURL: 'https://api.payments.com',
  timeout: 5000,               // Overall timeout (ms)
  // For granular control, use custom adapter or interceptor
});

// Per-request timeout override
const response = await client.post('/charge', order, {
  timeout: 10000,
  signal: AbortSignal.timeout(10000),
});
```

### Axios with Separate Connection and Read Timeouts

```javascript
import axios from 'axios';
import http from 'http';
import https from 'https';

const client = axios.create({
  baseURL: 'https://api.payments.com',
  httpAgent: new http.Agent({
    timeout: 3000,     // Connection timeout
    keepAlive: true,
  }),
  httpsAgent: new https.Agent({
    timeout: 3000,     // Connection timeout
    keepAlive: true,
  }),
  timeout: 10000,      // Read/overall timeout
});
```

### RestTemplate (Spring)

```java
@Bean
public RestTemplate restTemplate() {
    HttpComponentsClientHttpRequestFactory factory =
        new HttpComponentsClientHttpRequestFactory();

    factory.setConnectTimeout(Duration.ofSeconds(3));
    factory.setReadTimeout(Duration.ofSeconds(10));

    return new RestTemplate(factory);
}
```

### WebClient (Spring WebFlux)

```java
@Bean
public WebClient webClient() {
    HttpClient httpClient = HttpClient.create()
        .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 3000)
        .responseTimeout(Duration.ofSeconds(10))
        .doOnConnected(conn -> conn
            .addHandlerLast(new ReadTimeoutHandler(10, TimeUnit.SECONDS))
            .addHandlerLast(new WriteTimeoutHandler(5, TimeUnit.SECONDS)));

    return WebClient.builder()
        .clientConnector(new ReactorClientHttpConnector(httpClient))
        .build();
}

// Per-request timeout
Mono<PaymentResult> result = webClient.post()
    .uri("/payments")
    .bodyValue(order)
    .retrieve()
    .bodyToMono(PaymentResult.class)
    .timeout(Duration.ofSeconds(5));
```

### aiohttp (Python)

```python
import aiohttp

timeout = aiohttp.ClientTimeout(
    total=30,       # Total operation timeout
    connect=5,      # Connection establishment timeout
    sock_connect=3, # Socket connection timeout
    sock_read=10,   # Socket read timeout
)

async with aiohttp.ClientSession(timeout=timeout) as session:
    async with session.get("https://api.orders.com/orders/123") as resp:
        return await resp.json()
```

### requests (Python)

```python
import requests

# (connect_timeout, read_timeout)
response = requests.get(
    "https://api.orders.com/orders/123",
    timeout=(3, 10),
)
```

## Anti-Patterns

1. **No timeout configured** - Default timeouts are often infinite or extremely long (e.g., 30 minutes). Always set explicit timeouts.
2. **Timeout longer than caller's timeout** - If Service B has a 60s timeout but Service A gives up after 10s, Service B wastes resources processing a request nobody is waiting for.
3. **Same timeout for all operations** - A health check should timeout in 1-2s; a report generation might need 30s. Size timeouts per operation.
4. **Not cancelling on timeout** - Timing out without cancelling the underlying operation (thread, future, connection) leaks resources. Use `cancelRunningFuture(true)` or `AbortController`.
5. **Catching timeout as generic exception** - Timeout exceptions should be handled distinctly (return 504, trigger fallback) rather than caught in a generic error handler.
6. **Ignoring connection pool timeouts** - Even with request timeouts, a full connection pool can block the caller. Configure `connectionRequestTimeout` separately.

## Production Checklist

- [ ] Connection timeout set for every HTTP client (1-5s)
- [ ] Read timeout set for every HTTP client based on expected operation duration
- [ ] Overall timeout configured as a hard upper bound
- [ ] Cascading timeouts decrease toward leaf services
- [ ] Deadline/budget propagation implemented for deep call chains
- [ ] Timeout metrics collected (timeout count, timeout rate)
- [ ] Running futures/operations cancelled on timeout
- [ ] 504 Gateway Timeout returned when downstream times out
- [ ] Fallback behavior defined for timeout scenarios
- [ ] Load tested with artificial latency injection to verify timeout behavior
- [ ] Connection pool checkout timeout configured separately from request timeout
