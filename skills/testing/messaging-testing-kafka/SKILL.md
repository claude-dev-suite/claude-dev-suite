---
name: messaging-testing-kafka
description: |
  Kafka integration testing with @EmbeddedKafka, Testcontainers, and Mock APIs.
  Covers Java/Spring, Node.js, and Python testing approaches.

  USE WHEN: user mentions "kafka test", "embedded kafka", "@EmbeddedKafka",
  "KafkaContainer", "MockConsumer", "MockProducer", "kafka integration test"

  DO NOT USE FOR: Kafka configuration - use `kafka` skill;
  Spring Kafka usage - use `spring-kafka` skill;
  Generic testcontainers - use `testcontainers` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Kafka Integration Testing

> **Quick References**: See `quick-ref/embedded-kafka.md` for @EmbeddedKafka details, `quick-ref/testcontainers-kafka.md` for Testcontainers patterns.

## Testing Approach Selection

| Approach | Speed | Fidelity | Best For |
|----------|-------|----------|----------|
| **@EmbeddedKafka** | Fast (~2s startup) | High (real broker, in-process) | Spring Boot unit/integration tests |
| **MockConsumer/MockProducer** | Instant | Low (no broker) | Unit testing producer/consumer logic |
| **Testcontainers KafkaContainer** | Slow (~10s startup) | Highest (real Docker broker) | Full integration tests, CI pipelines |

**Decision rule**: Use @EmbeddedKafka for Spring tests by default. Use Testcontainers when you need specific Kafka versions, multi-broker clusters, or non-Spring projects. Use Mocks only for isolated unit tests.

## Java/Spring: @EmbeddedKafka

### Dependencies
```xml
<dependency>
    <groupId>org.springframework.kafka</groupId>
    <artifactId>spring-kafka-test</artifactId>
    <scope>test</scope>
</dependency>
```

### Producer Test
```java
@SpringBootTest
@EmbeddedKafka(partitions = 1, topics = {"orders"})
class OrderProducerTest {

    @Autowired
    private EmbeddedKafkaBroker embeddedKafka;

    @Autowired
    private OrderProducer orderProducer;

    @Test
    void shouldSendOrderEvent() {
        Map<String, Object> consumerProps = KafkaTestUtils.consumerProps(
            "test-group", "true", embeddedKafka);
        consumerProps.put(JsonDeserializer.TRUSTED_PACKAGES, "*");
        DefaultKafkaConsumerFactory<String, OrderEvent> cf =
            new DefaultKafkaConsumerFactory<>(consumerProps);
        Consumer<String, OrderEvent> consumer = cf.createConsumer();
        embeddedKafka.consumeFromAnEmbeddedTopic(consumer, "orders");

        orderProducer.sendOrder(new OrderEvent("123", "CREATED"));

        ConsumerRecord<String, OrderEvent> record =
            KafkaTestUtils.getSingleRecord(consumer, "orders", Duration.ofSeconds(10));
        assertThat(record.value().getOrderId()).isEqualTo("123");
        assertThat(record.value().getStatus()).isEqualTo("CREATED");

        consumer.close();
    }
}
```

### Consumer Test with CountDownLatch
```java
@SpringBootTest
@EmbeddedKafka(partitions = 1, topics = {"orders"})
class OrderConsumerTest {

    @Autowired
    private EmbeddedKafkaBroker embeddedKafka;

    @SpyBean
    private OrderConsumer orderConsumer;

    private CountDownLatch latch = new CountDownLatch(1);

    @BeforeEach
    void setup() {
        doAnswer(invocation -> {
            invocation.callRealMethod();
            latch.countDown();
            return null;
        }).when(orderConsumer).consume(any(), any());
    }

    @Test
    void shouldConsumeOrderEvent() throws Exception {
        Map<String, Object> producerProps = KafkaTestUtils.producerProps(embeddedKafka);
        DefaultKafkaProducerFactory<String, String> pf =
            new DefaultKafkaProducerFactory<>(producerProps);
        KafkaTemplate<String, String> template = new KafkaTemplate<>(pf);

        template.send("orders", "{\"orderId\":\"456\",\"status\":\"CREATED\"}");

        assertThat(latch.await(10, TimeUnit.SECONDS)).isTrue();
        verify(orderConsumer).consume(any(), any());
    }
}
```

### Partition Assignment Wait
```java
// Wait for consumer to be assigned partitions before sending
ContainerTestUtils.waitForAssignment(
    listenerContainer, embeddedKafka.getPartitionsPerTopic());
```

## Java/Spring: MockConsumer/MockProducer

### MockProducer (Unit Testing)
```java
class OrderProducerUnitTest {

    private MockProducer<String, String> mockProducer;
    private KafkaTemplate<String, String> kafkaTemplate;

    @BeforeEach
    void setup() {
        mockProducer = new MockProducer<>(true, new StringSerializer(), new StringSerializer());
        ProducerFactory<String, String> pf = new MockProducerFactory<>(mockProducer);
        kafkaTemplate = new KafkaTemplate<>(pf);
    }

    @Test
    void shouldSendToCorrectTopic() {
        kafkaTemplate.send("orders", "key", "value");

        assertThat(mockProducer.history()).hasSize(1);
        assertThat(mockProducer.history().get(0).topic()).isEqualTo("orders");
        assertThat(mockProducer.history().get(0).key()).isEqualTo("key");
    }
}
```

### MockConsumer (Unit Testing)
```java
class OrderConsumerUnitTest {

    private MockConsumer<String, String> mockConsumer;

    @BeforeEach
    void setup() {
        mockConsumer = new MockConsumer<>(OffsetResetStrategy.EARLIEST);
    }

    @Test
    void shouldProcessRecords() {
        mockConsumer.assign(List.of(new TopicPartition("orders", 0)));
        mockConsumer.updateBeginningOffsets(Map.of(new TopicPartition("orders", 0), 0L));

        mockConsumer.addRecord(new ConsumerRecord<>("orders", 0, 0L, "key", "{\"orderId\":\"1\"}"));

        ConsumerRecords<String, String> records = mockConsumer.poll(Duration.ofMillis(100));
        assertThat(records.count()).isEqualTo(1);
    }
}
```

## Java/Spring: Testcontainers KafkaContainer

### With @ServiceConnection (Spring Boot 3.1+)
```java
@SpringBootTest
@Testcontainers
class KafkaIntegrationTest {

    @Container
    @ServiceConnection
    static KafkaContainer kafka = new KafkaContainer(
        DockerImageName.parse("apache/kafka-native:3.8.0"));

    @Autowired
    private KafkaTemplate<String, OrderEvent> kafkaTemplate;

    @Autowired
    private OrderRepository orderRepository;

    @Test
    void shouldProduceAndConsumeOrder() throws Exception {
        OrderEvent event = new OrderEvent("789", "CREATED");
        kafkaTemplate.send("orders", event.getOrderId(), event).get(10, TimeUnit.SECONDS);

        await().atMost(Duration.ofSeconds(10))
            .untilAsserted(() -> {
                Optional<Order> order = orderRepository.findById("789");
                assertThat(order).isPresent();
                assertThat(order.get().getStatus()).isEqualTo("CREATED");
            });
    }
}
```

### With @DynamicPropertySource (pre-3.1)
```java
@DynamicPropertySource
static void kafkaProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
}
```

### Dependencies
```xml
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>kafka</artifactId>
    <scope>test</scope>
</dependency>
```

## Node.js: kafkajs + Testcontainers

```typescript
import { KafkaContainer } from "@testcontainers/kafka";
import { Kafka } from "kafkajs";

describe("Kafka Integration", () => {
  let container: StartedTestContainer;
  let kafka: Kafka;

  beforeAll(async () => {
    container = await new KafkaContainer("apache/kafka-native:3.8.0").start();
    kafka = new Kafka({ brokers: [container.getBootstrapServers()] });
  }, 60_000);

  afterAll(async () => {
    await container.stop();
  });

  it("should produce and consume messages", async () => {
    const admin = kafka.admin();
    await admin.connect();
    await admin.createTopics({ topics: [{ topic: "test-topic", numPartitions: 1 }] });
    await admin.disconnect();

    const producer = kafka.producer();
    await producer.connect();
    await producer.send({
      topic: "test-topic",
      messages: [{ key: "key1", value: JSON.stringify({ orderId: "123" }) }],
    });
    await producer.disconnect();

    const messages: any[] = [];
    const consumer = kafka.consumer({ groupId: "test-group" });
    await consumer.connect();
    await consumer.subscribe({ topic: "test-topic", fromBeginning: true });
    await consumer.run({
      eachMessage: async ({ message }) => {
        messages.push(JSON.parse(message.value!.toString()));
      },
    });

    await new Promise((r) => setTimeout(r, 2000));
    expect(messages).toHaveLength(1);
    expect(messages[0].orderId).toBe("123");

    await consumer.disconnect();
  });
});
```

## Python: confluent-kafka + Testcontainers

```python
import pytest
from testcontainers.kafka import KafkaContainer
from confluent_kafka import Producer, Consumer

@pytest.fixture(scope="module")
def kafka_container():
    with KafkaContainer("confluentinc/cp-kafka:7.6.0") as kafka:
        yield kafka

@pytest.fixture
def bootstrap_servers(kafka_container):
    return kafka_container.get_bootstrap_server()

def test_produce_and_consume(bootstrap_servers):
    producer = Producer({"bootstrap.servers": bootstrap_servers})
    producer.produce("test-topic", key="key1", value=b'{"orderId": "123"}')
    producer.flush()

    consumer = Consumer({
        "bootstrap.servers": bootstrap_servers,
        "group.id": "test-group",
        "auto.offset.reset": "earliest",
    })
    consumer.subscribe(["test-topic"])

    msg = consumer.poll(timeout=10.0)
    assert msg is not None
    assert msg.error() is None
    assert b"123" in msg.value()
    consumer.close()
```

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Not waiting for partition assignment | Consumer misses messages | Use `ContainerTestUtils.waitForAssignment()` |
| Hardcoded timeouts too short | Flaky tests | Use `await()` with `atMost()` or generous timeouts |
| Shared topic names across tests | Tests interfere | Use unique topic names per test or `@DirtiesContext` |
| Not closing consumers in tests | Resource leaks, port exhaustion | Always close in `@AfterEach` or try-with-resources |
| Using `auto.offset.reset=latest` in tests | Consumer misses messages sent before subscription | Use `earliest` for test consumers |

## Quick Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| "No records found" | Consumer not assigned partitions | Wait for assignment, use `earliest` offset reset |
| EmbeddedKafka port conflict | Multiple test classes sharing broker | Use `@DirtiesContext` or `EmbeddedKafkaHolder` pattern |
| Deserialization errors | Mismatched serializer config | Set `spring.json.trusted.packages` in test properties |
| Testcontainers timeout | Docker not running or slow pull | Check Docker, increase startup timeout |
| Consumer lag in tests | Consumer not started before produce | Start consumer first, then produce |

## Reference Documentation
- [Spring Kafka Testing](https://docs.spring.io/spring-kafka/reference/testing.html)
- [Testcontainers Kafka Module](https://java.testcontainers.org/modules/kafka/)
- [kafkajs Testing](https://kafka.js.org/docs/getting-started)

> **Cross-reference**: For Spring Kafka producer/consumer patterns, see `spring-kafka` skill. For generic Testcontainers patterns, see `testcontainers` skill.
