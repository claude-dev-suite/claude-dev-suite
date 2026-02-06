---
name: google-pubsub
description: |
  Google Cloud Pub/Sub messaging service. Covers topics, subscriptions,
  push/pull delivery, and dead-letter handling. Use for GCP-native
  event-driven architectures and real-time analytics.

  USE WHEN: user mentions "google pub/sub", "pubsub", "gcp messaging", "push subscription", "pull subscription", asks about "cloud pub/sub", "ordering keys", "bigquery subscription"

  DO NOT USE FOR: AWS-native - use `sqs`; Azure-native - use `azure-service-bus`; event streaming - use `kafka` or Dataflow; on-premise - use `rabbitmq` or `activemq`; multi-cloud - use `kafka` or `pulsar`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Google Cloud Pub/Sub Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for Java/Python/Go producer patterns, Spring Cloud GCP consumer, push subscription handlers, and Terraform for DLT, IAM, VPC Service Controls, and monitoring alerts.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `google-pubsub` for comprehensive documentation.

## Quick Start (Emulator)

```yaml
# docker-compose.yml
services:
  pubsub:
    image: gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators
    command: gcloud beta emulators pubsub start --host-port=0.0.0.0:8085
    ports:
      - "8085:8085"
```

```bash
docker-compose up -d

# Set emulator env
export PUBSUB_EMULATOR_HOST=localhost:8085

# Create topic and subscription
gcloud pubsub topics create orders
gcloud pubsub subscriptions create order-processor --topic=orders

# Test
gcloud pubsub topics publish orders --message='{"id":"123"}'
gcloud pubsub subscriptions pull order-processor --auto-ack
```

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Topic** | Named resource for publishing messages |
| **Subscription** | Named resource for receiving messages |
| **Publisher** | Sends messages to topic |
| **Subscriber** | Receives messages from subscription |
| **Ack Deadline** | Time to acknowledge before redelivery |
| **Message Retention** | How long unacked messages are kept |

## Delivery Types

| Type | Description | Use Case |
|------|-------------|----------|
| **Pull** | Subscriber requests messages | Batch processing, variable load |
| **Push** | Pub/Sub sends to endpoint | Serverless, webhooks |
| **BigQuery** | Direct export to BigQuery | Analytics pipelines |
| **Cloud Storage** | Direct export to GCS | Data archival |

## Architecture

```
Publisher ──▶ Topic ──▶ Subscription 1 (Pull) ──▶ Subscriber
                   ──▶ Subscription 2 (Push) ──▶ Cloud Run
                   ──▶ Subscription 3 ──▶ BigQuery
```

## Node.js Producer (@google-cloud/pubsub)

```typescript
import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub({
  projectId: 'my-project',
});

const topic = pubsub.topic('orders');

// Publish single message
const messageId = await topic.publishMessage({
  data: Buffer.from(JSON.stringify(order)),
  attributes: {
    'correlation-id': correlationId,
    'order-type': order.type,
  },
  orderingKey: order.customerId, // For ordered delivery
});

// Batch publishing (automatic batching)
const publishOptions = {
  batching: {
    maxMessages: 100,
    maxMilliseconds: 10,
  },
};
const batchTopic = pubsub.topic('orders', publishOptions);
```

## Node.js Consumer (Pull Subscription)

```typescript
const subscription = pubsub.subscription('order-processor', {
  flowControl: {
    maxMessages: 100,
    maxExtensionMinutes: 10,
  },
  ackDeadline: 30,
});

const messageHandler = async (message) => {
  try {
    const order = JSON.parse(message.data.toString());
    const correlationId = message.attributes['correlation-id'];

    await processOrder(order);
    message.ack();
  } catch (error) {
    console.error('Processing failed:', error);
    message.nack(); // Will be redelivered
  }
};

subscription.on('message', messageHandler);
subscription.on('error', (error) => console.error('Subscription error:', error));

// Graceful shutdown
process.on('SIGTERM', async () => {
  await subscription.close();
});
```

## Dead Letter Topics

```bash
# Create DLT
gcloud pubsub topics create orders-dlq
gcloud pubsub subscriptions create orders-dlq-sub --topic=orders-dlq

# Create subscription with DLT
gcloud pubsub subscriptions create order-processor \
  --topic=orders \
  --dead-letter-topic=orders-dlq \
  --max-delivery-attempts=5
```

## When NOT to Use This Skill

Use alternative messaging solutions when:
- AWS-native architecture - SQS has better AWS integration
- Azure-native architecture - Use Azure Service Bus
- Event streaming with replay - Use Dataflow or Kafka
- On-premise deployment - Use RabbitMQ or ActiveMQ
- Multi-cloud portability - Use Kafka or RabbitMQ
- Complex routing patterns - RabbitMQ provides more flexibility
- JMS compliance required - Use ActiveMQ

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| No dead letter topic | Failed messages lost | Configure DLT for all subscriptions |
| Short ack deadline | Duplicate processing | Set deadline > max processing time |
| No retry policy | Immediate redelivery on failure | Configure exponential backoff |
| Synchronous publish | Poor throughput | Use batching and async publish |
| Pull without flow control | Consumer overwhelmed | Set max_messages limit |
| No message ordering when needed | Out of order processing | Use ordering keys |
| Large message payloads | Higher costs, poor performance | Use Cloud Storage with reference |
| No IAM least privilege | Security risk | Use service accounts with minimal roles |

## Quick Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Messages not received | No subscription or wrong topic | Create subscription, verify topic |
| Duplicate messages | Ack deadline expired | Increase ack deadline or process faster |
| Messages in DLT | Max delivery attempts exceeded | Check processing logic, review DLT |
| Permission denied | Missing IAM roles | Grant Publisher/Subscriber roles |
| Ordering not working | No ordering key or wrong subscription | Set ordering key, enable message ordering |
| High latency | Batching delay or network | Reduce batch delay, check network |
| Push subscription failing | Endpoint down or auth failure | Check endpoint health, verify auth |
| Backlog growing | Slow consumers | Add consumers or optimize processing |

## Production Readiness

### Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| num_undelivered_messages | > 10000 |
| oldest_unacked_message_age | > 3600s |
| num_outstanding_messages | > 10000 |
| dead_letter_message_count | > 0 |
| publish_latencies | p99 > 1s |

### Checklist

- [ ] IAM roles with least privilege
- [ ] Service account per component
- [ ] Dead letter topic configured
- [ ] Retry policy configured
- [ ] Ack deadline appropriate
- [ ] Message retention set
- [ ] Monitoring alerts configured
- [ ] Schema validation (if needed)
- [ ] Message ordering (if needed)
- [ ] VPC Service Controls (if needed)

## Reference Documentation

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `google-pubsub` for comprehensive documentation.

Available topics: `basics`, `producers`, `consumers`, `production`
