---
name: spring-kafka
description: |
  Spring for Apache Kafka integration with KafkaTemplate and @KafkaListener.
  Covers producers, consumers, retry topics, DLT, and transactions.

  USE WHEN: user mentions "spring kafka", "KafkaTemplate", "@KafkaListener",
  "kafka producer Spring", "kafka consumer Spring", "retry topic"

  DO NOT USE FOR: raw Kafka - use `kafka` skill,
  RabbitMQ - use `spring-amqp` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Kafka - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `kafka` for comprehensive documentation.

## Dependencies

```xml
<dependency>
    <groupId>org.springframework.kafka</groupId>
    <artifactId>spring-kafka</artifactId>
</dependency>
```

## Configuration

### application.yml
```yaml
spring:
  kafka:
    bootstrap-servers: localhost:9092
    consumer:
      group-id: my-group
      auto-offset-reset: earliest
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer
      properties:
        spring.json.trusted.packages: "com.example.dto"
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
      acks: all
      properties:
        enable.idempotence: true
    listener:
      ack-mode: manual
      concurrency: 3
```

## Producer Pattern

### KafkaTemplate
```java
@Service
@RequiredArgsConstructor
public class OrderProducer {

    private final KafkaTemplate<String, OrderEvent> kafkaTemplate;

    public void sendOrder(OrderEvent event) {
        kafkaTemplate.send("orders", event.getOrderId(), event)
            .whenComplete((result, ex) -> {
                if (ex != null) {
                    log.error("Failed to send order: {}", event.getOrderId(), ex);
                } else {
                    log.info("Order sent: {} to partition {}",
                        event.getOrderId(),
                        result.getRecordMetadata().partition());
                }
            });
    }

    // With headers
    public void sendWithHeaders(OrderEvent event, String correlationId) {
        ProducerRecord<String, OrderEvent> record = new ProducerRecord<>(
            "orders", event.getOrderId(), event);
        record.headers()
            .add("correlation-id", correlationId.getBytes())
            .add("source", "order-service".getBytes());

        kafkaTemplate.send(record);
    }
}
```

### Transactional Producer
```java
@Configuration
public class KafkaConfig {

    @Bean
    public ProducerFactory<String, Object> producerFactory() {
        Map<String, Object> config = new HashMap<>();
        config.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        config.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG, "tx-");
        config.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        return new DefaultKafkaProducerFactory<>(config);
    }

    @Bean
    public KafkaTemplate<String, Object> kafkaTemplate() {
        return new KafkaTemplate<>(producerFactory());
    }

    @Bean
    public KafkaTransactionManager<String, Object> kafkaTransactionManager() {
        return new KafkaTransactionManager<>(producerFactory());
    }
}

@Service
@Transactional("kafkaTransactionManager")
public class TransactionalProducer {

    public void sendMultiple(List<OrderEvent> events) {
        events.forEach(e -> kafkaTemplate.send("orders", e.getId(), e));
    }
}
```

## Consumer Patterns

### Basic @KafkaListener
```java
@Service
@RequiredArgsConstructor
public class OrderConsumer {

    @KafkaListener(topics = "orders", groupId = "order-processor")
    public void consume(
            @Payload OrderEvent event,
            @Header(KafkaHeaders.RECEIVED_KEY) String key,
            @Header(KafkaHeaders.RECEIVED_PARTITION) int partition,
            @Header(KafkaHeaders.OFFSET) long offset,
            Acknowledgment ack) {

        log.info("Received order: {} from partition {} offset {}",
            event.getOrderId(), partition, offset);

        try {
            processOrder(event);
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Failed to process order: {}", event.getOrderId(), e);
            throw e; // Will trigger retry
        }
    }
}
```

### Batch Consumer
```java
@KafkaListener(
    topics = "orders",
    groupId = "batch-processor",
    containerFactory = "batchKafkaListenerContainerFactory"
)
public void consumeBatch(
        List<OrderEvent> events,
        @Header(KafkaHeaders.RECEIVED_PARTITION) List<Integer> partitions,
        Acknowledgment ack) {

    log.info("Received batch of {} orders", events.size());
    processBatch(events);
    ack.acknowledge();
}

@Bean
public ConcurrentKafkaListenerContainerFactory<String, OrderEvent> batchKafkaListenerContainerFactory() {
    ConcurrentKafkaListenerContainerFactory<String, OrderEvent> factory =
        new ConcurrentKafkaListenerContainerFactory<>();
    factory.setConsumerFactory(consumerFactory());
    factory.setBatchListener(true);
    factory.getContainerProperties().setAckMode(AckMode.MANUAL);
    return factory;
}
```

### Class-Level Listener
```java
@KafkaListener(topics = "orders", groupId = "order-handler")
@Service
public class OrderHandler {

    @KafkaHandler
    public void handleCreated(OrderCreatedEvent event) {
        // Handle order created
    }

    @KafkaHandler
    public void handleUpdated(OrderUpdatedEvent event) {
        // Handle order updated
    }

    @KafkaHandler(isDefault = true)
    public void handleDefault(Object event) {
        log.warn("Unknown event type: {}", event.getClass());
    }
}
```

## Retry Topics (Spring Kafka 3.x)

### @RetryableTopic
```java
@RetryableTopic(
    attempts = "3",
    backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000),
    dltStrategy = DltStrategy.FAIL_ON_ERROR,
    autoCreateTopics = "true",
    topicSuffixingStrategy = TopicSuffixingStrategy.SUFFIX_WITH_INDEX_VALUE
)
@KafkaListener(topics = "orders", groupId = "retry-consumer")
public void consumeWithRetry(OrderEvent event, Acknowledgment ack) {
    processOrder(event);
    ack.acknowledge();
}

@DltHandler
public void handleDlt(OrderEvent event,
        @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,
        @Header(KafkaHeaders.EXCEPTION_MESSAGE) String errorMessage) {

    log.error("DLT received: {} from {} - error: {}",
        event.getOrderId(), topic, errorMessage);
    // Store in database for manual review
    failedOrderRepository.save(new FailedOrder(event, errorMessage));
}
```

### Manual Retry Configuration
```java
@Configuration
@EnableKafka
public class KafkaRetryConfig {

    @Bean
    public RetryTopicConfiguration retryTopicConfiguration(KafkaTemplate<String, Object> template) {
        return RetryTopicConfigurationBuilder
            .newInstance()
            .maxAttempts(4)
            .fixedBackOff(3000)
            .includeTopic("orders")
            .doNotAutoCreateRetryTopics()
            .create(template);
    }
}
```

## Error Handling

### Custom Error Handler
```java
@Bean
public DefaultErrorHandler errorHandler(KafkaTemplate<String, Object> template) {
    // Send to DLT after 3 retries
    DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(template,
        (record, ex) -> new TopicPartition(record.topic() + ".DLT", record.partition()));

    DefaultErrorHandler handler = new DefaultErrorHandler(recoverer,
        new FixedBackOff(1000L, 3L));

    // Don't retry for these exceptions
    handler.addNotRetryableExceptions(
        ValidationException.class,
        DeserializationException.class
    );

    return handler;
}

@Bean
public ConcurrentKafkaListenerContainerFactory<String, Object> kafkaListenerContainerFactory() {
    ConcurrentKafkaListenerContainerFactory<String, Object> factory =
        new ConcurrentKafkaListenerContainerFactory<>();
    factory.setConsumerFactory(consumerFactory());
    factory.setCommonErrorHandler(errorHandler(kafkaTemplate()));
    return factory;
}
```

## Testing

### @EmbeddedKafka
```java
@SpringBootTest
@EmbeddedKafka(partitions = 1, topics = {"orders"})
class OrderProducerTest {

    @Autowired
    private EmbeddedKafkaBroker embeddedKafka;

    @Autowired
    private OrderProducer orderProducer;

    @Test
    void shouldSendOrder() throws Exception {
        OrderEvent event = new OrderEvent("123", "CREATED");

        Map<String, Object> consumerProps = KafkaTestUtils.consumerProps(
            "test-group", "true", embeddedKafka);
        ConsumerFactory<String, OrderEvent> cf = new DefaultKafkaConsumerFactory<>(consumerProps);
        Consumer<String, OrderEvent> consumer = cf.createConsumer();
        embeddedKafka.consumeFromAnEmbeddedTopic(consumer, "orders");

        orderProducer.sendOrder(event);

        ConsumerRecord<String, OrderEvent> record = KafkaTestUtils.getSingleRecord(consumer, "orders");
        assertThat(record.value().getOrderId()).isEqualTo("123");
    }
}
```

### Consumer Test with CountDownLatch
```java
@SpringBootTest
@EmbeddedKafka(partitions = 1, topics = {"orders"})
class OrderConsumerTest {

    @SpyBean
    private OrderConsumer orderConsumer;

    @Autowired
    private EmbeddedKafkaBroker embeddedKafka;

    @Test
    void shouldConsumeAndProcessOrder() throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        doAnswer(inv -> { inv.callRealMethod(); latch.countDown(); return null; })
            .when(orderConsumer).consume(any(), any());

        Map<String, Object> props = KafkaTestUtils.producerProps(embeddedKafka);
        KafkaTemplate<String, String> template = new KafkaTemplate<>(
            new DefaultKafkaProducerFactory<>(props));
        template.send("orders", "{\"orderId\":\"456\",\"status\":\"CREATED\"}");

        assertThat(latch.await(10, TimeUnit.SECONDS)).isTrue();
        verify(orderConsumer).consume(any(), any());
    }
}
```

### Testcontainers
```java
@SpringBootTest
@Testcontainers
class OrderIntegrationTest {

    @Container
    @ServiceConnection
    static KafkaContainer kafka = new KafkaContainer(
        DockerImageName.parse("apache/kafka-native:3.8.0"));

    @Autowired
    private KafkaTemplate<String, OrderEvent> kafkaTemplate;

    @Autowired
    private OrderRepository orderRepository;

    @Test
    void shouldProcessOrderEndToEnd() throws Exception {
        kafkaTemplate.send("orders", "key-1",
            new OrderEvent("789", "CREATED")).get(10, TimeUnit.SECONDS);

        await().atMost(Duration.ofSeconds(10))
            .untilAsserted(() -> {
                Optional<Order> order = orderRepository.findById("789");
                assertThat(order).isPresent();
                assertThat(order.get().getStatus()).isEqualTo("CREATED");
            });
    }
}
```

> **Deep dive**: For MockConsumer/MockProducer, @EmbeddedKafka advanced patterns, and Node.js/Python Kafka testing, see the `messaging-testing-kafka` skill.

## Best Practices

| Do | Don't |
|----|-------|
| Use `acks=all` for durability | Use `acks=0` in production |
| Enable idempotence | Ignore duplicate messages |
| Configure DLT for failures | Silently drop failed messages |
| Use manual acknowledgment | Auto-commit without processing |
| Set proper deserializer trust | Trust all packages |

## Production Checklist

- [ ] `acks=all` configured
- [ ] Idempotence enabled
- [ ] Consumer group ID set
- [ ] Manual acknowledgment mode
- [ ] Retry topics configured
- [ ] DLT handler implemented
- [ ] Error handler configured
- [ ] Proper serializers set
- [ ] Trusted packages configured
- [ ] Monitoring metrics exposed

## When NOT to Use This Skill

- **Raw Kafka** - Use `kafka` skill for broker config
- **RabbitMQ** - Use `spring-amqp` instead
- **Simple messaging** - Consider Spring Events
- **Kafka Streams** - May need additional skill

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Auto commit | Message loss | Use manual ack |
| No error handler | Silent failures | Configure error handler |
| No DLT | Lost failed messages | Add dead letter topic |
| Blocking in listener | Consumer lag | Use async processing |
| Wrong deserializer | Errors on consume | Match producer serializer |
| No idempotency | Duplicate processing | Implement idempotent consumer |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Consumer not receiving | Check group.id | Verify consumer group |
| Serialization error | Check value type | Configure correct deserializer |
| Rebalancing often | Check session.timeout | Increase timeout |
| Consumer lag | Check processing time | Optimize or scale consumers |
| Messages in DLT | Check error logs | Fix processing error |

## Reference Documentation
- [Spring Kafka Reference](https://docs.spring.io/spring-kafka/reference/)
- [Spring Boot Kafka Docs](https://docs.spring.io/spring-boot/reference/messaging/kafka.html)
