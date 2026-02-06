---
name: micrometer-tracing
description: Distributed tracing and observability with Micrometer and Spring Boot 3
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Micrometer Tracing - Quick Reference

> **Full Reference**: See [advanced.md](advanced.md) for custom ObservationConvention, baggage propagation, logging integration, metrics, async tracing, and testing patterns.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `micrometer-tracing` for comprehensive documentation.

## Dependencies

```xml
<!-- Micrometer Tracing Bridge (choose one) -->
<!-- For Brave (Zipkin) -->
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-tracing-bridge-brave</artifactId>
</dependency>

<!-- For OpenTelemetry -->
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-tracing-bridge-otel</artifactId>
</dependency>

<!-- Reporter (choose one) -->
<dependency>
    <groupId>io.zipkin.reporter2</groupId>
    <artifactId>zipkin-reporter-brave</artifactId>
</dependency>
```

## Configuration

```yaml
spring:
  application:
    name: order-service

management:
  tracing:
    sampling:
      probability: 1.0  # Sample 100% in dev, lower in prod
  zipkin:
    tracing:
      endpoint: http://localhost:9411/api/v2/spans

logging:
  pattern:
    level: "%5p [${spring.application.name:},%X{traceId:-},%X{spanId:-}]"
```

## Core Concepts

```
┌─────────────────────────────────────────────────────────────┐
│ Trace (End-to-End Request)                                  │
│ TraceId: abc123                                             │
│                                                             │
│  ┌──────────────────┐                                       │
│  │ Span: API Gateway│ SpanId: 001 (Parent)                 │
│  └────────┬─────────┘                                       │
│           │                                                 │
│  ┌────────▼─────────┐  ┌─────────────────┐                 │
│  │ Span: Order Svc  │  │ Span: User Svc  │                 │
│  │ SpanId: 002      │  │ SpanId: 003     │                 │
│  └──────────────────┘  └─────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

## Automatic Instrumentation

Spring Boot 3 auto-instruments:
- HTTP Server (Spring MVC, WebFlux)
- HTTP Client (RestTemplate, WebClient, RestClient)
- JDBC, Kafka, RabbitMQ, Redis, MongoDB
- Scheduled Tasks

## Using Observation API

```java
@Service
@RequiredArgsConstructor
public class OrderService {

    private final ObservationRegistry observationRegistry;

    public Order processOrder(OrderRequest request) {
        return Observation.createNotStarted("order.process", observationRegistry)
            .lowCardinalityKeyValue("order.type", request.getType())
            .highCardinalityKeyValue("order.id", request.getId())
            .observe(() -> {
                Order order = createOrder(request);
                validateOrder(order);
                return saveOrder(order);
            });
    }
}
```

## Using @Observed Annotation

```java
@Configuration
public class ObservationConfig {
    @Bean
    public ObservedAspect observedAspect(ObservationRegistry registry) {
        return new ObservedAspect(registry);
    }
}

@Service
public class PaymentService {

    @Observed(
        name = "payment.process",
        contextualName = "process-payment",
        lowCardinalityKeyValues = {"payment.method", "credit_card"}
    )
    public PaymentResult processPayment(PaymentRequest request) {
        return paymentGateway.charge(request);
    }
}
```

## HTTP Client Tracing

```java
@Configuration
public class RestClientConfig {
    @Bean
    public RestClient restClient(RestClient.Builder builder) {
        return builder
            .baseUrl("http://order-service")
            .build();  // Auto-instrumented in Spring Boot 3
    }
}
```

## Best Practices

| Do | Don't |
|----|-------|
| Use low cardinality for tags | High cardinality in metrics |
| Sample appropriately in prod | 100% sampling in production |
| Propagate context in async | Lose trace context |
| Use meaningful span names | Generic names like "process" |
| Include traceId in logs | Log without correlation |

## Production Configuration

```yaml
management:
  tracing:
    sampling:
      probability: 0.1  # Sample 10% in production
  zipkin:
    tracing:
      endpoint: ${ZIPKIN_URL:http://zipkin:9411}/api/v2/spans
  metrics:
    tags:
      application: ${spring.application.name}
      environment: ${ENVIRONMENT:development}
```

## Checklist

- [ ] Sampling rate configured
- [ ] Trace exporter configured (Zipkin/Jaeger/OTLP)
- [ ] Logging includes traceId/spanId
- [ ] Baggage propagation configured
- [ ] Async context propagation working
- [ ] Custom observations for business ops
- [ ] Metrics exported to monitoring
- [ ] Health checks include tracing
- [ ] Error tracking in spans
- [ ] Performance overhead measured

## Reference

- [Micrometer Tracing Docs](https://micrometer.io/docs/tracing)
- [Spring Boot Observability](https://docs.spring.io/spring-boot/reference/actuator/tracing.html)
