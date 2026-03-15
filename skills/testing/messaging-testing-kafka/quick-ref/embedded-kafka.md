# @EmbeddedKafka Quick Reference

## Annotation Parameters

```java
@EmbeddedKafka(
    count = 1,                          // Number of brokers
    partitions = 1,                     // Partitions per topic
    topics = {"orders", "payments"},    // Auto-created topics
    bootstrapServersProperty = "spring.kafka.bootstrap-servers", // Property to override
    ports = {0},                        // 0 = random port (recommended)
    kraft = true                        // Use KRaft mode (default since 3.x)
)
```

## EmbeddedKafkaBroker Programmatic Setup

```java
@BeforeAll
static void setup() {
    EmbeddedKafkaBroker broker = new EmbeddedKafkaBroker(1, true, 1, "orders")
        .kafkaPorts(0)
        .brokerProperty(KafkaConfig.LogDirProp(), "/tmp/kafka-test");
    broker.afterPropertiesSet();
}
```

## KafkaTestUtils API

```java
// Consumer properties for testing
Map<String, Object> consumerProps = KafkaTestUtils.consumerProps("group", "true", broker);

// Producer properties for testing
Map<String, Object> producerProps = KafkaTestUtils.producerProps(broker);

// Get single record (blocks until available or timeout)
ConsumerRecord<K, V> record = KafkaTestUtils.getSingleRecord(consumer, "topic");
ConsumerRecord<K, V> record = KafkaTestUtils.getSingleRecord(consumer, "topic", Duration.ofSeconds(10));

// Get all records from topic
ConsumerRecords<K, V> records = KafkaTestUtils.getRecords(consumer);
ConsumerRecords<K, V> records = KafkaTestUtils.getRecords(consumer, Duration.ofSeconds(10));

// Get end offsets
Map<TopicPartition, Long> endOffsets = KafkaTestUtils.getEndOffsets(consumer, "topic", partitions);
```

## Shared Broker Pattern (EmbeddedKafkaHolder)

Reuse a single broker across multiple test classes for speed:

```java
public final class EmbeddedKafkaHolder {
    private static final EmbeddedKafkaBroker BROKER = new EmbeddedKafkaBroker(1, true, 1);

    static {
        BROKER.afterPropertiesSet();
        System.setProperty("spring.kafka.bootstrap-servers", BROKER.getBrokersAsString());
    }

    public static EmbeddedKafkaBroker getBroker() {
        return BROKER;
    }

    private EmbeddedKafkaHolder() {}
}
```

Usage:
```java
@SpringBootTest
class FastKafkaTest {

    private static final EmbeddedKafkaBroker broker = EmbeddedKafkaHolder.getBroker();

    @Test
    void shouldWork() {
        // Tests share the same broker — much faster
    }
}
```

## @DirtiesContext Considerations

| Scenario | @DirtiesContext Needed? |
|----------|----------------------|
| Tests use unique topic names | No |
| Tests share topic names, order matters | Yes — `@DirtiesContext(classMode = AFTER_CLASS)` |
| Using `EmbeddedKafkaHolder` (shared) | No — topics must be unique |
| Consumer group state leaks between tests | Yes — or use unique group IDs |

## ContainerTestUtils

```java
// Wait for consumer container to be assigned all partitions
ContainerTestUtils.waitForAssignment(
    kafkaListenerEndpointRegistry.getListenerContainer("myListener"),
    embeddedKafka.getPartitionsPerTopic()
);
```

## Test Properties Configuration

```java
@SpringBootTest
@EmbeddedKafka
@TestPropertySource(properties = {
    "spring.kafka.consumer.auto-offset-reset=earliest",
    "spring.kafka.consumer.group-id=test-group",
    "spring.json.trusted.packages=*"
})
class KafkaTest { }
```

## KafkaConditions (AssertJ)

```java
import org.springframework.kafka.test.condition.KafkaConditions;

// Assert on key
assertThat(record).has(KafkaConditions.key("expected-key"));

// Assert on partition
assertThat(record).has(KafkaConditions.partition(0));

// Assert on timestamp
assertThat(record).has(KafkaConditions.timestamp(TimestampType.CREATE_TIME));
```

## Reference
- [Spring Kafka Testing Docs](https://docs.spring.io/spring-kafka/reference/testing.html)
