# Metrics with Micrometer

## Custom Metrics

```java
@Service
@RequiredArgsConstructor
public class OrderService {

    private final MeterRegistry meterRegistry;
    private final Counter orderCounter;
    private final Timer orderProcessingTimer;
    private final AtomicInteger activeOrders;

    public OrderService(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;

        // Counter
        this.orderCounter = Counter.builder("orders.created")
            .description("Total orders created")
            .tag("type", "counter")
            .register(meterRegistry);

        // Timer
        this.orderProcessingTimer = Timer.builder("orders.processing.time")
            .description("Order processing time")
            .publishPercentiles(0.5, 0.95, 0.99)
            .publishPercentileHistogram()
            .register(meterRegistry);

        // Gauge
        this.activeOrders = new AtomicInteger(0);
        Gauge.builder("orders.active", activeOrders, AtomicInteger::get)
            .description("Currently active orders")
            .register(meterRegistry);
    }

    public Order createOrder(OrderRequest request) {
        return orderProcessingTimer.record(() -> {
            activeOrders.incrementAndGet();
            try {
                Order order = processOrder(request);

                // Counter con tags dinamici
                orderCounter.increment();
                meterRegistry.counter("orders.created.by.type",
                    "type", request.getType(),
                    "region", request.getRegion()
                ).increment();

                return order;
            } finally {
                activeOrders.decrementAndGet();
            }
        });
    }

    // Distribution Summary per valori
    public void recordOrderValue(double value) {
        DistributionSummary.builder("orders.value")
            .description("Order values")
            .baseUnit("currency")
            .publishPercentiles(0.5, 0.95)
            .register(meterRegistry)
            .record(value);
    }
}
```

---

## Metrics with Annotations

```java
@Service
public class PaymentService {

    @Timed(value = "payment.process.time", description = "Payment processing time")
    public PaymentResult processPayment(PaymentRequest request) {
        // Processing logic
        return new PaymentResult();
    }

    @Counted(value = "payment.attempts", description = "Payment attempts")
    public void attemptPayment(String paymentId) {
        // Attempt logic
    }
}

// Abilitare @Timed
@Configuration
public class MetricsConfig {

    @Bean
    public TimedAspect timedAspect(MeterRegistry registry) {
        return new TimedAspect(registry);
    }

    @Bean
    public CountedAspect countedAspect(MeterRegistry registry) {
        return new CountedAspect(registry);
    }
}
```

---

## HTTP Metrics Customization

```java
@Configuration
public class WebMvcMetricsConfig {

    @Bean
    public WebMvcTagsContributor customTagsContributor() {
        return new WebMvcTagsContributor() {
            @Override
            public Iterable<Tag> getTags(
                    HttpServletRequest request,
                    HttpServletResponse response,
                    Object handler,
                    Throwable exception) {

                return Tags.of(
                    Tag.of("user.type", getUserType(request)),
                    Tag.of("api.version", getApiVersion(request))
                );
            }

            @Override
            public Iterable<Tag> getLongRequestTags(
                    HttpServletRequest request,
                    Object handler) {
                return Tags.empty();
            }
        };
    }

    private String getUserType(HttpServletRequest request) {
        return "standard";
    }

    private String getApiVersion(HttpServletRequest request) {
        String path = request.getRequestURI();
        if (path.contains("/v2/")) return "v2";
        if (path.contains("/v1/")) return "v1";
        return "unknown";
    }
}
```

---

## Prometheus Integration

```yaml
management:
  endpoints:
    web:
      exposure:
        include: prometheus,health,info,metrics
  prometheus:
    metrics:
      export:
        enabled: true
```

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'spring-boot-app'
    metrics_path: '/actuator/prometheus'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:8080']
```

---

## Business Metrics for Grafana

```java
@Component
@RequiredArgsConstructor
public class BusinessMetrics {

    private final MeterRegistry meterRegistry;

    @PostConstruct
    public void initMetrics() {
        // Business KPIs
        Gauge.builder("business.users.active", this, m -> getActiveUsers())
            .description("Currently active users")
            .register(meterRegistry);

        Gauge.builder("business.orders.pending", this, m -> getPendingOrders())
            .description("Orders pending processing")
            .register(meterRegistry);
    }

    public void recordBusinessEvent(String eventType, Map<String, String> tags) {
        Tags meterTags = Tags.of(
            tags.entrySet().stream()
                .map(e -> Tag.of(e.getKey(), e.getValue()))
                .toList()
        );

        meterRegistry.counter("business.events", meterTags).increment();
    }
}
```

---

## Prometheus Alert Rules

```yaml
# alerts.yml
groups:
  - name: spring-boot-alerts
    rules:
      - alert: HighErrorRate
        expr: |
          rate(http_server_requests_seconds_count{status=~"5.."}[5m])
          / rate(http_server_requests_seconds_count[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on {{ $labels.instance }}"

      - alert: SlowResponseTime
        expr: |
          histogram_quantile(0.95, rate(http_server_requests_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning

      - alert: HighMemoryUsage
        expr: |
          jvm_memory_used_bytes{area="heap"}
          / jvm_memory_max_bytes{area="heap"} > 0.9
        for: 5m
        labels:
          severity: warning

      - alert: DatabaseConnectionPoolExhausted
        expr: |
          hikaricp_connections_active
          / hikaricp_connections_max > 0.9
        for: 2m
        labels:
          severity: critical
```
