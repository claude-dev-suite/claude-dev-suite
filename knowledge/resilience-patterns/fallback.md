# Fallback Pattern

## Overview

The fallback pattern provides alternative behavior when a primary operation fails. Rather than propagating errors directly to the user, the system responds with a degraded but functional experience. Fallbacks are the last line of defense in a resilience strategy, activated after retries are exhausted, circuit breakers are open, or timeouts are exceeded.

## Fallback Strategies

### Default Value

Return a static or pre-computed default when the service is unavailable. Best for non-critical data where stale or generic responses are acceptable.

```javascript
async function getProductRecommendations(userId) {
  try {
    return await recommendationService.getPersonalized(userId);
  } catch (err) {
    logger.warn('Recommendation service unavailable, returning defaults', { userId });
    return [
      { id: 'best-seller-1', name: 'Popular Item A', reason: 'Best Seller' },
      { id: 'best-seller-2', name: 'Popular Item B', reason: 'Best Seller' },
      { id: 'best-seller-3', name: 'Popular Item C', reason: 'Best Seller' },
    ];
  }
}
```

### Cache Fallback

Serve the last known good response from cache when the primary data source is unavailable. Best for data that changes infrequently or where eventual consistency is acceptable.

```java
@Service
public class ProductCatalogService {

    private final CatalogClient catalogClient;
    private final CacheManager cacheManager;

    public List<Product> getProducts(String category) {
        Cache cache = cacheManager.getCache("products");
        String cacheKey = "category:" + category;

        try {
            List<Product> products = catalogClient.fetchByCategory(category);
            cache.put(cacheKey, products);
            return products;
        } catch (ServiceUnavailableException e) {
            Cache.ValueWrapper cached = cache.get(cacheKey);
            if (cached != null) {
                log.warn("Catalog service down, serving cached products for {}", category);
                return (List<Product>) cached.get();
            }
            log.error("Catalog service down and no cache available for {}", category);
            throw new ServiceDegradedException("Product catalog temporarily unavailable");
        }
    }
}
```

```python
import redis
import json
import requests

redis_client = redis.Redis()

def get_exchange_rates(base_currency: str) -> dict:
    cache_key = f"exchange_rates:{base_currency}"

    try:
        response = requests.get(
            f"https://api.exchange.com/rates/{base_currency}",
            timeout=(3, 5),
        )
        response.raise_for_status()
        rates = response.json()

        # Store successful response with long TTL for fallback
        redis_client.setex(cache_key, 3600, json.dumps(rates))
        return rates

    except (requests.RequestException, requests.Timeout):
        cached = redis_client.get(cache_key)
        if cached:
            logger.warning("Exchange rate API down, using cached rates for %s", base_currency)
            return json.loads(cached)

        raise ExchangeRateUnavailableError(f"No rates available for {base_currency}")
```

### Graceful Degradation

Reduce functionality rather than failing entirely. Disable non-essential features while keeping the core flow operational.

```javascript
class OrderPage {
  async load(orderId) {
    // Core data (must succeed)
    const order = await orderService.getOrder(orderId);

    // Non-critical enrichments (fail gracefully)
    const [recommendations, reviews, tracking] = await Promise.allSettled([
      recommendationService.getRelated(order.productIds),
      reviewService.getReviews(order.productIds),
      trackingService.getStatus(order.trackingNumber),
    ]);

    return {
      order,
      recommendations: recommendations.status === 'fulfilled'
        ? recommendations.value
        : { available: false, reason: 'temporarily unavailable' },
      reviews: reviews.status === 'fulfilled'
        ? reviews.value
        : { available: false, reason: 'temporarily unavailable' },
      tracking: tracking.status === 'fulfilled'
        ? tracking.value
        : { available: false, reason: 'temporarily unavailable' },
    };
  }
}
```

```java
@Service
public class DashboardService {

    @CircuitBreaker(name = "analyticsService", fallbackMethod = "analyticsFallback")
    public DashboardData getDashboard(String userId) {
        UserProfile profile = userService.getProfile(userId);      // Critical
        Analytics analytics = analyticsService.getMetrics(userId);  // Non-critical
        List<Notification> alerts = notificationService.getAlerts(userId);

        return new DashboardData(profile, analytics, alerts);
    }

    private DashboardData analyticsFallback(String userId, Exception ex) {
        log.warn("Analytics unavailable for dashboard, showing limited view");
        UserProfile profile = userService.getProfile(userId);
        return new DashboardData(profile, Analytics.unavailable(), List.of());
    }
}
```

### Alternative Service

Route to a backup provider when the primary fails. Useful when redundant services or providers exist.

```javascript
class PaymentProcessor {
  constructor() {
    this.primary = new StripeClient();
    this.secondary = new PayPalClient();
    this.tertiary = new ManualQueueProcessor();
  }

  async processPayment(order) {
    // Try primary provider
    try {
      const result = await this.primary.charge(order);
      metrics.increment('payment.provider', { provider: 'stripe', status: 'success' });
      return result;
    } catch (primaryErr) {
      logger.warn('Primary payment provider (Stripe) failed', {
        orderId: order.id,
        error: primaryErr.message,
      });
      metrics.increment('payment.provider', { provider: 'stripe', status: 'failure' });
    }

    // Try secondary provider
    try {
      const result = await this.secondary.charge(order);
      metrics.increment('payment.provider', { provider: 'paypal', status: 'success' });
      return result;
    } catch (secondaryErr) {
      logger.warn('Secondary payment provider (PayPal) failed', {
        orderId: order.id,
        error: secondaryErr.message,
      });
      metrics.increment('payment.provider', { provider: 'paypal', status: 'failure' });
    }

    // Queue for manual processing as last resort
    logger.error('All payment providers failed, queuing for manual processing', {
      orderId: order.id,
    });
    return this.tertiary.enqueue(order);
  }
}
```

## Implementing Fallbacks with Decorators

### Python Decorator

```python
import functools
from typing import Callable, Any

def with_fallback(fallback_fn: Callable[..., Any], exceptions=(Exception,)):
    """Decorator that wraps a function with a fallback."""
    def decorator(fn):
        @functools.wraps(fn)
        async def async_wrapper(*args, **kwargs):
            try:
                return await fn(*args, **kwargs)
            except exceptions as e:
                logger.warning("Fallback triggered for %s: %s", fn.__name__, e)
                metrics.increment(f"fallback.{fn.__name__}.triggered")
                if asyncio.iscoroutinefunction(fallback_fn):
                    return await fallback_fn(*args, **kwargs)
                return fallback_fn(*args, **kwargs)

        @functools.wraps(fn)
        def sync_wrapper(*args, **kwargs):
            try:
                return fn(*args, **kwargs)
            except exceptions as e:
                logger.warning("Fallback triggered for %s: %s", fn.__name__, e)
                metrics.increment(f"fallback.{fn.__name__}.triggered")
                return fallback_fn(*args, **kwargs)

        if asyncio.iscoroutinefunction(fn):
            return async_wrapper
        return sync_wrapper
    return decorator

# Usage
def default_exchange_rates(base_currency: str) -> dict:
    return {"USD": 1.0, "EUR": 0.85, "GBP": 0.73}

@with_fallback(default_exchange_rates, exceptions=(requests.RequestException, TimeoutError))
def get_exchange_rates(base_currency: str) -> dict:
    response = requests.get(f"https://api.exchange.com/rates/{base_currency}", timeout=5)
    response.raise_for_status()
    return response.json()
```

### TypeScript Decorator

```typescript
function Fallback<T>(fallbackFn: (...args: any[]) => T | Promise<T>) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const original = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await original.apply(this, args);
      } catch (error) {
        console.warn(
          `Fallback triggered for ${propertyKey}:`,
          (error as Error).message
        );
        return fallbackFn.apply(this, args);
      }
    };

    return descriptor;
  };
}

class ProductService {
  @Fallback(() => [])
  async getRecommendations(userId: string): Promise<Product[]> {
    const response = await fetch(`/api/recommendations/${userId}`);
    return response.json();
  }

  @Fallback((productId: string) => ({ id: productId, rating: 0, count: 0 }))
  async getRating(productId: string): Promise<Rating> {
    const response = await fetch(`/api/ratings/${productId}`);
    return response.json();
  }
}
```

## Combining Fallback with Circuit Breaker

The circuit breaker detects failure and the fallback provides the degraded response. This combination is the most common resilience pattern in production.

### Resilience4j

```java
CircuitBreaker breaker = CircuitBreaker.of("catalogService", CircuitBreakerConfig.custom()
    .failureRateThreshold(50)
    .waitDurationInOpenState(Duration.ofSeconds(30))
    .build());

Supplier<List<Product>> decorated = CircuitBreaker.decorateSupplier(
    breaker,
    () -> catalogClient.getProducts(category)
);

List<Product> products = Try.ofSupplier(decorated)
    .recover(CallNotPermittedException.class, e -> {
        // Circuit is open -- serve from cache
        log.warn("Circuit open, serving cached catalog");
        return cacheManager.getCachedProducts(category);
    })
    .recover(Exception.class, e -> {
        // Service error -- try cache, then default
        log.warn("Catalog service error, trying cache", e);
        List<Product> cached = cacheManager.getCachedProducts(category);
        return cached != null ? cached : Collections.emptyList();
    })
    .get();
```

### Opossum (Node.js)

```javascript
import CircuitBreaker from 'opossum';

const breaker = new CircuitBreaker(
  (category) => catalogService.getProducts(category),
  {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
  }
);

// Primary fallback: cache
breaker.fallback(async (category) => {
  const cached = await cache.get(`products:${category}`);
  if (cached) {
    logger.info('Serving cached products for fallback');
    return JSON.parse(cached);
  }
  // Secondary fallback: empty list
  logger.warn('No cache available, returning empty catalog');
  return [];
});
```

## Fallback Chains

For critical operations, implement a chain of fallbacks with decreasing quality of service.

```javascript
class ResilientService {
  #chain = [];

  addFallback(fn, name) {
    this.#chain.push({ fn, name });
    return this;
  }

  async execute(...args) {
    for (let i = 0; i < this.#chain.length; i++) {
      const { fn, name } = this.#chain[i];
      try {
        const result = await fn(...args);
        if (i > 0) {
          metrics.increment('fallback.chain.used', { level: name });
        }
        return { result, source: name, degraded: i > 0 };
      } catch (err) {
        logger.warn(`Fallback chain: ${name} failed`, { error: err.message });
        if (i === this.#chain.length - 1) {
          throw new Error(`All fallbacks exhausted: ${err.message}`);
        }
      }
    }
  }
}

// Usage
const priceService = new ResilientService()
  .addFallback(
    (productId) => pricingApi.getCurrentPrice(productId),
    'live-pricing'
  )
  .addFallback(
    (productId) => redis.get(`price:${productId}`).then(JSON.parse),
    'cached-price'
  )
  .addFallback(
    (productId) => database.query('SELECT price FROM products WHERE id = ?', [productId]),
    'database-price'
  )
  .addFallback(
    (productId) => ({ amount: 0, currency: 'USD', unavailable: true }),
    'price-unavailable'
  );

const { result, source, degraded } = await priceService.execute('prod-123');
if (degraded) {
  response.setHeader('X-Degraded-Service', source);
}
```

## Monitoring Fallback Usage

### Key Metrics

```
# Counter: fallback invocations per service
fallback_invocations_total{service="catalog", strategy="cache"} 142
fallback_invocations_total{service="catalog", strategy="default"} 8

# Gauge: services currently in fallback mode
services_in_fallback{service="catalog"} 1
services_in_fallback{service="payments"} 0

# Histogram: response time comparison (normal vs fallback)
response_duration_seconds{service="catalog", mode="normal"} 0.15
response_duration_seconds{service="catalog", mode="fallback"} 0.002
```

### Alerting

```yaml
groups:
  - name: fallback_alerts
    rules:
      - alert: FallbackRateHigh
        expr: rate(fallback_invocations_total[5m]) / rate(requests_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "{{ $labels.service }} fallback rate above 10%"

      - alert: AllFallbacksExhausted
        expr: rate(fallback_chain_exhausted_total[5m]) > 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "{{ $labels.service }} all fallbacks exhausted"
```

## User Experience During Degradation

### Frontend Indicators

```jsx
function ProductPage({ product, degradedServices }) {
  return (
    <div>
      <h1>{product.name}</h1>
      <ProductDetails product={product} />

      {degradedServices.has('recommendations') ? (
        <div className="degraded-banner">
          <p>Personalized recommendations are temporarily unavailable.</p>
          <PopularProducts />
        </div>
      ) : (
        <PersonalizedRecommendations productId={product.id} />
      )}

      {degradedServices.has('reviews') ? (
        <div className="degraded-banner">
          <p>Reviews are temporarily unavailable.</p>
        </div>
      ) : (
        <ProductReviews productId={product.id} />
      )}
    </div>
  );
}
```

### API Response Headers

```
HTTP/1.1 200 OK
X-Degraded: recommendations,reviews
X-Fallback-Source: cache
X-Cache-Age: 3600
```

## Anti-Patterns

1. **No fallback at all** - Propagating every error to the user as a 500 destroys trust. Always have a plan B.
2. **Fallback that calls the same failing service** - A fallback that hits the same dependency it is replacing provides no resilience.
3. **Silent fallback without logging** - If fallbacks fire but nobody knows, the degradation goes undetected until it impacts business metrics.
4. **Fallback that is never tested** - If the fallback path is never exercised, it may be broken when it is needed. Test fallbacks explicitly.
5. **Stale cache fallback without age indication** - Serving hour-old prices without telling the user can lead to trust issues. Always indicate data freshness.
6. **Overly complex fallback logic** - If the fallback itself has complex dependencies, it can fail too. Keep fallbacks simple and self-contained.
7. **Fallback masking permanent failures** - If fallbacks fire for weeks without alerting, you may never fix the underlying service. Set thresholds for alerts.

## Production Checklist

- [ ] Fallback defined for every external dependency
- [ ] Fallback strategies appropriate per operation (cache, default, degradation, alternative)
- [ ] Fallback behavior tested in isolation (kill dependency, verify fallback fires)
- [ ] Metrics exported: fallback invocations, fallback source, degraded request percentage
- [ ] Alerts configured for sustained fallback usage
- [ ] User-facing degradation indicators implemented (banners, headers)
- [ ] Cache fallback has reasonable TTL and freshness indication
- [ ] Fallback chain ordered from highest to lowest quality of service
- [ ] Combined with circuit breaker to trigger fallback proactively
- [ ] Business stakeholders aware of what degraded experience looks like
- [ ] Chaos testing validates fallback behavior under realistic failure scenarios
