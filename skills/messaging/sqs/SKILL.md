---
name: sqs
description: |
  Amazon SQS managed message queue service. Covers standard and FIFO queues,
  dead-letter queues, and integration patterns. Use for AWS-native
  serverless and microservices architectures.

  USE WHEN: user mentions "sqs", "aws queues", "fifo queue", "lambda trigger", "sns to sqs", asks about "aws messaging", "serverless queues", "standard queue", "visibility timeout"

  DO NOT USE FOR: event streaming - use `kafka` or AWS Kinesis; Azure-native - use `azure-service-bus`; GCP-native - use `google-pubsub`; on-premise - use `rabbitmq` or `activemq`; complex routing - use `rabbitmq`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Amazon SQS Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for Java/Python/Go producers, Spring Cloud AWS consumers, Lambda integration, IAM policies, and CloudWatch monitoring.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `sqs` for comprehensive documentation.

## Quick Start (LocalStack)

```yaml
# docker-compose.yml
services:
  localstack:
    image: localstack/localstack
    ports:
      - "4566:4566"
    environment:
      - SERVICES=sqs
      - DEFAULT_REGION=us-east-1
    volumes:
      - localstack_data:/var/lib/localstack

volumes:
  localstack_data:
```

```bash
# Create queue
aws --endpoint-url=http://localhost:4566 sqs create-queue \
  --queue-name orders-queue

# Create FIFO queue
aws --endpoint-url=http://localhost:4566 sqs create-queue \
  --queue-name orders-queue.fifo \
  --attributes FifoQueue=true,ContentBasedDeduplication=true
```

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Standard Queue** | At-least-once, best-effort ordering |
| **FIFO Queue** | Exactly-once, strict ordering |
| **Visibility Timeout** | Message lock period |
| **Dead Letter Queue** | Failed message destination |
| **Long Polling** | Efficient message retrieval |
| **Message Groups** | FIFO ordering within group |

## Queue Types Comparison

| Feature | Standard | FIFO |
|---------|----------|------|
| Throughput | Unlimited | 300 msg/s (3000 with batching) |
| Ordering | Best-effort | Strict (per group) |
| Delivery | At-least-once | Exactly-once |
| Deduplication | None | 5-minute window |

## Producer Pattern (Node.js)

```typescript
import { SQSClient, SendMessageCommand, SendMessageBatchCommand } from '@aws-sdk/client-sqs';

const client = new SQSClient({
  region: 'us-east-1',
  // For LocalStack: endpoint: 'http://localhost:4566',
});

const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/orders-queue';

// Send single message
await client.send(new SendMessageCommand({
  QueueUrl: queueUrl,
  MessageBody: JSON.stringify(order),
  MessageAttributes: {
    'OrderType': {
      DataType: 'String',
      StringValue: order.type,
    },
    'CorrelationId': {
      DataType: 'String',
      StringValue: correlationId,
    },
  },
  DelaySeconds: 0,
}));

// Send batch (up to 10)
await client.send(new SendMessageBatchCommand({
  QueueUrl: queueUrl,
  Entries: orders.map((order, index) => ({
    Id: `msg-${index}`,
    MessageBody: JSON.stringify(order),
    MessageAttributes: {
      'OrderType': { DataType: 'String', StringValue: order.type },
    },
  })),
}));

// FIFO queue
const fifoQueueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/orders-queue.fifo';

await client.send(new SendMessageCommand({
  QueueUrl: fifoQueueUrl,
  MessageBody: JSON.stringify(order),
  MessageGroupId: order.customerId,      // Required for FIFO
  MessageDeduplicationId: order.orderId, // Or use ContentBasedDeduplication
}));
```

## Consumer Pattern (Node.js)

```typescript
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';

const client = new SQSClient({ region: 'us-east-1' });

async function pollMessages() {
  while (true) {
    const response = await client.send(new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20,           // Long polling
      VisibilityTimeout: 30,
      MessageAttributeNames: ['All'],
      AttributeNames: ['All'],
    }));

    if (!response.Messages) continue;

    for (const message of response.Messages) {
      try {
        const order = JSON.parse(message.Body!);
        await processOrder(order);

        // Delete on success
        await client.send(new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: message.ReceiptHandle!,
        }));
      } catch (error) {
        // Message will return to queue after visibility timeout
        console.error('Processing failed:', error);
      }
    }
  }
}
```

## Dead Letter Queue

```typescript
// Create DLQ
await client.send(new CreateQueueCommand({
  QueueName: 'orders-dlq',
}));

// Main queue with DLQ
await client.send(new CreateQueueCommand({
  QueueName: 'orders-queue',
  Attributes: {
    RedrivePolicy: JSON.stringify({
      deadLetterTargetArn: 'arn:aws:sqs:us-east-1:123456789:orders-dlq',
      maxReceiveCount: '3',
    }),
    VisibilityTimeout: '30',
    MessageRetentionPeriod: '1209600', // 14 days
  },
}));
```

```hcl
# Terraform
resource "aws_sqs_queue" "orders_dlq" {
  name = "orders-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "orders" {
  name = "orders-queue"
  visibility_timeout_seconds = 30
  message_retention_seconds = 1209600

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.orders_dlq.arn
    maxReceiveCount     = 3
  })
}
```

## Lambda Integration

```typescript
// Lambda handler
export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const order = JSON.parse(record.body);
      await processOrder(order);
    } catch (error) {
      // Report partial batch failure
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
```

```yaml
# serverless.yml
functions:
  orderProcessor:
    handler: handler.handler
    events:
      - sqs:
          arn: !GetAtt OrdersQueue.Arn
          batchSize: 10
          functionResponseType: ReportBatchItemFailures
```

## When NOT to Use This Skill

Use alternative messaging solutions when:
- Event streaming with replay - Use Kinesis or Kafka
- Cross-cloud or hybrid cloud - Use Kafka, RabbitMQ, or Pulsar
- Complex routing patterns - RabbitMQ provides better routing
- Message ordering across all messages - FIFO queues have throughput limits
- Real-time low latency (<10ms) - Use Redis or NATS
- On-premise deployment - Use RabbitMQ or ActiveMQ
- Message size >256KB - Use S3 with SQS Extended Client

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Short polling (WaitTime=0) | Wasteful API calls, higher cost | Use long polling (WaitTimeSeconds=20) |
| No DLQ configured | Failed messages lost | Always configure dead letter queue |
| Visibility timeout too short | Duplicate processing | Set timeout > max processing time |
| Visibility timeout too long | Slow failure recovery | Balance with processing time |
| Processing before delete | Message reprocessed on crash | Delete only after successful processing |
| FIFO for high throughput | Limited to 300 msg/s | Use Standard queue if ordering not critical |
| No batching | Higher latency and cost | Batch up to 10 messages per request |
| Polling in Lambda | Wasted invocations | Use Lambda event source mapping |
| No IAM policies | Security risk | Apply least privilege IAM policies |

## Quick Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Messages not appearing | Wrong queue URL or permissions | Verify URL and IAM permissions |
| Duplicate messages | Standard queue behavior or visibility timeout | Implement idempotent processing |
| Messages delayed | Delay seconds set or queue backlog | Check DelaySeconds, scale consumers |
| Messages in DLQ | Max receives exceeded | Check processing logic, increase retries |
| Visibility timeout errors | Message processing too slow | Extend visibility timeout |
| Throughput limited | FIFO queue limit | Use Standard queue or batch messages |
| High costs | Short polling or frequent sends | Use long polling, batch operations |
| Access denied | Missing IAM permissions | Add sqs:SendMessage/ReceiveMessage |
| Message size limit | Payload >256KB | Use SQS Extended Client with S3 |

## Production Checklist

- [ ] IAM policies with least privilege
- [ ] Server-side encryption enabled
- [ ] Dead letter queue configured
- [ ] Visibility timeout set appropriately
- [ ] Long polling enabled (20s)
- [ ] Message retention configured
- [ ] CloudWatch alarms set up
- [ ] DLQ monitoring alerts
- [ ] VPC endpoints (if needed)
- [ ] Access logging enabled

## Key Metrics to Monitor

| Metric | Alert Threshold |
|--------|-----------------|
| ApproximateNumberOfMessagesVisible | > 10000 |
| ApproximateAgeOfOldestMessage | > 3600s |
| NumberOfMessagesReceived | Anomaly |
| NumberOfMessagesSent | Anomaly |
| ApproximateNumberOfMessagesNotVisible | > expected |

## Reference Documentation

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `sqs` for comprehensive documentation.

Available topics: `basics`, `producers`, `consumers`, `dlq`, `production`
