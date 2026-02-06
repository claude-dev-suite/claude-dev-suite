---
name: azure-service-bus
description: |
  Azure Service Bus enterprise messaging service. Covers queues, topics,
  sessions, and transactions. Use for Azure-native enterprise
  messaging and hybrid cloud scenarios.

  USE WHEN: user mentions "azure service bus", "service bus queues", "service bus topics", "sessions", "azure messaging", asks about "azure queue", "managed identity", "subscription filters"

  DO NOT USE FOR: AWS-native - use `sqs`; GCP-native - use `google-pubsub`; event streaming - use Event Hubs or `kafka`; on-premise - use `rabbitmq` or `activemq`; lightweight - use `nats`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Azure Service Bus Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for Java/Python/C# producer patterns, Java processor consumer, session consumer, and Terraform security/monitoring configurations.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `azure-service-bus` for comprehensive documentation.

## Quick Start (Local Emulator)

```yaml
# docker-compose.yml (Azure Service Bus Emulator - preview)
services:
  servicebus:
    image: mcr.microsoft.com/azure-messaging/servicebus-emulator:latest
    ports:
      - "5672:5672"
    environment:
      - ACCEPT_EULA=Y
      - SQL_SERVER=sqlserver
    depends_on:
      - sqlserver

  sqlserver:
    image: mcr.microsoft.com/mssql/server:2022-latest
    environment:
      - ACCEPT_EULA=Y
      - SA_PASSWORD=YourStrong!Passw0rd
```

```bash
# Azure CLI
az servicebus namespace create --name myservicebus --resource-group mygroup
az servicebus queue create --namespace-name myservicebus --name orders
az servicebus topic create --namespace-name myservicebus --name events
az servicebus topic subscription create --namespace-name myservicebus \
  --topic-name events --name order-processor
```

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Namespace** | Container for messaging entities |
| **Queue** | Point-to-point messaging |
| **Topic** | Publish-subscribe messaging |
| **Subscription** | Topic consumer with filters |
| **Session** | Ordered message processing |
| **Dead-letter** | Failed message destination |

## Tiers Comparison

| Feature | Basic | Standard | Premium |
|---------|-------|----------|---------|
| Queues | Yes | Yes | Yes |
| Topics | No | Yes | Yes |
| Sessions | No | Yes | Yes |
| Transactions | No | Yes | Yes |
| Max message size | 256KB | 256KB | 100MB |
| Throughput | Shared | Shared | Dedicated |

## Producer Pattern (Node.js)

```typescript
import { ServiceBusClient } from '@azure/service-bus';

const client = new ServiceBusClient(connectionString);
const sender = client.createSender('orders');

// Send single message
await sender.sendMessages({
  body: order,
  contentType: 'application/json',
  correlationId: correlationId,
  messageId: order.id,
  applicationProperties: {
    orderType: order.type,
    priority: order.priority,
  },
});

// Send batch
const batch = await sender.createMessageBatch();
for (const order of orders) {
  if (!batch.tryAddMessage({ body: order, messageId: order.id })) {
    await sender.sendMessages(batch);
    batch = await sender.createMessageBatch();
    batch.tryAddMessage({ body: order, messageId: order.id });
  }
}
await sender.sendMessages(batch);

// Schedule message
await sender.scheduleMessages(
  { body: order },
  new Date(Date.now() + 60000) // 1 minute delay
);

// Send to topic
const topicSender = client.createSender('events');
await topicSender.sendMessages({
  body: { type: 'OrderCreated', data: order },
  subject: 'orders',  // For subscription filtering
  correlationId: correlationId,
});

await sender.close();
await client.close();
```

## Consumer Pattern (Node.js)

```typescript
const receiver = client.createReceiver('orders', {
  receiveMode: 'peekLock',
  maxAutoLockRenewalDurationInMs: 300000,
});

// Process messages
const messageHandler = async (message) => {
  try {
    const order = message.body;
    await processOrder(order);
    await receiver.completeMessage(message);
  } catch (error) {
    if (message.deliveryCount >= 3) {
      await receiver.deadLetterMessage(message, {
        deadLetterReason: 'MaxRetriesExceeded',
        deadLetterErrorDescription: error.message,
      });
    } else {
      await receiver.abandonMessage(message);
    }
  }
};

const errorHandler = async (error) => {
  console.error('Error:', error);
};

receiver.subscribe({
  processMessage: messageHandler,
  processError: errorHandler,
});

// Subscription consumer with filter
const subscriptionReceiver = client.createReceiver('events', 'order-processor');

// Session consumer (ordered processing)
const sessionReceiver = await client.acceptSession('orders', 'session-1');
const messages = await sessionReceiver.receiveMessages(10);
for (const msg of messages) {
  await processMessage(msg);
  await sessionReceiver.completeMessage(msg);
}

// Dead letter consumer
const dlqReceiver = client.createReceiver('orders', {
  subQueueType: 'deadLetter',
});
```

## Subscription Filters

```bash
# SQL filter
az servicebus topic subscription rule create \
  --namespace-name myservicebus \
  --topic-name events \
  --subscription-name high-priority \
  --name priority-filter \
  --filter-sql-expression "priority > 5"

# Correlation filter
az servicebus topic subscription rule create \
  --namespace-name myservicebus \
  --topic-name events \
  --subscription-name orders-only \
  --name order-filter \
  --correlation-filter subject=orders
```

```typescript
// Create subscription with filter (SDK)
const adminClient = new ServiceBusAdministrationClient(connectionString);

await adminClient.createSubscription('events', 'high-priority');
await adminClient.createRule('events', 'high-priority', 'priority-filter', {
  filter: {
    sqlExpression: "priority > 5",
  },
});
```

## Production Readiness

### Security Configuration

```typescript
// Managed Identity
import { DefaultAzureCredential } from '@azure/identity';

const client = new ServiceBusClient(
  'myservicebus.servicebus.windows.net',
  new DefaultAzureCredential()
);

// SAS Token
const client = new ServiceBusClient(connectionString);
```

### Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| ActiveMessages | > 10000 |
| DeadletteredMessages | > 0 |
| Size | > 80% of quota |
| ThrottledRequests | > 0 |
| ServerErrors | > 0 |

### Checklist

- [ ] Managed Identity authentication
- [ ] Private endpoints configured
- [ ] Network rules (firewall)
- [ ] Dead-letter queue handling
- [ ] Auto-forwarding for routing
- [ ] Duplicate detection enabled
- [ ] Message TTL configured
- [ ] Sessions for ordering (if needed)
- [ ] Azure Monitor alerts
- [ ] Diagnostic logs enabled

## When NOT to Use This Skill

Use alternative messaging solutions when:
- AWS-native architecture - SQS integrates better
- GCP-native architecture - Use Google Pub/Sub
- Event streaming with replay - Use Azure Event Hubs or Kafka
- On-premise deployment - Use RabbitMQ or ActiveMQ
- Multi-cloud strategy - Use Kafka or RabbitMQ
- Simple pub/sub - Use Redis or NATS
- Ultra-high throughput - Event Hubs or Kafka scale better

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Basic tier in production | No topics, limited features | Use Standard or Premium tier |
| No dead letter queue | Failed messages lost | Enable DLQ on all queues/subscriptions |
| Short lock duration | Duplicate processing | Set lock duration > processing time |
| No auto-delete on idle | Wasted resources and cost | Set auto-delete for temporary queues |
| Connection string everywhere | Security risk | Use Managed Identity |
| No batching | Higher latency and cost | Batch up to 10 messages |
| Peek-lock without complete | Messages expire and reprocess | Always complete or abandon |
| Standard tier for ordering | No sessions available | Use Premium tier for sessions |
| Large message bodies | Higher costs | Use claim check pattern with Blob Storage |
| No monitoring | Invisible issues | Enable Azure Monitor metrics/alerts |

## Quick Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Messages not received | Wrong queue/topic name or permissions | Verify name and check RBAC/SAS |
| Duplicate messages | Lock duration expired | Increase lock duration or process faster |
| Messages in DLQ | Max delivery count exceeded | Check processing logic, review DLQ |
| Access denied | Missing RBAC role or invalid SAS | Assign Sender/Receiver roles |
| Throttling errors | Exceeded tier limits | Upgrade tier or reduce send rate |
| Lock lost exception | Processing time > lock duration | Renew lock or increase duration |
| Session not available | No sessions in queue | Enable sessions on queue creation |
| Filter not working | Wrong SQL filter syntax | Test filter, check message properties |
| Connection errors | Network issues or firewall | Check VNet, private endpoints, firewall |
| High costs | Too many operations | Use batching, optimize polling |

## Reference Documentation

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `azure-service-bus` for comprehensive documentation.

Available topics: `basics`, `producers`, `consumers`, `production`
