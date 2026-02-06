---
name: pulsar
description: |
  Apache Pulsar cloud-native messaging and streaming. Covers topics,
  subscriptions, Pulsar Functions, and geo-replication. Use for
  multi-tenant, geo-distributed messaging systems.

  USE WHEN: user mentions "pulsar", "bookkeeper", "multi-tenancy", "geo-replication", "pulsar functions", asks about "cloud-native streaming", "tenant isolation", "global messaging"

  DO NOT USE FOR: simple queues - use `rabbitmq` or `sqs`; AWS-native - use `sqs`; Azure-native - use `azure-service-bus`; GCP-native - use `google-pubsub`; lightweight - use `nats`; JMS - use `activemq`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Apache Pulsar Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `pulsar` for comprehensive documentation.

## Quick Start (Docker)

```yaml
# docker-compose.yml
services:
  pulsar:
    image: apachepulsar/pulsar:latest
    ports:
      - "6650:6650"   # Broker
      - "8080:8080"   # Admin API
    command: bin/pulsar standalone
    volumes:
      - pulsar_data:/pulsar/data

volumes:
  pulsar_data:
```

```bash
docker-compose up -d

# Create tenant and namespace
docker exec pulsar bin/pulsar-admin tenants create my-tenant
docker exec pulsar bin/pulsar-admin namespaces create my-tenant/my-namespace

# Test
docker exec pulsar bin/pulsar-client produce persistent://my-tenant/my-namespace/orders -m "test"
docker exec pulsar bin/pulsar-client consume persistent://my-tenant/my-namespace/orders -s "test-sub"
```

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Tenant** | Top-level isolation unit |
| **Namespace** | Administrative unit within tenant |
| **Topic** | Message stream (persistent/non-persistent) |
| **Subscription** | Named cursor with delivery semantics |
| **Partition** | Topic partitioning for parallelism |
| **Bookie** | Storage layer (Apache BookKeeper) |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Pulsar Cluster                          │
│  ┌───────────┐   ┌───────────┐   ┌───────────┐             │
│  │  Broker 1 │   │  Broker 2 │   │  Broker 3 │             │
│  └───────────┘   └───────────┘   └───────────┘             │
│         │               │               │                   │
│  ┌─────────────────────────────────────────────┐           │
│  │            BookKeeper (Bookies)              │           │
│  │  ┌────────┐  ┌────────┐  ┌────────┐        │           │
│  │  │Bookie 1│  │Bookie 2│  │Bookie 3│        │           │
│  │  └────────┘  └────────┘  └────────┘        │           │
│  └─────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

## Subscription Types

| Type | Description | Use Case |
|------|-------------|----------|
| **Exclusive** | Single consumer | Ordered processing |
| **Shared** | Round-robin to consumers | Load balancing |
| **Failover** | Active-standby | High availability |
| **Key_Shared** | Key-based routing | Ordered per key |

## Producer Patterns

### Node.js (pulsar-client)
```typescript
import Pulsar from 'pulsar-client';

const client = new Pulsar.Client({
  serviceUrl: 'pulsar://localhost:6650',
  operationTimeoutSeconds: 30,
});

const producer = await client.createProducer({
  topic: 'persistent://my-tenant/my-namespace/orders',
  sendTimeoutMs: 30000,
  batchingEnabled: true,
  batchingMaxMessages: 1000,
  batchingMaxPublishDelayMs: 10,
});

// Send message
const messageId = await producer.send({
  data: Buffer.from(JSON.stringify(order)),
  properties: {
    'correlation-id': correlationId,
    'order-type': order.type,
  },
  eventTimestamp: Date.now(),
});

console.log(`Sent: ${messageId}`);

// Send with key (for Key_Shared subscription)
await producer.send({
  data: Buffer.from(JSON.stringify(order)),
  partitionKey: order.customerId,
});

await producer.flush();
await producer.close();
await client.close();
```

### Java (pulsar-client)
```java
@Configuration
public class PulsarConfig {
    @Bean
    public PulsarClient pulsarClient() throws PulsarClientException {
        return PulsarClient.builder()
            .serviceUrl("pulsar://localhost:6650")
            .operationTimeout(30, TimeUnit.SECONDS)
            .build();
    }

    @Bean
    public Producer<byte[]> orderProducer(PulsarClient client) throws PulsarClientException {
        return client.newProducer()
            .topic("persistent://my-tenant/my-namespace/orders")
            .batchingMaxMessages(1000)
            .batchingMaxPublishDelay(10, TimeUnit.MILLISECONDS)
            .sendTimeout(30, TimeUnit.SECONDS)
            .create();
    }
}

@Service
public class OrderProducer {
    @Autowired
    private Producer<byte[]> producer;

    public void sendOrder(Order order) throws PulsarClientException {
        MessageId messageId = producer.newMessage()
            .value(objectMapper.writeValueAsBytes(order))
            .property("correlation-id", UUID.randomUUID().toString())
            .property("order-type", order.getType())
            .eventTime(System.currentTimeMillis())
            .key(order.getCustomerId())  // For Key_Shared
            .send();

        log.info("Sent: {}", messageId);
    }

    public CompletableFuture<MessageId> sendOrderAsync(Order order) {
        return producer.newMessage()
            .value(objectMapper.writeValueAsBytes(order))
            .sendAsync();
    }
}
```

### Python (pulsar-client)
```python
import pulsar
import json

client = pulsar.Client('pulsar://localhost:6650')

producer = client.create_producer(
    'persistent://my-tenant/my-namespace/orders',
    batching_enabled=True,
    batching_max_messages=1000,
    batching_max_publish_delay_ms=10
)

# Send message
message_id = producer.send(
    json.dumps(order).encode('utf-8'),
    properties={
        'correlation-id': correlation_id,
        'order-type': order['type']
    },
    partition_key=order['customer_id']
)

print(f"Sent: {message_id}")

producer.flush()
producer.close()
client.close()
```

### Go (pulsar-client-go)
```go
package main

import (
    "context"
    "encoding/json"
    "github.com/apache/pulsar-client-go/pulsar"
)

func main() {
    client, _ := pulsar.NewClient(pulsar.ClientOptions{
        URL:               "pulsar://localhost:6650",
        OperationTimeout:  30 * time.Second,
    })
    defer client.Close()

    producer, _ := client.CreateProducer(pulsar.ProducerOptions{
        Topic:                   "persistent://my-tenant/my-namespace/orders",
        BatchingMaxMessages:     1000,
        BatchingMaxPublishDelay: 10 * time.Millisecond,
    })
    defer producer.Close()

    body, _ := json.Marshal(order)

    msgID, _ := producer.Send(context.Background(), &pulsar.ProducerMessage{
        Payload: body,
        Key:     order.CustomerID,
        Properties: map[string]string{
            "correlation-id": correlationID,
            "order-type":     order.Type,
        },
    })

    log.Printf("Sent: %v", msgID)
}
```

## Consumer Patterns

### Node.js
```typescript
// Exclusive subscription
const consumer = await client.subscribe({
  topic: 'persistent://my-tenant/my-namespace/orders',
  subscription: 'order-processor',
  subscriptionType: 'Exclusive',
  ackTimeoutMs: 30000,
});

while (true) {
  const msg = await consumer.receive();
  try {
    const order = JSON.parse(msg.getData().toString());
    await processOrder(order);
    consumer.acknowledge(msg);
  } catch (error) {
    consumer.negativeAcknowledge(msg);
  }
}

// Shared subscription (load balanced)
const sharedConsumer = await client.subscribe({
  topic: 'persistent://my-tenant/my-namespace/orders',
  subscription: 'order-processors',
  subscriptionType: 'Shared',
  receiverQueueSize: 1000,
});

// Key_Shared subscription (ordered per key)
const keySharedConsumer = await client.subscribe({
  topic: 'persistent://my-tenant/my-namespace/orders',
  subscription: 'order-processors',
  subscriptionType: 'KeyShared',
});

// Dead letter topic
const dlqConsumer = await client.subscribe({
  topic: 'persistent://my-tenant/my-namespace/orders',
  subscription: 'order-processor',
  subscriptionType: 'Shared',
  deadLetterPolicy: {
    maxRedeliverCount: 3,
    deadLetterTopic: 'persistent://my-tenant/my-namespace/orders-dlq',
  },
});
```

### Java
```java
@Service
public class OrderConsumer {
    @Autowired
    private PulsarClient client;

    @PostConstruct
    public void startConsumer() throws PulsarClientException {
        Consumer<byte[]> consumer = client.newConsumer()
            .topic("persistent://my-tenant/my-namespace/orders")
            .subscriptionName("order-processor")
            .subscriptionType(SubscriptionType.Shared)
            .ackTimeout(30, TimeUnit.SECONDS)
            .negativeAckRedeliveryDelay(1, TimeUnit.SECONDS)
            .deadLetterPolicy(DeadLetterPolicy.builder()
                .maxRedeliverCount(3)
                .deadLetterTopic("persistent://my-tenant/my-namespace/orders-dlq")
                .build())
            .subscribe();

        new Thread(() -> {
            while (true) {
                try {
                    Message<byte[]> msg = consumer.receive();
                    Order order = objectMapper.readValue(msg.getData(), Order.class);
                    processOrder(order);
                    consumer.acknowledge(msg);
                } catch (Exception e) {
                    consumer.negativeAcknowledge(msg);
                }
            }
        }).start();
    }
}

// Batch consumer
Consumer<byte[]> batchConsumer = client.newConsumer()
    .topic("persistent://my-tenant/my-namespace/orders")
    .subscriptionName("batch-processor")
    .subscriptionType(SubscriptionType.Shared)
    .batchReceivePolicy(BatchReceivePolicy.builder()
        .maxNumMessages(100)
        .maxNumBytes(1024 * 1024)
        .timeout(100, TimeUnit.MILLISECONDS)
        .build())
    .subscribe();

Messages<byte[]> messages = batchConsumer.batchReceive();
for (Message<byte[]> msg : messages) {
    processMessage(msg);
}
batchConsumer.acknowledge(messages);
```

### Python
```python
consumer = client.subscribe(
    'persistent://my-tenant/my-namespace/orders',
    subscription_name='order-processor',
    consumer_type=pulsar.ConsumerType.Shared,
    dead_letter_policy=pulsar.DeadLetterPolicy(
        max_redeliver_count=3,
        dead_letter_topic='persistent://my-tenant/my-namespace/orders-dlq'
    )
)

while True:
    msg = consumer.receive()
    try:
        order = json.loads(msg.data().decode('utf-8'))
        process_order(order)
        consumer.acknowledge(msg)
    except Exception as e:
        consumer.negative_acknowledge(msg)
```

## Topic Management

```bash
# Partitioned topic
pulsar-admin topics create-partitioned-topic \
  persistent://my-tenant/my-namespace/orders \
  --partitions 12

# Set retention
pulsar-admin namespaces set-retention my-tenant/my-namespace \
  --size 10G --time 7d

# Set TTL
pulsar-admin namespaces set-message-ttl my-tenant/my-namespace \
  --messageTTL 86400

# Compaction (for key-based topics)
pulsar-admin topics compact persistent://my-tenant/my-namespace/orders
```

## When NOT to Use This Skill

Use alternative messaging solutions when:
- Simple request/reply patterns - RabbitMQ or NATS are simpler
- AWS-native architecture - SQS has better AWS integration
- Small-scale deployments - Operational complexity may not be justified
- JMS compliance required - Use ActiveMQ
- Extremely low latency (<1ms) - Use Redis or in-memory solutions
- Single datacenter only - Kafka may be simpler
- Limited operational expertise - Managed services may be better

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Non-persistent topics in production | Message loss on broker restart | Use persistent topics |
| No backlog quotas | Unbounded storage growth | Set retention policies and quotas |
| Shared subscription for ordering | Messages processed out of order | Use Exclusive or Key_Shared |
| No dead letter topic | Failed messages lost | Configure DLT for all subscriptions |
| Large message batching | Memory pressure, high latency | Batch moderately (100-1000 messages) |
| Single bookie ensemble | Data loss on bookie failure | Use ensemble size >= 3 |
| No namespace isolation | Tenant resource contention | Properly configure namespaces and quotas |
| Sync send everywhere | Poor throughput | Use async send with callbacks |
| No monitoring | Invisible backlog and issues | Monitor backlog, throughput, latency |
| Auto-ack without processing | Message loss | Acknowledge only after processing |

## Quick Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Messages not delivered | Subscription not created | Create subscription before consuming |
| Backlog growing | Slow consumers or consumer down | Add consumers or optimize processing |
| High latency | Batching delay or network | Reduce batching delay, check network |
| Out of order messages | Shared subscription | Use Exclusive or Key_Shared |
| Connection timeout | Broker overload or network | Check broker health, network |
| Subscription not found | Wrong topic or subscription name | Verify names with pulsar-admin |
| Publish errors | Topic not found or permissions | Create topic, check ACLs |
| Geo-replication lag | Network issues or high load | Check replication backlog metrics |
| Bookie failures | Disk full or hardware issues | Monitor disk usage, replace bookie |
| Negative ack storm | Processing failures | Fix processing logic, add retry limits |

## Production Readiness

### Security Configuration
```conf
# broker.conf
authenticationEnabled=true
authenticationProviders=org.apache.pulsar.broker.authentication.AuthenticationProviderToken

brokerClientAuthenticationPlugin=org.apache.pulsar.client.impl.auth.AuthenticationToken
brokerClientAuthenticationParameters={"token":"xxx"}

# TLS
tlsEnabled=true
tlsCertificateFilePath=/path/to/broker.cert.pem
tlsKeyFilePath=/path/to/broker.key-pk8.pem
tlsTrustCertsFilePath=/path/to/ca.cert.pem
```

```typescript
const client = new Pulsar.Client({
  serviceUrl: 'pulsar+ssl://pulsar.example.com:6651',
  authentication: new Pulsar.AuthenticationToken({ token: 'xxx' }),
  tlsTrustCertsFilePath: '/path/to/ca.cert.pem',
});
```

### Geo-Replication
```bash
# Enable replication
pulsar-admin namespaces set-clusters my-tenant/my-namespace \
  --clusters cluster-1,cluster-2,cluster-3

# Check replication status
pulsar-admin topics stats persistent://my-tenant/my-namespace/orders
```

### Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Backlog size | > 100000 messages |
| Publish rate | Anomaly detection |
| Subscription lag | > 10000 |
| Message age | > 1 hour |
| Replication lag | > 1000 |

### Checklist

- [ ] TLS enabled
- [ ] Authentication configured
- [ ] Authorization (namespace policies)
- [ ] Partitioned topics for scale
- [ ] Retention policies set
- [ ] Dead letter topics configured
- [ ] Geo-replication (if needed)
- [ ] Backlog quotas set
- [ ] Monitoring dashboards
- [ ] Backup procedures

## Reference Documentation

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `pulsar` for comprehensive documentation.

Available topics: `basics`, `producers`, `consumers`, `production`
