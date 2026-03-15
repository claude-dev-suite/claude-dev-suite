# @SpringRabbitTest Quick Reference

## Annotation Setup

`@SpringRabbitTest` auto-configures these beans:
- `RabbitListenerTestHarness` — intercepts `@RabbitListener` methods
- `TestRabbitTemplate` — sends messages directly to listeners (no broker)
- `RabbitTemplate` — standard template (uses broker if available)

```java
@SpringBootTest
@SpringRabbitTest
class MyRabbitTest {
    @Autowired RabbitListenerTestHarness harness;
    @Autowired TestRabbitTemplate testTemplate;   // No-broker template
    @Autowired RabbitTemplate rabbitTemplate;       // Real template
}
```

## RabbitListenerTestHarness API

### getSpy(id) — Get Mockito Spy
```java
// Returns a Mockito spy wrapping the actual listener
MyListener spy = harness.getSpy("listenerId");
// Use standard Mockito verification
verify(spy).handleMessage(any());
```

### getLatchAnswerFor(id, count) — Latch + Real Call
```java
LatchCountDownAndCallRealMethodAnswer answer =
    harness.getLatchAnswerFor("listenerId", 1);

// Send message...

// Wait for listener invocation
boolean invoked = answer.await(10); // seconds
assertThat(invoked).isTrue();
```

### getNextInvocationDataFor(id, timeout, unit) — Capture Arguments
```java
InvocationData data = harness.getNextInvocationDataFor(
    "listenerId", 10, TimeUnit.SECONDS);

assertThat(data).isNotNull();
Object firstArg = data.getArguments()[0];
Object result = data.getResult();     // For @SendTo listeners
Throwable error = data.getThrowable(); // If listener threw
```

## Listener ID Requirement

The harness uses `@RabbitListener(id = "...")` to identify listeners:

```java
@RabbitListener(id = "orderListener", queues = "orders.queue")
public void handleOrder(OrderEvent event) { }
```

**Common mistake**: Omitting `id` — the harness cannot find the listener.

## LatchCountDownAndCallRealMethodAnswer

Combines CountDownLatch with Mockito's `callRealMethod()`:

```java
// Latch for 2 messages
LatchCountDownAndCallRealMethodAnswer answer =
    harness.getLatchAnswerFor("myListener", 2);

// Send 2 messages...

// Wait for both
assertThat(answer.await(10)).isTrue();

// Verify both were processed
verify(harness.getSpy("myListener"), times(2)).handleMessage(any());
```

## @RabbitAvailable — Conditional Execution

Skip tests when no RabbitMQ is available:

```java
@RabbitAvailable(queues = "test.queue")
@SpringBootTest
class ConditionalRabbitTest {
    // Only runs if RabbitMQ is reachable
    // Queue "test.queue" auto-declared
}
```

## TestRabbitTemplate vs RabbitTemplate

| Feature | TestRabbitTemplate | RabbitTemplate |
|---------|-------------------|----------------|
| Requires broker | No | Yes |
| Routes via exchange | No (direct to listener) | Yes |
| Tests routing logic | No | Yes (with Testcontainers) |
| Speed | Instant | Depends on broker |
| Use case | Listener unit testing | Integration testing |

## Pattern: Full Integration with Harness + Testcontainers

```java
@SpringBootTest
@SpringRabbitTest
@Testcontainers
class FullRabbitTest {

    @Container
    @ServiceConnection
    static RabbitMQContainer rabbit = new RabbitMQContainer("rabbitmq:3.13-management");

    @Autowired
    private RabbitListenerTestHarness harness;

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @Test
    void shouldRouteAndProcessMessage() throws Exception {
        LatchCountDownAndCallRealMethodAnswer answer =
            harness.getLatchAnswerFor("orderListener", 1);

        rabbitTemplate.convertAndSend("orders.exchange", "orders.created",
            new OrderEvent("123", "CREATED"));

        assertThat(answer.await(10)).isTrue();
    }
}
```

## Reference
- [Spring AMQP Testing Reference](https://docs.spring.io/spring-amqp/reference/testing.html)
