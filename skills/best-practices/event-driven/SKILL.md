---
name: event-driven
description: |
  Event-driven architecture patterns and best practices. Covers Saga,
  Outbox, CQRS, Event Sourcing, and messaging patterns for distributed systems.

  USE WHEN: user mentions "event-driven", "Saga", "Outbox pattern", "CQRS", "Event Sourcing",
  "distributed transactions", "eventual consistency", "message broker", "event bus",
  asks about "microservices communication", "async patterns", "compensating transactions"

  DO NOT USE FOR: Simple pub/sub - use messaging framework skills (Kafka, RabbitMQ),
  REST APIs - use API design skills,
  Real-time updates - use WebSocket skills,
  Basic async/await - use language-specific skills
allowed-tools: Read, Grep, Glob
---

# Event-Driven Architecture Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for Saga implementations (Node.js, Java), Outbox pattern implementations, Event Sourcing, CQRS, and idempotency patterns.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `event-driven` for comprehensive documentation.

## When NOT to Use This Skill

- **Monolithic applications** - Use simple in-process events
- **Simple CRUD operations** - Use REST APIs or GraphQL
- **Real-time UI updates** - Use WebSockets or SSE
- **Synchronous workflows** - Use traditional transactions

## Architecture Patterns Overview

| Pattern | Purpose | Complexity |
|---------|---------|------------|
| **Pub/Sub** | Decouple producers from consumers | Low |
| **Event Sourcing** | Store state as event sequence | High |
| **CQRS** | Separate read/write models | Medium-High |
| **Saga** | Distributed transactions | High |
| **Outbox** | Reliable event publishing | Medium |

## Saga Pattern

Manages distributed transactions across services without 2PC.

### Choreography Saga
```
┌─────────┐    event    ┌─────────┐    event    ┌─────────┐
│Order Svc│────────────▶│Payment  │────────────▶│Inventory│
└─────────┘             │   Svc   │             │   Svc   │
     ▲                  └─────────┘             └─────────┘
     │    compensate         │    compensate         │
     └───────────────────────┴───────────────────────┘
```

### Orchestration Saga
```
                    ┌─────────────┐
                    │    Saga     │
                    │Orchestrator │
                    └─────────────┘
                    /      |      \
                   ▼       ▼       ▼
            ┌───────┐ ┌───────┐ ┌───────┐
            │Order  │ │Payment│ │Invent.│
            └───────┘ └───────┘ └───────┘
```

## Transactional Outbox Pattern

Ensures reliable event publishing with database transactions.

```
┌────────────────────────────────────────────┐
│            Database Transaction            │
│  ┌──────────────┐    ┌──────────────────┐  │
│  │   Business   │    │   Outbox Table   │  │
│  │    Table     │    │   (messages)     │  │
│  └──────────────┘    └──────────────────┘  │
└────────────────────────────────────────────┘
                             │
                    Polling Relay / CDC
                             │
                    ┌─────────────────┐
                    │  Message Broker │
                    └─────────────────┘
```

### Outbox Table Schema
```sql
CREATE TABLE outbox (
    id UUID PRIMARY KEY,
    aggregate_type VARCHAR(255) NOT NULL,
    aggregate_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## CQRS Architecture

```
        Commands                          Queries
            │                                 │
            ▼                                 ▼
    ┌───────────────┐                ┌───────────────┐
    │ Command Model │                │  Query Model  │
    │   (Write)     │                │   (Read)      │
    └───────────────┘                └───────────────┘
            │                                 ▲
            ▼                                 │
    ┌───────────────┐     Events     ┌───────────────┐
    │  Write Store  │───────────────▶│  Read Store   │
    └───────────────┘                └───────────────┘
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| **Event Soup** | Too many fine-grained events | Design coarse-grained domain events |
| **Missing Idempotency** | Duplicate processing | Add idempotency keys |
| **No Compensation Logic** | Failed saga can't rollback | Implement compensating transactions |
| **No Dead Letter Queue** | Failed events lost | Configure DLQ for error handling |
| **Weak Event Ordering** | Race conditions | Use partitioning or ordered queues |

## Quick Troubleshooting

| Issue | Diagnostic | Solution |
|-------|------------|----------|
| **Lost events** | Check message broker | Implement Outbox pattern |
| **Duplicate processing** | Logs show multiple executions | Add idempotency checks |
| **Saga stuck** | Compensation not triggered | Add timeout handling |
| **Growing DLQ** | Many failed messages | Analyze failures, fix consumers |
| **Slow event processing** | High message lag | Scale consumers, optimize handlers |

## Best Practices

### Message Design
- Include correlation ID for tracing
- Version your events for evolution
- Keep payloads small, reference large data

### Error Handling
- Implement retry with exponential backoff
- Use Dead Letter Queues for failed messages
- Set up alerting on DLQ growth

### Monitoring
- Track message lag
- Monitor consumer group health
- Alert on processing errors
- Trace message flow across services

## Reference Documentation

Available topics: `patterns`, `saga`, `outbox`, `cqrs`
