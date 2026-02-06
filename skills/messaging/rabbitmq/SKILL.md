---
name: rabbitmq
description: |
  RabbitMQ message broker with AMQP protocol. Covers exchanges, queues,
  bindings, and messaging patterns. Use for reliable message delivery
  and complex routing scenarios.

  USE WHEN: user mentions "rabbitmq", "amqp", "exchanges", "routing patterns", "topic exchange", "fanout", asks about "message routing", "work queues", "request/reply", "flexible routing"

  DO NOT USE FOR: high-throughput streaming - use `kafka` or `pulsar`; cloud-native - use `nats`; AWS-native - use `sqs`; JMS required - use `activemq`; simple pub/sub - use `redis-pubsub`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# RabbitMQ Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for producer patterns (Node.js, Java, Python, Go), consumer patterns, security configuration, and high availability setup.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `rabbitmq` for comprehensive documentation.

## Quick Start (Docker)

```yaml
services:
  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"   # AMQP
      - "15672:15672" # Management UI
    environment:
      - RABBITMQ_DEFAULT_USER=admin
      - RABBITMQ_DEFAULT_PASS=admin
```

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Exchange** | Routes messages to queues |
| **Queue** | Buffer that stores messages |
| **Binding** | Rule linking exchange to queue |
| **Routing Key** | Message attribute for routing |

## Architecture

```
Producer ──▶ Exchange ──binding──▶ Queue ──▶ Consumer
                │
                ├── direct   (exact routing key match)
                ├── topic    (pattern matching)
                ├── fanout   (broadcast to all)
                └── headers  (header-based routing)
```

## Exchange Types

| Type | Routing | Use Case |
|------|---------|----------|
| **direct** | Exact key match | Task queues, RPC |
| **topic** | Pattern (*.#) | Event routing |
| **fanout** | Broadcast all | Notifications |
| **headers** | Header match | Complex routing |

```
# Topic exchange patterns
order.*        → matches order.created, order.updated
order.#        → matches order.created, order.item.added
*.created      → matches order.created, user.created
```

## Queue Configuration

| Argument | Description |
|----------|-------------|
| `x-message-ttl` | Message expiration (ms) |
| `x-max-length` | Max queue size |
| `x-dead-letter-exchange` | DLX for rejected messages |
| `x-dead-letter-routing-key` | DLQ routing key |
| `x-queue-type` | classic, quorum, stream |

## When NOT to Use This Skill

- Event streaming with replay - Kafka provides persistent log
- Ultra-high throughput (>100k msg/s) - Kafka or Pulsar scale better
- AWS-native architecture - SQS integrates better
- Lightweight messaging - NATS has simpler operations
- JMS compliance required - ActiveMQ provides JMS API

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| No prefetch limit | Consumer overwhelmed | Set `prefetch` to 10-50 |
| Classic queues in HA | Data loss on node failure | Use quorum queues |
| No DLX configured | Poison messages loop forever | Configure dead letter exchange |
| Automatic acks | Message loss on crash | Use manual acks |
| No publisher confirms | Silent message loss | Enable confirms for critical messages |

## Quick Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Messages piling up | Slow/dead consumer | Check consumer count and processing |
| High memory usage | Too many unacked messages | Reduce prefetch, add consumers |
| Messages not routed | Wrong routing key | Check exchange-queue bindings |
| Duplicate messages | Consumer crashed before ack | Implement idempotent processing |
| Publisher confirms timeout | Broker overloaded | Reduce publish rate |

## Production Checklist

- [ ] TLS/SSL enabled
- [ ] Users with least privilege
- [ ] Virtual hosts for isolation
- [ ] Quorum queues for HA
- [ ] Dead letter exchanges configured
- [ ] Message TTL set
- [ ] Prefetch limits configured
- [ ] Publisher confirms enabled
- [ ] Monitoring dashboards
- [ ] Alerting configured

## Reference Documentation

Available topics: `basics`, `exchanges`, `queues`, `consumers`, `clustering`, `production`
