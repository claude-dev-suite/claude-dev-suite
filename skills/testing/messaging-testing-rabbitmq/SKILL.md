---
name: messaging-testing-rabbitmq
description: |
  RabbitMQ integration testing with @SpringRabbitTest, RabbitListenerTestHarness,
  TestRabbitTemplate, and Testcontainers. Covers Java/Spring, Node.js, and Python.

  USE WHEN: user mentions "rabbitmq test", "@SpringRabbitTest", "RabbitListenerTestHarness",
  "TestRabbitTemplate", "RabbitMQContainer", "rabbitmq integration test"

  DO NOT USE FOR: RabbitMQ configuration - use `rabbitmq` skill;
  Spring AMQP usage - use `spring-amqp` skill;
  Generic testcontainers - use `testcontainers` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# RabbitMQ Integration Testing

> **Quick References**: See `quick-ref/spring-rabbit-test.md` for @SpringRabbitTest details, `quick-ref/testcontainers-rabbitmq.md` for Testcontainers patterns.

## Testing Approach Selection

| Approach | Speed | Fidelity | Best For |
|----------|-------|----------|----------|
| **@SpringRabbitTest + Harness** | Fast (no broker) | Medium (spy/capture) | Testing listener logic with Spring context |
| **TestRabbitTemplate** | Fast (no broker) | Low (no routing) | Testing send/receive without real broker |
| **Testcontainers RabbitMQContainer** | Slow (~5s startup) | Highest (real broker) | Full integration tests, exchange/queue routing |

**Decision rule**: Use @SpringRabbitTest for unit-testing listeners in Spring context. Use Testcontainers for end-to-end message flow with real routing.

## Java/Spring: @SpringRabbitTest + RabbitListenerTestHarness

### Dependencies
```xml
<dependency>
    <groupId>org.springframework.amqp</groupId>
    <artifactId>spring-rabbit-test</artifactId>
    <scope>test</scope>
</dependency>
```

### Spy Pattern — Verify Listener Called
```java
@SpringBootTest
@SpringRabbitTest
class OrderConsumerSpyTest {

    @Autowired
    private RabbitListenerTestHarness harness;

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @Test
    void shouldInvokeListener() throws Exception {
        OrderConsumer spy = harness.getSpy("orderListener");
        assertThat(spy).isNotNull();

        LatchCountDownAndCallRealMethodAnswer answer =
            harness.getLatchAnswerFor("orderListener", 1);

        rabbitTemplate.convertAndSend("orders.exchange", "orders.created",
            new OrderEvent("123", "CREATED"));

        assertThat(answer.await(10)).isTrue();
        verify(spy).handleOrder(argThat(e -> e.getOrderId().equals("123")));
    }
}
```

### Capture Pattern — Inspect Invocation Data
```java
@SpringBootTest
@SpringRabbitTest
class OrderConsumerCaptureTest {

    @Autowired
    private RabbitListenerTestHarness harness;

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @Test
    void shouldCaptureInvocationData() throws Exception {
        rabbitTemplate.convertAndSend("orders.exchange", "orders.created",
            new OrderEvent("456", "PAID"));

        InvocationData data = harness.getNextInvocationDataFor(
            "orderListener", 10, TimeUnit.SECONDS);

        assertThat(data).isNotNull();
        OrderEvent captured = (OrderEvent) data.getArguments()[0];
        assertThat(captured.getOrderId()).isEqualTo("456");
        assertThat(captured.getStatus()).isEqualTo("PAID");
    }
}
```

### Request-Reply Test
```java
@SpringBootTest
@SpringRabbitTest
class OrderServiceReplyTest {

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @Test
    void shouldReturnOrderResponse() {
        OrderRequest request = new OrderRequest("item-1", 2);

        OrderResponse response = (OrderResponse) rabbitTemplate.convertSendAndReceive(
            "orders.exchange", "orders.create", request);

        assertThat(response).isNotNull();
        assertThat(response.getStatus()).isEqualTo("CREATED");
    }
}
```

## Java/Spring: TestRabbitTemplate

For testing without a running broker:

```java
@SpringBootTest
@SpringRabbitTest
class NoBrokerTest {

    @Autowired
    private TestRabbitTemplate testRabbitTemplate;

    @Test
    void shouldSendWithoutBroker() {
        testRabbitTemplate.convertAndSend("orders.exchange", "orders.created",
            new OrderEvent("789", "CREATED"));

        // TestRabbitTemplate routes directly to @RabbitListener methods
        // Verify side effects (database writes, service calls, etc.)
    }
}
```

## Java/Spring: Testcontainers RabbitMQContainer

### With @ServiceConnection (Spring Boot 3.1+)
```java
@SpringBootTest
@Testcontainers
class RabbitIntegrationTest {

    @Container
    @ServiceConnection
    static RabbitMQContainer rabbit = new RabbitMQContainer("rabbitmq:3.13-management");

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @Autowired
    private OrderRepository orderRepository;

    @Test
    void shouldProduceAndConsumeOrder() {
        rabbitTemplate.convertAndSend("orders.exchange", "orders.created",
            new OrderEvent("123", "CREATED"));

        await().atMost(Duration.ofSeconds(10))
            .untilAsserted(() -> {
                Optional<Order> order = orderRepository.findById("123");
                assertThat(order).isPresent();
                assertThat(order.get().getStatus()).isEqualTo("CREATED");
            });
    }
}
```

### Pre-Provisioned Exchanges and Queues
```java
static RabbitMQContainer rabbit = new RabbitMQContainer("rabbitmq:3.13-management")
    .withExchange("orders.exchange", "direct")
    .withQueue("orders.queue")
    .withBinding("orders.exchange", "orders.queue",
        Map.of(), "orders.created", "queue");
```

### With @DynamicPropertySource (pre-3.1)
```java
@DynamicPropertySource
static void rabbitProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.rabbitmq.host", rabbit::getHost);
    registry.add("spring.rabbitmq.port", rabbit::getAmqpPort);
    registry.add("spring.rabbitmq.username", rabbit::getAdminUsername);
    registry.add("spring.rabbitmq.password", rabbit::getAdminPassword);
}
```

## Node.js: amqplib + Testcontainers

```typescript
import { RabbitMQContainer } from "@testcontainers/rabbitmq";
import amqp from "amqplib";

describe("RabbitMQ Integration", () => {
  let container: StartedTestContainer;
  let connection: amqp.Connection;

  beforeAll(async () => {
    container = await new RabbitMQContainer("rabbitmq:3.13-management").start();
    connection = await amqp.connect(container.getAmqpUrl());
  }, 60_000);

  afterAll(async () => {
    await connection.close();
    await container.stop();
  });

  it("should produce and consume messages", async () => {
    const channel = await connection.createChannel();
    const queue = "test-queue";
    await channel.assertQueue(queue, { durable: false });

    const message = { orderId: "123", status: "CREATED" };
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)));

    const received = await new Promise<any>((resolve) => {
      channel.consume(queue, (msg) => {
        if (msg) resolve(JSON.parse(msg.content.toString()));
      });
    });

    expect(received.orderId).toBe("123");
    await channel.close();
  });
});
```

## Python: pika + Testcontainers

```python
import pytest
import pika
import json
from testcontainers.rabbitmq import RabbitMqContainer

@pytest.fixture(scope="module")
def rabbitmq():
    with RabbitMqContainer("rabbitmq:3.13-management") as container:
        yield container

def test_produce_and_consume(rabbitmq):
    params = pika.ConnectionParameters(
        host=rabbitmq.get_container_host_ip(),
        port=rabbitmq.get_exposed_port(5672),
        credentials=pika.PlainCredentials("guest", "guest"),
    )
    connection = pika.BlockingConnection(params)
    channel = connection.channel()
    channel.queue_declare(queue="test-queue")

    message = {"orderId": "123", "status": "CREATED"}
    channel.basic_publish(exchange="", routing_key="test-queue",
                          body=json.dumps(message))

    method, props, body = channel.basic_get(queue="test-queue", auto_ack=True)
    assert method is not None
    assert json.loads(body)["orderId"] == "123"

    connection.close()
```

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Not using `@SpringRabbitTest` | Manual harness setup | Annotation auto-configures harness and template |
| Ignoring `InvocationData` timeout | Flaky or hanging tests | Always pass timeout to `getNextInvocationDataFor()` |
| Hardcoded exchange/queue names in tests | Coupling to production config | Use constants or test-specific names |
| No `await()` for async consumers | Assertions run before consumption | Use Awaitility or CountDownLatch |
| Starting broker per test method | Extremely slow | Use static container shared across tests |

## Quick Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| Harness returns null spy | Listener ID mismatch | Verify `@RabbitListener(id = "...")` matches harness call |
| "No queue bound" error | Exchange/queue not declared | Use `@QueueBinding` or pre-provision in container |
| Message not received | Wrong routing key | Verify exchange type and binding key match |
| Connection refused in tests | Container not ready | Use `@ServiceConnection` or wait for port |
| TestRabbitTemplate silent failure | No listener found | Ensure `@RabbitListener` is in Spring context |

## Reference Documentation
- [Spring AMQP Testing](https://docs.spring.io/spring-amqp/reference/testing.html)
- [Testcontainers RabbitMQ Module](https://java.testcontainers.org/modules/rabbitmq/)

> **Cross-reference**: For Spring AMQP producer/consumer patterns, see `spring-amqp` skill. For generic Testcontainers patterns, see `testcontainers` skill.
