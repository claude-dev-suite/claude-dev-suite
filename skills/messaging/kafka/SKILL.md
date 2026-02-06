---
name: kafka
description: |
  Apache Kafka event streaming platform. Covers producers, consumers,
  topics, partitions, Kafka Streams, and Connect. Use for high-throughput
  event-driven architectures and real-time data pipelines.

  USE WHEN: user mentions "kafka", "event streaming", "kafka streams", "consumer groups", "topic partitions", asks about "high throughput messaging", "event sourcing", "log aggregation", "real-time pipelines"

  DO NOT USE FOR: simple queues - use `rabbitmq` or `activemq`; cloud-native lightweight - use `nats`; AWS-native - use `sqs`; Azure-native - use `azure-service-bus`; GCP-native - use `google-pubsub`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Apache Kafka Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `kafka` for comprehensive documentation.

## Quick Start (Docker)

```yaml
# docker-compose.yml
services:
  kafka:
    image: bitnami/kafka:latest
    ports:
      - "9092:9092"
    environment:
      - KAFKA_CFG_NODE_ID=0
      - KAFKA_CFG_PROCESS_ROLES=controller,broker
      - KAFKA_CFG_LISTENERS=PLAINTEXT://:9092,CONTROLLER://:9093
      - KAFKA_CFG_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      - KAFKA_CFG_CONTROLLER_QUORUM_VOTERS=0@kafka:9093
      - KAFKA_CFG_CONTROLLER_LISTENER_NAMES=CONTROLLER
```

```bash
# Start
docker-compose up -d

# Create topic
docker exec kafka kafka-topics.sh --create --topic my-topic \
  --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1
```

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Topic** | Named stream of records, append-only log |
| **Partition** | Ordered, immutable sequence within topic |
| **Offset** | Unique ID for record within partition |
| **Consumer Group** | Set of consumers sharing topic consumption |
| **Broker** | Kafka server handling storage and requests |
| **Replication Factor** | Number of partition copies across brokers |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Kafka Cluster                        │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐            │
│  │Broker 0 │    │Broker 1 │    │Broker 2 │            │
│  │ P0(L)   │    │ P0(F)   │    │ P1(L)   │            │
│  │ P1(F)   │    │ P1(F)   │    │ P0(F)   │            │
│  └─────────┘    └─────────┘    └─────────┘            │
└─────────────────────────────────────────────────────────┘
         ▲                              │
         │                              ▼
   ┌──────────┐                  ┌──────────────┐
   │ Producer │                  │Consumer Group│
   └──────────┘                  │  C1  C2  C3  │
                                 └──────────────┘
```

## Producer Patterns

### Node.js (kafkajs)
```typescript
import { Kafka, Partitioners } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'my-app',
  brokers: ['localhost:9092'],
});

const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
  idempotent: true, // Enable exactly-once
});

await producer.connect();

// Send single message
await producer.send({
  topic: 'orders',
  messages: [
    {
      key: orderId,           // Partition key
      value: JSON.stringify(order),
      headers: {
        'correlation-id': correlationId,
        'source': 'order-service',
      },
    },
  ],
});

// Batch send
await producer.sendBatch({
  topicMessages: [
    {
      topic: 'orders',
      messages: orders.map(o => ({
        key: o.id,
        value: JSON.stringify(o),
      })),
    },
  ],
});

await producer.disconnect();
```

### Java (Spring Kafka)
```java
@Configuration
public class KafkaConfig {
    @Bean
    public ProducerFactory<String, String> producerFactory() {
        Map<String, Object> config = new HashMap<>();
        config.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        config.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        config.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        config.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        config.put(ProducerConfig.ACKS_CONFIG, "all");
        return new DefaultKafkaProducerFactory<>(config);
    }

    @Bean
    public KafkaTemplate<String, String> kafkaTemplate() {
        return new KafkaTemplate<>(producerFactory());
    }
}

@Service
public class OrderProducer {
    @Autowired
    private KafkaTemplate<String, String> kafkaTemplate;

    public void sendOrder(Order order) {
        kafkaTemplate.send("orders", order.getId(), objectMapper.writeValueAsString(order))
            .whenComplete((result, ex) -> {
                if (ex != null) {
                    log.error("Failed to send order", ex);
                }
            });
    }
}
```

### Python (confluent-kafka)
```python
from confluent_kafka import Producer
import json

conf = {
    'bootstrap.servers': 'localhost:9092',
    'client.id': 'my-app',
    'acks': 'all',
    'enable.idempotence': True,
}

producer = Producer(conf)

def delivery_callback(err, msg):
    if err:
        print(f'Message delivery failed: {err}')
    else:
        print(f'Message delivered to {msg.topic()}[{msg.partition()}]')

# Send message
producer.produce(
    topic='orders',
    key=order_id.encode('utf-8'),
    value=json.dumps(order).encode('utf-8'),
    callback=delivery_callback,
    headers={'correlation-id': correlation_id}
)

producer.flush()  # Wait for delivery
```

### Go (segmentio/kafka-go)
```go
package main

import (
    "context"
    "encoding/json"
    "github.com/segmentio/kafka-go"
)

func main() {
    writer := &kafka.Writer{
        Addr:         kafka.TCP("localhost:9092"),
        Topic:        "orders",
        Balancer:     &kafka.LeastBytes{},
        RequiredAcks: kafka.RequireAll,
    }

    defer writer.Close()

    order := Order{ID: "123", Amount: 100}
    value, _ := json.Marshal(order)

    err := writer.WriteMessages(context.Background(),
        kafka.Message{
            Key:   []byte(order.ID),
            Value: value,
            Headers: []kafka.Header{
                {Key: "correlation-id", Value: []byte("abc123")},
            },
        },
    )
}
```

## Consumer Patterns

### Node.js (kafkajs)
```typescript
const consumer = kafka.consumer({
  groupId: 'order-processor',
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
});

await consumer.connect();
await consumer.subscribe({ topics: ['orders'], fromBeginning: false });

await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    const order = JSON.parse(message.value.toString());
    const correlationId = message.headers['correlation-id']?.toString();

    try {
      await processOrder(order);
      // Auto-commit on success
    } catch (error) {
      // Handle error - message will be redelivered
      throw error;
    }
  },
});

// Manual commit
await consumer.run({
  autoCommit: false,
  eachBatch: async ({ batch, resolveOffset, commitOffsetsIfNecessary }) => {
    for (const message of batch.messages) {
      await processMessage(message);
      resolveOffset(message.offset);
    }
    await commitOffsetsIfNecessary();
  },
});
```

### Java (Spring Kafka)
```java
@Configuration
@EnableKafka
public class KafkaConsumerConfig {
    @Bean
    public ConsumerFactory<String, String> consumerFactory() {
        Map<String, Object> config = new HashMap<>();
        config.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        config.put(ConsumerConfig.GROUP_ID_CONFIG, "order-processor");
        config.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        config.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        config.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
        return new DefaultKafkaConsumerFactory<>(config);
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, String> kafkaListenerContainerFactory() {
        ConcurrentKafkaListenerContainerFactory<String, String> factory =
            new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory());
        factory.getContainerProperties().setAckMode(AckMode.MANUAL);
        return factory;
    }
}

@Service
public class OrderConsumer {
    @KafkaListener(topics = "orders", groupId = "order-processor")
    public void consume(
            @Payload String message,
            @Header(KafkaHeaders.RECEIVED_KEY) String key,
            @Header("correlation-id") String correlationId,
            Acknowledgment ack) {

        Order order = objectMapper.readValue(message, Order.class);
        processOrder(order);
        ack.acknowledge();  // Manual commit
    }
}
```

### Python (confluent-kafka)
```python
from confluent_kafka import Consumer

conf = {
    'bootstrap.servers': 'localhost:9092',
    'group.id': 'order-processor',
    'auto.offset.reset': 'earliest',
    'enable.auto.commit': False,
}

consumer = Consumer(conf)
consumer.subscribe(['orders'])

try:
    while True:
        msg = consumer.poll(timeout=1.0)
        if msg is None:
            continue
        if msg.error():
            print(f"Consumer error: {msg.error()}")
            continue

        order = json.loads(msg.value().decode('utf-8'))
        process_order(order)
        consumer.commit(msg)  # Manual commit
finally:
    consumer.close()
```

## Topic Configuration

```bash
# Create topic with configuration
kafka-topics.sh --create --topic orders \
  --bootstrap-server localhost:9092 \
  --partitions 12 \
  --replication-factor 3 \
  --config retention.ms=604800000 \
  --config cleanup.policy=delete \
  --config min.insync.replicas=2

# Alter topic config
kafka-configs.sh --alter --topic orders \
  --bootstrap-server localhost:9092 \
  --add-config retention.ms=172800000
```

| Config | Description | Production Value |
|--------|-------------|------------------|
| `partitions` | Parallelism level | 3x consumer instances |
| `replication.factor` | Durability | 3 (minimum) |
| `min.insync.replicas` | Write guarantee | 2 |
| `retention.ms` | Message retention | 7 days (604800000) |
| `cleanup.policy` | delete or compact | Depends on use case |

## When NOT to Use This Skill

Use alternative messaging solutions when:
- Simple request/reply patterns - RabbitMQ or ActiveMQ are better suited
- Low message volume (< 1000 msg/s) - Simpler brokers have less operational overhead
- Strict message ordering across all messages - Use single partition or different broker
- Serverless/managed services preferred - Use cloud-native options (SQS, Pub/Sub, Service Bus)
- JMS compliance required - Use ActiveMQ
- Lightweight microservices - NATS provides simpler operations
- Primarily caching with messaging - Redis Pub/Sub may be sufficient

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Single partition for scale | Limits throughput to one consumer | Use multiple partitions (3x consumer count) |
| No replication factor | Data loss on broker failure | Set `replication.factor >= 3` |
| `acks=1` in production | Messages can be lost | Use `acks=all` with `min.insync.replicas=2` |
| Large messages (>1MB) | Broker memory pressure | Use external storage, send reference |
| Auto-commit offsets | Duplicate/lost messages on crash | Manual commit after processing |
| No consumer group | Can't scale consumers | Always use consumer groups |
| Synchronous send | Poor throughput | Use async with callbacks |
| No dead letter topic | Failed messages lost | Configure DLT for poison messages |
| Topic per message type | Topic explosion | Use fewer topics with message headers |
| No monitoring | Invisible consumer lag | Monitor lag, throughput, errors |

## Quick Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Consumer lag growing | Slow processing or insufficient consumers | Add consumers, optimize processing |
| Messages not arriving | Topic doesn't exist or wrong name | Verify topic with `kafka-topics --list` |
| Duplicate messages | Consumer crash before commit | Implement idempotent processing |
| Out of order messages | Multiple partitions | Use single partition or partition key |
| "Leader not available" | Broker down or partition reassignment | Check broker health, wait for leader election |
| High latency | Network issues or under-replicated | Check `UnderReplicatedPartitions` metric |
| Producer timeout | Broker overload or network | Increase `request.timeout.ms`, check broker load |
| Offset commit failed | Rebalance in progress | Increase `session.timeout.ms` |
| Serialization errors | Schema mismatch | Use schema registry, validate messages |
| Disk full | Retention too long or high volume | Adjust retention, add disk, compact logs |

## Production Readiness

### Security Configuration
```properties
# Server (server.properties)
listeners=SASL_SSL://0.0.0.0:9093
security.inter.broker.protocol=SASL_SSL
sasl.mechanism.inter.broker.protocol=PLAIN
sasl.enabled.mechanisms=PLAIN

ssl.keystore.location=/path/to/keystore.jks
ssl.keystore.password=password
ssl.key.password=password
ssl.truststore.location=/path/to/truststore.jks
ssl.truststore.password=password

# ACLs
authorizer.class.name=kafka.security.authorizer.AclAuthorizer
super.users=User:admin
```

```typescript
// Client with SASL/SSL
const kafka = new Kafka({
  clientId: 'my-app',
  brokers: ['kafka:9093'],
  ssl: {
    rejectUnauthorized: true,
    ca: [fs.readFileSync('/path/to/ca.pem')],
  },
  sasl: {
    mechanism: 'plain',
    username: 'user',
    password: 'password',
  },
});
```

### Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Consumer lag | > 10000 messages |
| Under-replicated partitions | > 0 |
| Request latency p99 | > 100ms |
| Broker disk usage | > 80% |
| Active controller count | != 1 |

### Producer Best Practices
```typescript
const producer = kafka.producer({
  idempotent: true,                    // Exactly-once
  maxInFlightRequests: 5,              // Ordering with idempotence
  retry: {
    retries: 5,
    initialRetryTime: 100,
    maxRetryTime: 30000,
  },
});
```

### Consumer Best Practices
```typescript
const consumer = kafka.consumer({
  groupId: 'order-processor',
  sessionTimeout: 30000,               // Failure detection
  heartbeatInterval: 3000,             // Session keepalive
  maxBytesPerPartition: 1048576,       // 1MB per partition
  retry: {
    retries: 5,
  },
});
```

### Checklist

- [ ] TLS/SSL encryption enabled
- [ ] SASL authentication configured
- [ ] ACLs defined for topics
- [ ] Replication factor >= 3
- [ ] min.insync.replicas = 2
- [ ] Consumer lag monitoring
- [ ] Dead letter topic configured
- [ ] Schema registry for evolution
- [ ] Idempotent producers enabled
- [ ] Proper partition key strategy

## Reference Documentation

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `kafka` for comprehensive documentation.

Available topics: `basics`, `producers`, `consumers`, `streams`, `connect`, `configuration`, `production`
