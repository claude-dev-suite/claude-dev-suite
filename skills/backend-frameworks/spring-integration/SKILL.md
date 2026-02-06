---
name: spring-integration
description: |
  Spring Integration for Enterprise Integration Patterns (EIP) in Spring Boot 3.x.
  Covers Message Channels, Gateways, Transformers, Routers, Filters, Splitters,
  Aggregators, Adapters (File, JMS, Kafka, HTTP), and DSL.

  USE WHEN: user mentions "spring integration", "EIP", "enterprise integration patterns",
  "IntegrationFlow", "message channel", "gateway", "@MessagingGateway"

  DO NOT USE FOR: simple REST APIs - use Spring MVC,
  Kafka only - use `spring-kafka` skill,
  simple messaging - consider Spring Events
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Integration

> **Full Reference**: See [adapters.md](adapters.md) for File, HTTP, Kafka adapters, Error Handling, and Testing patterns.

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Spring Integration Flow                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   [Inbound]     [Channel]    [Transformer]    [Channel]   [Outbound] │
│   Adapter  ──▶  ════════ ──▶ ┌─────────┐ ──▶ ════════ ──▶ Adapter   │
│   (File,        (Queue/      │ Convert │     (Direct/    (DB,       │
│    HTTP,         Direct)     │ Enrich  │      PubSub)     Kafka,    │
│    Kafka)                    └─────────┘                   HTTP)    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```xml
<!-- pom.xml -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-integration</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.integration</groupId>
    <artifactId>spring-integration-file</artifactId>
</dependency>
```

```java
@Configuration
@EnableIntegration
public class IntegrationConfig {

    @Bean
    public IntegrationFlow fileProcessingFlow() {
        return IntegrationFlow
            .from(Files.inboundAdapter(new File("/input"))
                    .patternFilter("*.csv"),
                e -> e.poller(Pollers.fixedDelay(1000)))
            .transform(Files.toStringTransformer())
            .handle((payload, headers) -> {
                System.out.println("Processing: " + payload);
                return payload;
            })
            .get();
    }
}
```

---

## Message & Channels

```java
// Message structure
Message<String> message = MessageBuilder
    .withPayload("Hello Integration")
    .setHeader("contentType", "text/plain")
    .setHeader("priority", 1)
    .setCorrelationId(UUID.randomUUID())
    .build();

// Channel types
@Configuration
public class ChannelConfig {

    // Direct Channel (point-to-point, synchronous)
    @Bean
    public DirectChannel orderChannel() {
        return new DirectChannel();
    }

    // Queue Channel (point-to-point, async with buffer)
    @Bean
    public QueueChannel processingQueue() {
        return new QueueChannel(100);
    }

    // PublishSubscribe Channel (broadcast to all subscribers)
    @Bean
    public PublishSubscribeChannel notificationChannel() {
        return new PublishSubscribeChannel();
    }

    // Executor Channel (async with thread pool)
    @Bean
    public ExecutorChannel asyncChannel() {
        return new ExecutorChannel(Executors.newFixedThreadPool(10));
    }
}
```

---

## Gateway (Entry Point)

```java
@MessagingGateway
public interface OrderGateway {

    @Gateway(requestChannel = "orderChannel")
    void submitOrder(Order order);

    @Gateway(requestChannel = "orderChannel", replyChannel = "orderResponseChannel")
    OrderConfirmation submitOrderAndWait(Order order);

    @Gateway(requestChannel = "orderChannel", replyTimeout = 5000)
    @Async
    CompletableFuture<OrderConfirmation> submitOrderAsync(Order order);
}

@Service
@RequiredArgsConstructor
public class OrderService {
    private final OrderGateway orderGateway;

    public OrderConfirmation createOrder(CreateOrderRequest request) {
        Order order = mapToOrder(request);
        return orderGateway.submitOrderAndWait(order);
    }
}
```

---

## Integration Flow DSL

```java
@Bean
public IntegrationFlow orderFlow() {
    return IntegrationFlow
        .from("orderChannel")
        // Validation
        .filter(Order.class, order -> order.getTotal().compareTo(BigDecimal.ZERO) > 0,
            f -> f.discardChannel("invalidOrderChannel"))
        // Enrichment
        .enrich(e -> e
            .requestChannel("customerLookupChannel")
            .propertyExpression("customer", "payload"))
        // Transformation
        .transform(Order.class, order -> {
            order.setStatus(OrderStatus.VALIDATED);
            return order;
        })
        // Routing
        .<Order, String>route(order ->
                order.getTotal().compareTo(new BigDecimal("1000")) > 0
                    ? "highValueOrder" : "standardOrder",
            r -> r
                .subFlowMapping("highValueOrder", sf -> sf
                    .handle("priorityOrderHandler", "process"))
                .subFlowMapping("standardOrder", sf -> sf
                    .handle("standardOrderHandler", "process")))
        .handle("orderRepository", "save")
        .get();
}
```

---

## Splitter & Aggregator

```java
@Bean
public IntegrationFlow batchOrderFlow() {
    return IntegrationFlow
        .from("batchOrderChannel")
        // Split batch into individual orders
        .split(BatchOrder.class, BatchOrder::getOrders)
        .channel(c -> c.executor(Executors.newFixedThreadPool(5)))
        .handle("orderProcessor", "process")
        // Aggregate results
        .aggregate(a -> a
            .correlationStrategy(m -> m.getHeaders().get("correlationId"))
            .releaseStrategy(g -> g.size() == g.getSequenceSize())
            .outputProcessor(g -> new BatchResult(
                g.getMessages().stream()
                    .map(m -> (OrderResult) m.getPayload())
                    .toList()
            ))
            .expireGroupsUponCompletion(true)
            .groupTimeout(30000))
        .get();
}
```

---

## Transformers

```java
@Bean
public IntegrationFlow transformFlow() {
    return IntegrationFlow
        .from("inputChannel")
        .transform(String.class, String::toUpperCase)
        .transform(Transformers.toJson())
        .transform(Transformers.fromJson(Order.class))
        .enrichHeaders(h -> h
            .header("timestamp", Instant.now())
            .headerExpression("orderValue", "payload.total"))
        .channel("outputChannel")
        .get();
}
```

---

## Routers

```java
// Header-based router
@Bean
public IntegrationFlow headerRouterFlow() {
    return IntegrationFlow
        .from("inboundChannel")
        .<Message<?>, String>route(m -> m.getHeaders().get("type", String.class),
            r -> r
                .subFlowMapping("ORDER", sf -> sf.channel("orderChannel"))
                .subFlowMapping("PAYMENT", sf -> sf.channel("paymentChannel"))
                .defaultOutputChannel("unknownChannel"))
        .get();
}

// Payload-based router
@Bean
public IntegrationFlow payloadRouterFlow() {
    return IntegrationFlow
        .from("orderChannel")
        .<Order, OrderType>route(Order::getType,
            r -> r
                .subFlowMapping(OrderType.STANDARD, sf -> sf
                    .handle("standardProcessor", "process"))
                .subFlowMapping(OrderType.EXPRESS, sf -> sf
                    .handle("expressProcessor", "process")))
        .get();
}
```

---

## Service Activator

```java
@Component
public class OrderHandler {

    @ServiceActivator(inputChannel = "orderChannel", outputChannel = "resultChannel")
    public OrderResult processOrder(Order order,
                                    @Header("priority") int priority) {
        validateOrder(order);
        calculateTotals(order);
        return new OrderResult(order.getId(), "PROCESSED");
    }
}

// DSL equivalent
@Bean
public IntegrationFlow serviceActivatorFlow() {
    return IntegrationFlow
        .from("orderChannel")
        .handle(Order.class, (order, headers) -> {
            return new OrderResult(order.getId(), "PROCESSED");
        })
        .channel("resultChannel")
        .get();
}
```

---

## Best Practices

| Do | Don't |
|----|-------|
| Use DSL for readable flows | Build flows with XML only |
| Configure error channels | Ignore errors silently |
| Implement retry with backoff | Fail on first error |
| Use queue channels for decoupling | Block in synchronous handlers |
| Monitor channel metrics | Deploy without observability |

## Production Checklist

- [ ] Error channels configured
- [ ] Retry policies implemented
- [ ] Queue channel capacities set
- [ ] Idempotent receivers where needed
- [ ] Proper timeout configuration
- [ ] Dead letter channels for failures

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| No error channel | Silent failures | Configure global errorChannel |
| Blocking in DirectChannel | Thread exhaustion | Use QueueChannel or async |
| Unbounded queue | Memory leak | Set queue capacity |
| Missing idempotency | Duplicate processing | Use IdempotentReceiverInterceptor |

## Quick Troubleshooting

| Problem | Fix |
|---------|-----|
| No channel found | Define @Bean for channel |
| Dispatcher has no subscribers | Add handler to flow |
| Reply timeout | Use nullChannel or return value |
| Duplicate messages | Add IdempotentReceiverInterceptor |

## Reference Documentation
- [Spring Integration Reference](https://docs.spring.io/spring-integration/reference/)
- [Enterprise Integration Patterns](https://www.enterpriseintegrationpatterns.com/)
