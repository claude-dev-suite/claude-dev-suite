---
name: spring-statemachine
description: |
  Spring Statemachine for building finite state machine applications.
  Covers states, transitions, guards, actions, persistence, and hierarchical states.

  USE WHEN: user mentions "spring statemachine", "state machine Spring", "workflow Spring",
  "finite state machine", "order state", "document lifecycle", "guards actions transitions"

  DO NOT USE FOR: simple status flags - use enum fields,
  complex workflow orchestration - use `spring-integration` or Camunda,
  business rules engine - use Drools
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Statemachine - Quick Reference

> **Full Reference**: See [advanced.md](advanced.md) for @WithStateMachine annotation, hierarchical states, choice pseudostates, timer transitions, listeners, persistence, and testing.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-statemachine` for comprehensive documentation.

## Dependencies

```xml
<!-- Spring Statemachine 4.0+ for Spring Boot 3.x -->
<dependency>
    <groupId>org.springframework.statemachine</groupId>
    <artifactId>spring-statemachine-starter</artifactId>
    <version>4.0.0</version>
</dependency>
<!-- For persistence -->
<dependency>
    <groupId>org.springframework.statemachine</groupId>
    <artifactId>spring-statemachine-data-jpa</artifactId>
    <version>4.0.0</version>
</dependency>
```

## Core Concepts

```
┌─────────────────────────────────────────────────────────────┐
│                    State Machine                            │
│                                                             │
│  ┌──────────┐    EVENT_A     ┌──────────┐                  │
│  │  STATE_1 │ ─────────────▶ │  STATE_2 │                  │
│  │ (initial)│                │          │                  │
│  └──────────┘                └────┬─────┘                  │
│                                   │                         │
│                              EVENT_B                        │
│                                   │                         │
│                                   ▼                         │
│                             ┌──────────┐                    │
│                             │  STATE_3 │                    │
│                             │  (final) │                    │
│                             └──────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

## Basic Configuration

### States and Events

```java
public enum OrderStates {
    CREATED,
    PENDING_PAYMENT,
    PAID,
    PROCESSING,
    SHIPPED,
    DELIVERED,
    CANCELLED,
    REFUNDED
}

public enum OrderEvents {
    SUBMIT,
    PAY,
    PROCESS,
    SHIP,
    DELIVER,
    CANCEL,
    REFUND
}
```

### State Machine Configuration

```java
@Configuration
@EnableStateMachineFactory
public class OrderStateMachineConfig
        extends EnumStateMachineConfigurerAdapter<OrderStates, OrderEvents> {

    @Override
    public void configure(StateMachineStateConfigurer<OrderStates, OrderEvents> states)
            throws Exception {
        states
            .withStates()
                .initial(OrderStates.CREATED)
                .state(OrderStates.PENDING_PAYMENT)
                .state(OrderStates.PAID)
                .state(OrderStates.PROCESSING)
                .state(OrderStates.SHIPPED)
                .end(OrderStates.DELIVERED)
                .end(OrderStates.CANCELLED)
                .end(OrderStates.REFUNDED);
    }

    @Override
    public void configure(StateMachineTransitionConfigurer<OrderStates, OrderEvents> transitions)
            throws Exception {
        transitions
            .withExternal()
                .source(OrderStates.CREATED)
                .target(OrderStates.PENDING_PAYMENT)
                .event(OrderEvents.SUBMIT)
            .and()
            .withExternal()
                .source(OrderStates.PENDING_PAYMENT)
                .target(OrderStates.PAID)
                .event(OrderEvents.PAY)
                .guard(paymentValidGuard())
                .action(paymentAction())
            .and()
            .withExternal()
                .source(OrderStates.PAID)
                .target(OrderStates.PROCESSING)
                .event(OrderEvents.PROCESS)
            .and()
            .withExternal()
                .source(OrderStates.PROCESSING)
                .target(OrderStates.SHIPPED)
                .event(OrderEvents.SHIP)
                .action(shipAction())
            .and()
            .withExternal()
                .source(OrderStates.SHIPPED)
                .target(OrderStates.DELIVERED)
                .event(OrderEvents.DELIVER)
            .and()
            // Cancel from multiple states
            .withExternal()
                .source(OrderStates.CREATED)
                .target(OrderStates.CANCELLED)
                .event(OrderEvents.CANCEL)
            .and()
            .withExternal()
                .source(OrderStates.PENDING_PAYMENT)
                .target(OrderStates.CANCELLED)
                .event(OrderEvents.CANCEL);
    }
}
```

---

## Guards and Actions

### Guards (Conditions)

```java
@Configuration
public class OrderGuards {

    @Bean
    public Guard<OrderStates, OrderEvents> paymentValidGuard() {
        return context -> {
            Order order = (Order) context.getExtendedState()
                .getVariables().get("order");
            PaymentInfo payment = (PaymentInfo) context.getMessage()
                .getHeaders().get("payment");

            return payment != null &&
                   payment.getAmount().compareTo(order.getTotal()) >= 0;
        };
    }

    @Bean
    public Guard<OrderStates, OrderEvents> refundEligibleGuard() {
        return context -> {
            Order order = (Order) context.getExtendedState()
                .getVariables().get("order");
            LocalDateTime deliveredAt = order.getDeliveredAt();

            // Refund within 30 days
            return deliveredAt != null &&
                   deliveredAt.plusDays(30).isAfter(LocalDateTime.now());
        };
    }
}
```

### Actions

```java
@Configuration
public class OrderActions {

    @Bean
    public Action<OrderStates, OrderEvents> paymentAction() {
        return context -> {
            Order order = (Order) context.getExtendedState()
                .getVariables().get("order");
            PaymentInfo payment = (PaymentInfo) context.getMessage()
                .getHeaders().get("payment");

            order.setPaymentId(payment.getTransactionId());
            order.setPaidAt(LocalDateTime.now());
            orderRepository.save(order);

            log.info("Payment processed for order: {}", order.getId());
        };
    }

    @Bean
    public Action<OrderStates, OrderEvents> shipAction() {
        return context -> {
            Order order = (Order) context.getExtendedState()
                .getVariables().get("order");

            String trackingNumber = shippingService.createShipment(order);
            order.setTrackingNumber(trackingNumber);
            order.setShippedAt(LocalDateTime.now());
            orderRepository.save(order);

            notificationService.sendShippingNotification(order);
        };
    }

    // Error action
    @Bean
    public Action<OrderStates, OrderEvents> errorAction() {
        return context -> {
            Exception exception = context.getException();
            log.error("State machine error: {}", exception.getMessage());
        };
    }
}
```

---

## State Machine Service

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class OrderStateMachineService {

    private final StateMachineFactory<OrderStates, OrderEvents> factory;
    private final OrderRepository orderRepository;

    public void processEvent(Long orderId, OrderEvents event, Map<String, Object> headers) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException(orderId));

        StateMachine<OrderStates, OrderEvents> sm = build(order);

        Message<OrderEvents> message = MessageBuilder
            .withPayload(event)
            .copyHeaders(headers)
            .setHeader("orderId", orderId)
            .build();

        // Reactive event sending (Spring Statemachine 4.0+)
        sm.sendEvent(Mono.just(message))
            .doOnComplete(() -> log.info("Event {} processed for order {}", event, orderId))
            .doOnError(e -> log.error("Error processing event: {}", e.getMessage()))
            .subscribe();
    }

    private StateMachine<OrderStates, OrderEvents> build(Order order) {
        StateMachine<OrderStates, OrderEvents> sm = factory.getStateMachine(
            order.getId().toString()
        );

        sm.stopReactively().block();

        sm.getStateMachineAccessor()
            .doWithAllRegions(accessor -> {
                accessor.resetStateMachineReactively(
                    new DefaultStateMachineContext<>(
                        order.getState(), null, null, null
                    )
                ).block();
            });

        sm.getExtendedState().getVariables().put("order", order);
        sm.startReactively().block();

        return sm;
    }

    public boolean canTransition(Long orderId, OrderEvents event) {
        Order order = orderRepository.findById(orderId).orElseThrow();
        StateMachine<OrderStates, OrderEvents> sm = build(order);

        return sm.getTransitions().stream()
            .anyMatch(t -> t.getSource().getId() == order.getState() &&
                          t.getTrigger().getEvent() == event);
    }
}
```

---

## Best Practices

| Do | Don't |
|----|-------|
| Define clear states and events | Use generic state names |
| Use guards for validation | Put business logic in transitions |
| Persist state machine state | Keep state only in memory |
| Handle all edge cases | Assume happy path only |
| Use listeners for monitoring | Ignore state changes |

## Production Checklist

- [ ] All states and transitions defined
- [ ] Guards validate business rules
- [ ] Actions handle side effects
- [ ] State persistence configured
- [ ] Error handling implemented
- [ ] Listeners for monitoring/logging
- [ ] Concurrent access handled
- [ ] Timeout transitions if needed
- [ ] State machine tested thoroughly
- [ ] Documentation of state diagram

## When NOT to Use This Skill

- **Simple status fields** - Use enum with database column
- **Complex orchestration** - Use Spring Integration or Camunda BPM
- **Business rules** - Use Drools or similar rules engine
- **Event-driven sagas** - Consider Spring Cloud Stream

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| State in memory only | Lost on restart | Use JPA persistence |
| Complex logic in guards | Hard to test | Extract to services |
| Missing error actions | Silent failures | Add error handling actions |
| Single machine instance | Concurrency issues | Use factory pattern |
| No state validation | Invalid transitions | Implement guards properly |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Event not accepted | Check current state | Verify transition exists |
| Guard always false | Debug guard logic | Log guard evaluation |
| Action not executed | Check transition config | Verify action is attached |
| State not persisted | Check persister config | Configure JPA persister |
| Machine not starting | Check initial state | Verify initial() configured |

## Reference Documentation

- [Spring Statemachine Reference](https://docs.spring.io/spring-statemachine/docs/current/reference/)
