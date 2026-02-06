---
name: spring-modulith
description: |
  Spring Modulith for modular architecture in Spring Boot 3.x. Covers module
  structure, API vs internal packages, inter-module events, module testing,
  documentation generation, and observability.

  USE WHEN: user mentions "spring modulith", "modular monolith", "@ApplicationModule",
  "module boundaries", "inter-module events", "@ApplicationModuleTest", "modular architecture"

  DO NOT USE FOR: simple applications - unnecessary complexity,
  microservices - use proper service boundaries,
  existing tightly coupled monoliths - requires significant refactoring
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Modulith

> **Full Reference**: See [advanced.md](advanced.md) for Event Externalization (Outbox), Module API Exposure, @ApplicationModuleTest, Scenario Testing, Architecture Verification, Observability, and Gradual Decomposition.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Spring Modulith Application                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │    Order     │   │   Payment    │   │  Inventory   │        │
│  │    Module    │──▶│    Module    │◀──│    Module    │        │
│  ├──────────────┤   ├──────────────┤   ├──────────────┤        │
│  │ order/       │   │ payment/     │   │ inventory/   │        │
│  │ ├─ api/      │   │ ├─ api/      │   │ ├─ api/      │        │
│  │ │  (public)  │   │ │  (public)  │   │ │  (public)  │        │
│  │ └─ internal/ │   │ └─ internal/ │   │ └─ internal/ │        │
│  │    (private) │   │    (private) │   │    (private) │        │
│  └──────────────┘   └──────────────┘   └──────────────┘        │
│         │                   │                   │               │
│         └───────────────────┴───────────────────┘               │
│                    Event Bus (Async)                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

```xml
<!-- pom.xml -->
<dependency>
    <groupId>org.springframework.modulith</groupId>
    <artifactId>spring-modulith-starter-core</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.modulith</groupId>
    <artifactId>spring-modulith-starter-test</artifactId>
    <scope>test</scope>
</dependency>
```

```
src/main/java/com/example/ecommerce/
├── EcommerceApplication.java        # Root package
├── order/                           # Order module
│   ├── Order.java                   # Public API
│   ├── OrderService.java            # Public API
│   ├── OrderCreatedEvent.java       # Public event
│   └── internal/                    # Internal implementation
│       ├── OrderRepository.java
│       └── OrderValidator.java
├── payment/                         # Payment module
│   ├── PaymentService.java
│   └── internal/
└── shared/                          # Shared kernel (minimal!)
    └── Money.java
```

---

## Module Structure

```java
// Package-info to document module
// order/package-info.java
@org.springframework.modulith.ApplicationModule(
    displayName = "Order Management",
    allowedDependencies = {"payment", "inventory::InventoryService"}
)
package com.example.ecommerce.order;
```

```java
// Public API (root package)
@Service
@RequiredArgsConstructor
@Transactional
public class OrderService {

    private final OrderRepository orderRepository;
    private final ApplicationEventPublisher events;

    public Order createOrder(CreateOrderRequest request) {
        Order order = Order.create(request.customerId(), request.items());
        order = orderRepository.save(order);

        // Publish event for other modules
        events.publishEvent(new OrderCreatedEvent(order.getId(), order.getTotal()));

        return order;
    }

    public void confirmOrder(Long orderId) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException(orderId));
        order.confirm();
        orderRepository.save(order);

        events.publishEvent(new OrderConfirmedEvent(orderId));
    }
}

// Public event
public record OrderCreatedEvent(Long orderId, Money total) {}
```

```java
// Internal implementation (not accessible from other modules)
// order/internal/OrderRepository.java
@Repository
interface OrderRepository extends JpaRepository<Order, Long> {
    List<Order> findByCustomerId(Long customerId);
}
```

---

## Inter-Module Communication via Events

```java
// Payment module listens to Order module events
// payment/internal/OrderEventHandler.java
@Component
@RequiredArgsConstructor
@Slf4j
class OrderEventHandler {

    private final PaymentService paymentService;

    @EventListener
    public void onOrderCreated(OrderCreatedEvent event) {
        log.info("Order created: {}, processing payment", event.orderId());
        paymentService.initiatePayment(event.orderId(), event.total());
    }
}

// payment/PaymentService.java
@Service
@RequiredArgsConstructor
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final ApplicationEventPublisher events;

    public void initiatePayment(Long orderId, Money amount) {
        Payment payment = Payment.create(orderId, amount);
        payment = paymentRepository.save(payment);
        processPaymentAsync(payment);
    }

    @Async
    void processPaymentAsync(Payment payment) {
        try {
            payment.confirm();
            paymentRepository.save(payment);
            events.publishEvent(new PaymentConfirmedEvent(payment.getOrderId(), payment.getId()));
        } catch (PaymentFailedException e) {
            payment.fail(e.getMessage());
            paymentRepository.save(payment);
            events.publishEvent(new PaymentFailedEvent(payment.getOrderId(), e.getMessage()));
        }
    }
}
```

```java
// Order module reacts to Payment events
// order/internal/PaymentEventHandler.java
@Component
@RequiredArgsConstructor
class PaymentEventHandler {

    private final OrderService orderService;

    @EventListener
    public void onPaymentConfirmed(PaymentConfirmedEvent event) {
        orderService.confirmOrder(event.orderId());
    }

    @EventListener
    public void onPaymentFailed(PaymentFailedEvent event) {
        orderService.cancelOrder(event.orderId(), event.reason());
    }
}
```

---

## Best Practices

### Module Design

```java
// ✅ DO: Expose only what's needed
@ApplicationModule(allowedDependencies = {"shared"})
package com.example.ecommerce.order;

// ✅ DO: Communicate via events
events.publishEvent(new OrderCreatedEvent(orderId));

// ✅ DO: Use records for immutable events
public record OrderCreatedEvent(Long orderId, Money total) {}

// ❌ DON'T: Circular dependencies
// order → payment → order  // WRONG!

// ❌ DON'T: Expose repositories
public interface OrderRepository { } // Should not be public

// ❌ DON'T: Direct access to internal
@Autowired
OrderValidator validator; // From another module - WRONG!
```

### Event Design

```java
// ✅ DO: Events with all necessary data
public record OrderCreatedEvent(
    Long orderId,
    Long customerId,
    Money total,
    List<OrderItem> items,
    Instant createdAt
) {}

// ❌ DON'T: Events requiring callback
public record OrderCreatedEvent(Long orderId) {}
// Consumer must call orderService.getOrder(orderId) - WRONG!
```

---

## Best Practices Table

| Do | Don't |
|----|-------|
| One module = one bounded context | Mix unrelated concerns |
| Public API in root package | Expose internal classes |
| Implementation in `internal/` | Access internal from outside |
| Communicate via events | Direct cross-module calls |
| Use immutable events (records) | Mutable event objects |

## Production Checklist

- [ ] Module boundaries defined
- [ ] Internal packages properly scoped
- [ ] Event-based communication
- [ ] Architecture verification tests
- [ ] Event persistence configured
- [ ] Failed event retry mechanism
- [ ] Documentation generated
- [ ] No circular dependencies
- [ ] Shared kernel minimal

## When NOT to Use This Skill

- **Simple applications** - Unnecessary complexity
- **Existing microservices** - Already decomposed
- **Tightly coupled monoliths** - Requires significant refactoring first
- **Small teams** - May not need formal boundaries

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Circular dependency | Modules reference each other | Use events or shared kernel |
| Internal class exposed | Wrong package structure | Move to `internal/` package |
| Event not published | Missing transaction | Verify @Transactional |
| Event lost | No persistence | Use spring-modulith-events-jpa |
| Callback events | Events require calling back | Include all data in event |
| Exposing repositories | Tight coupling | Keep repositories internal |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Circular dependency | Run modules.verify() | Refactor to use events |
| Internal access violation | Check package structure | Move classes appropriately |
| Event not received | Check listener | Verify @EventListener annotation |
| Test fails in isolation | Check dependencies | Use appropriate BootstrapMode |
| Event publication fails | Check transaction | Ensure @Transactional present |

## Reference Documentation
- [Spring Modulith Reference](https://docs.spring.io/spring-modulith/reference/)
- [Modular Monoliths Primer](https://www.kamilgrzybek.com/design/modular-monolith-primer/)
