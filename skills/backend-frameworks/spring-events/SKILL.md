---
name: spring-events
description: |
  Spring Application Events for Spring Boot 3.x. Covers ApplicationEventPublisher,
  @EventListener, @TransactionalEventListener, custom events, async events,
  and event-driven architecture patterns.

  USE WHEN: user mentions "spring events", "ApplicationEventPublisher",
  "@EventListener", "@TransactionalEventListener", "event-driven Spring", "domain events"

  DO NOT USE FOR: external messaging - use `spring-amqp` or `spring-kafka`,
  distributed events - use messaging systems
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Application Events

## Quick Start

```java
// Custom Event (POJO - preferred)
public record OrderCreatedEvent(
    Long orderId,
    Long customerId,
    BigDecimal totalAmount,
    Instant createdAt
) {}

// Publisher
@Service
@RequiredArgsConstructor
public class OrderService {

    private final ApplicationEventPublisher eventPublisher;

    @Transactional
    public Order createOrder(CreateOrderRequest request) {
        Order order = orderRepository.save(new Order(request));
        eventPublisher.publishEvent(new OrderCreatedEvent(
            order.getId(), order.getCustomerId(),
            order.getTotalAmount(), order.getCreatedAt()
        ));
        return order;
    }
}

// Listener
@Component
@Slf4j
public class OrderEventListener {

    @EventListener
    public void handleOrderCreated(OrderCreatedEvent event) {
        log.info("Order created: {}", event.orderId());
    }
}
```

---

## @EventListener

```java
@Component
public class EventListeners {

    // Basic listener
    @EventListener
    public void handleOrderCreated(OrderCreatedEvent event) {
        log.info("Processing order: {}", event.orderId());
    }

    // Conditional listener
    @EventListener(condition = "#event.totalAmount > 1000")
    public void handleLargeOrder(OrderCreatedEvent event) {
        notifyManager(event);
    }

    // Ordered execution
    @EventListener
    @Order(1)  // Executed first
    public void validateOrder(OrderCreatedEvent event) { }

    @EventListener
    @Order(2)  // Executed second
    public void processOrder(OrderCreatedEvent event) { }

    // Multiple event types
    @EventListener({OrderCreatedEvent.class, OrderUpdatedEvent.class})
    public void handleOrderChange(Object event) { }
}
```

### Event Chain (Publish New Event from Listener)

```java
@EventListener
public NotificationEvent handleOrderCreated(OrderCreatedEvent event) {
    return new NotificationEvent(event.customerId(), "Order created!");
}

@EventListener
public Collection<Object> handleOrderShipped(OrderShippedEvent event) {
    return List.of(
        new NotificationEvent(event.customerId(), "Order shipped!"),
        new AnalyticsEvent("order_shipped", event.orderId())
    );
}
```

---

## Custom Events

```java
// Generic event
public class EntityEvent<T> {
    private final T entity;
    private final EventType type;
    private final Instant timestamp = Instant.now();

    public enum EventType { CREATED, UPDATED, DELETED }
}

// Generic publisher
@Component
public class EntityEventPublisher {
    private final ApplicationEventPublisher publisher;

    public <T> void publishCreated(T entity) {
        publisher.publishEvent(new EntityEvent<>(entity, EventType.CREATED));
    }
}

// Typed listener
@EventListener
public void handleUserEvent(EntityEvent<User> event) {
    switch (event.getType()) {
        case CREATED -> handleUserCreated(event.getEntity());
        case UPDATED -> handleUserUpdated(event.getEntity());
    }
}
```

> **Full Reference**: See [transactional.md](transactional.md) for @TransactionalEventListener, Async Events.

---

## @TransactionalEventListener

```java
// Execute AFTER transaction commit (default)
@TransactionalEventListener
public void handleAfterCommit(OrderCreatedEvent event) {
    emailService.sendOrderConfirmation(event.orderId());
}

// Execute AFTER rollback
@TransactionalEventListener(phase = TransactionPhase.AFTER_ROLLBACK)
public void handleAfterRollback(OrderCreatedEvent event) {
    alertService.notifyRollback(event);
}

// Execute BEFORE commit
@TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
public void handleBeforeCommit(OrderCreatedEvent event) {
    validateOrderBeforeCommit(event);
}

// Fallback if no transaction
@TransactionalEventListener(fallbackExecution = true)
public void handleWithFallback(OrderCreatedEvent event) { }
```

> **Full Reference**: See [patterns.md](patterns.md) for Domain Events, Aggregate Root, Event Store.

---

## Best Practices

- ✅ Use @TransactionalEventListener for side effects
- ✅ Use @Async for non-critical operations
- ✅ Implement retry for fallible listeners
- ✅ Use immutable events (records)
- ✅ Define order with @Order if needed
- ❌ Don't modify state in sync listeners
- ❌ Don't assume execution order without @Order

---

## Production Checklist

- [ ] Event classes immutabili
- [ ] TransactionalEventListener for external calls
- [ ] Async for non-critical operations
- [ ] Error handling implemented
- [ ] Retry for transient operations
- [ ] Monitoring events

---

## When NOT to Use This Skill

- **Distributed events** - Use `spring-kafka` or `spring-amqp`
- **Guaranteed delivery** - Use messaging systems
- **Event sourcing** - Consider Axon Framework

---

## Common Pitfalls

| Error | Cause | Solution |
|-------|-------|----------|
| Listener not executed | Missing @Component | Add annotation |
| Event lost on rollback | Using @EventListener | Use @TransactionalEventListener |
| Deadlock | Sync listener calls same service | Use @Async |
| Exception hidden | Async void | Implement error handler |

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Sync events in transaction | Long transactions | Use @Async or @TransactionalEventListener |
| Circular event publishing | Infinite loop | Guard with flags |
| Heavy processing in sync | Blocks publisher | Use async listeners |
| Modifying event after publish | Shared state issues | Make events immutable |

---

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Listener not invoked | Check @EventListener | Verify component scanned |
| Transaction not committed | Check event phase | Use AFTER_COMMIT |
| Async not working | Check @EnableAsync | Add to config |
| Order matters | Listeners random | Use @Order |

---

## Reference Files

| File | Content |
|------|---------|
| [transactional.md](transactional.md) | @TransactionalEventListener, Async Events, Lifecycle |
| [patterns.md](patterns.md) | Domain Events, Aggregate Root, Event Store |

---

## External Documentation

- [Application Events](https://docs.spring.io/spring-framework/reference/core/beans/context-introduction.html#context-functionality-events)
- [TransactionalEventListener](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html)
