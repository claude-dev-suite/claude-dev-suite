# Spring Statemachine Advanced Patterns

## @WithStateMachine Annotation

Cleaner integration using annotations:

```java
@Component
@WithStateMachine
@Slf4j
public class OrderStateHandler {

    @OnTransition(source = "PENDING_PAYMENT", target = "PAID")
    public void onPaymentReceived(
            @EventHeaders Map<String, Object> headers,
            ExtendedState extendedState) {
        Order order = (Order) extendedState.getVariables().get("order");
        log.info("Payment received for order: {}", order.getId());
    }

    @OnTransition(source = "PROCESSING", target = "SHIPPED")
    public void onShipped(ExtendedState extendedState) {
        Order order = (Order) extendedState.getVariables().get("order");
        log.info("Order shipped: {}", order.getId());
    }

    @OnStateEntry(target = "CANCELLED")
    public void onCancelled(ExtendedState extendedState) {
        log.info("Order entered CANCELLED state");
    }

    @OnStateExit(source = "CREATED")
    public void onCreatedExit() {
        log.info("Leaving CREATED state");
    }
}
```

---

## Hierarchical States

```java
@Override
public void configure(StateMachineStateConfigurer<States, Events> states) throws Exception {
    states
        .withStates()
            .initial(States.PROCESSING)
            .state(States.PROCESSING)
            .state(States.COMPLETED)
            .and()
        .withStates()
            .parent(States.PROCESSING)
            .initial(States.VALIDATING)
            .state(States.VALIDATING)
            .state(States.APPROVED)
            .state(States.REJECTED)
            .end(States.APPROVED)
            .end(States.REJECTED);
}
```

---

## Choice and Junction Pseudostates

```java
@Override
public void configure(StateMachineStateConfigurer<States, Events> states) throws Exception {
    states
        .withStates()
            .initial(States.INITIAL)
            .choice(States.CHOICE)  // Decision point
            .state(States.APPROVED)
            .state(States.REJECTED)
            .state(States.MANUAL_REVIEW);
}

@Override
public void configure(StateMachineTransitionConfigurer<States, Events> transitions) throws Exception {
    transitions
        .withExternal()
            .source(States.INITIAL)
            .target(States.CHOICE)
            .event(Events.EVALUATE)
        .and()
        .withChoice()
            .source(States.CHOICE)
            .first(States.APPROVED, approvalGuard())      // If guard returns true
            .then(States.MANUAL_REVIEW, reviewGuard())    // Else if this guard
            .last(States.REJECTED);                        // Else (default)
}

@Bean
public Guard<States, Events> approvalGuard() {
    return context -> {
        Integer score = (Integer) context.getExtendedState().getVariables().get("score");
        return score != null && score >= 80;
    };
}
```

---

## Timer-Based Transitions

```java
@Override
public void configure(StateMachineTransitionConfigurer<States, Events> transitions) throws Exception {
    transitions
        .withInternal()
            .source(States.PENDING)
            .action(reminderAction())
            .timer(60000)  // Fire every 60 seconds
        .and()
        .withExternal()
            .source(States.PENDING)
            .target(States.EXPIRED)
            .timerOnce(3600000);  // Fire once after 1 hour (auto-expire)
}
```

---

## Listeners

```java
@Component
@Slf4j
public class OrderStateMachineListener
        extends StateMachineListenerAdapter<OrderStates, OrderEvents> {

    @Override
    public void stateChanged(State<OrderStates, OrderEvents> from,
                            State<OrderStates, OrderEvents> to) {
        log.info("State changed from {} to {}",
            from != null ? from.getId() : "none",
            to.getId());
    }

    @Override
    public void eventNotAccepted(Message<OrderEvents> event) {
        log.warn("Event not accepted: {}", event.getPayload());
    }

    @Override
    public void transition(Transition<OrderStates, OrderEvents> transition) {
        log.debug("Transition: {} -> {} via {}",
            transition.getSource().getId(),
            transition.getTarget().getId(),
            transition.getTrigger().getEvent());
    }

    @Override
    public void stateMachineError(StateMachine<OrderStates, OrderEvents> stateMachine,
                                  Exception exception) {
        log.error("State machine error", exception);
    }
}

// Register listener
@Override
public void configure(StateMachineConfigurationConfigurer<OrderStates, OrderEvents> config)
        throws Exception {
    config
        .withConfiguration()
        .listener(orderStateMachineListener);
}
```

---

## Persistence

### JPA Persistence

```java
@Configuration
public class StateMachinePersistConfig {

    @Bean
    public StateMachineRuntimePersister<OrderStates, OrderEvents, String> persister(
            JpaStateMachineRepository repository) {
        return new JpaPersistingStateMachineInterceptor<>(repository);
    }
}

@Override
public void configure(StateMachineConfigurationConfigurer<OrderStates, OrderEvents> config)
        throws Exception {
    config
        .withPersistence()
        .runtimePersister(persister);
}
```

### Custom Persistence

```java
@Component
public class OrderStateMachinePersister
        implements StateMachinePersister<OrderStates, OrderEvents, Long> {

    private final OrderRepository orderRepository;

    @Override
    public void persist(StateMachine<OrderStates, OrderEvents> stateMachine, Long orderId) {
        Order order = orderRepository.findById(orderId).orElseThrow();
        order.setState(stateMachine.getState().getId());
        orderRepository.save(order);
    }

    @Override
    public StateMachine<OrderStates, OrderEvents> restore(
            StateMachine<OrderStates, OrderEvents> stateMachine, Long orderId) {
        Order order = orderRepository.findById(orderId).orElseThrow();

        stateMachine.getStateMachineAccessor()
            .doWithAllRegions(accessor -> {
                accessor.resetStateMachine(
                    new DefaultStateMachineContext<>(
                        order.getState(), null, null, null
                    )
                );
            });

        return stateMachine;
    }
}
```

---

## Testing

### Basic Testing with Reactive API

```java
@SpringBootTest
class OrderStateMachineTest {

    @Autowired
    private StateMachineFactory<OrderStates, OrderEvents> factory;

    @Test
    void shouldTransitionFromCreatedToPendingPayment() {
        StateMachine<OrderStates, OrderEvents> sm = factory.getStateMachine();
        sm.startReactively().block();

        assertThat(sm.getState().getId()).isEqualTo(OrderStates.CREATED);

        sm.sendEvent(Mono.just(MessageBuilder
            .withPayload(OrderEvents.SUBMIT)
            .build()))
            .blockLast();

        assertThat(sm.getState().getId()).isEqualTo(OrderStates.PENDING_PAYMENT);
    }
}
```

### StateMachineTestPlan (Recommended)

```java
@SpringBootTest
class OrderStateMachineTestPlanTest {

    @Autowired
    private StateMachineFactory<OrderStates, OrderEvents> factory;

    @Test
    void shouldFollowHappyPath() throws Exception {
        StateMachine<OrderStates, OrderEvents> sm = factory.getStateMachine();

        StateMachineTestPlanBuilder.<OrderStates, OrderEvents>builder()
            .stateMachine(sm)
            .step()
                .expectState(OrderStates.CREATED)
            .and()
            .step()
                .sendEvent(OrderEvents.SUBMIT)
                .expectState(OrderStates.PENDING_PAYMENT)
                .expectStateChanged(1)
            .and()
            .step()
                .sendEvent(OrderEvents.PAY)
                .expectState(OrderStates.PAID)
            .and()
            .build()
            .test();
    }

    @Test
    void shouldValidateWithExtendedState() throws Exception {
        StateMachine<OrderStates, OrderEvents> sm = factory.getStateMachine();
        sm.getExtendedState().getVariables().put("score", 85);

        StateMachineTestPlanBuilder.<OrderStates, OrderEvents>builder()
            .stateMachine(sm)
            .step()
                .sendEvent(Events.EVALUATE)
                .expectState(States.APPROVED)
                .expectVariable("score", 85)
            .and()
            .build()
            .test();
    }
}
```
