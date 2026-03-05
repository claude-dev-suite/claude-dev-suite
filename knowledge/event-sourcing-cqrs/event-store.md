# Event Store Design

## Overview

An event store is the persistence backbone of an event-sourced system. It records every state change as an immutable, append-only event. Unlike traditional databases that overwrite rows in place, an event store preserves the full history of every aggregate, enabling complete audit trails, temporal queries, and deterministic state reconstruction.

The two foundational invariants of an event store are:

1. **Append-only** -- events are never updated or deleted.
2. **Stream-per-aggregate** -- each aggregate instance owns an ordered stream identified by its aggregate ID.

---

## Event Schema

Every event stored must carry enough context to be self-describing, replayable, and traceable.

### Canonical Fields

| Field | Type | Purpose |
|-------|------|---------|
| `eventId` | UUID | Globally unique identifier for this event |
| `eventType` | string | Discriminator (e.g., `OrderPlaced`, `ItemAdded`) |
| `aggregateType` | string | The aggregate kind (`Order`, `Account`) |
| `aggregateId` | UUID/string | The specific aggregate instance |
| `version` | integer | Sequential position within the aggregate stream |
| `payload` | JSON | Domain-specific event data |
| `metadata` | JSON | Correlation ID, causation ID, user ID, trace ID |
| `timestamp` | ISO-8601 | When the event was created |

### TypeScript Event Interface

```typescript
interface DomainEvent<T = Record<string, unknown>> {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  version: number;
  payload: T;
  metadata: EventMetadata;
  timestamp: string;
}

interface EventMetadata {
  correlationId: string;
  causationId: string;
  userId?: string;
  traceId?: string;
}
```

### Java Event Record

```java
public record StoredEvent(
    UUID eventId,
    String eventType,
    String aggregateType,
    UUID aggregateId,
    long version,
    String payload,       // serialized JSON
    String metadata,      // serialized JSON
    Instant timestamp
) {}
```

---

## Storage Options

### EventStoreDB

EventStoreDB is purpose-built for event sourcing. Streams are first-class citizens, subscriptions are native, and projections run server-side.

```typescript
import {
  EventStoreDBClient,
  jsonEvent,
  FORWARDS,
  START,
  ExpectedRevision,
} from '@eventstore/db-client';

const client = EventStoreDBClient.connectionString(
  'esdb://localhost:2113?tls=false'
);

// Append an event with optimistic concurrency
async function appendToStream(
  streamName: string,
  expectedRevision: ExpectedRevision,
  event: DomainEvent
): Promise<void> {
  const esEvent = jsonEvent({
    type: event.eventType,
    data: event.payload,
    metadata: event.metadata,
  });

  await client.appendToStream(streamName, esEvent, {
    expectedRevision,
  });
}

// Read full stream for aggregate rehydration
async function readStream(streamName: string): Promise<DomainEvent[]> {
  const events: DomainEvent[] = [];
  const result = client.readStream(streamName, {
    direction: FORWARDS,
    fromRevision: START,
  });

  for await (const resolved of result) {
    const recorded = resolved.event!;
    events.push({
      eventId: recorded.id,
      eventType: recorded.type,
      aggregateType: streamName.split('-')[0],
      aggregateId: streamName.split('-')[1],
      version: Number(recorded.revision),
      payload: recorded.data as Record<string, unknown>,
      metadata: recorded.metadata as EventMetadata,
      timestamp: recorded.created!.toISOString(),
    });
  }
  return events;
}
```

### PostgreSQL as Event Store

PostgreSQL is the most common relational choice. A single `events` table with a composite unique constraint on `(aggregate_id, version)` enforces ordering and concurrency.

```sql
CREATE TABLE events (
    event_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type      VARCHAR(255) NOT NULL,
    aggregate_type  VARCHAR(255) NOT NULL,
    aggregate_id    UUID NOT NULL,
    version         BIGINT NOT NULL,
    payload         JSONB NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (aggregate_id, version)
);

CREATE INDEX idx_events_aggregate ON events (aggregate_id, version);
CREATE INDEX idx_events_type ON events (event_type);
CREATE INDEX idx_events_timestamp ON events (timestamp);
```

#### Java Repository (Spring Boot + JDBC)

```java
@Repository
public class PostgresEventStore implements EventStore {

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public PostgresEventStore(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    @Override
    @Transactional
    public void append(UUID aggregateId, long expectedVersion,
                       List<StoredEvent> newEvents) {
        // Optimistic concurrency check
        Long currentVersion = jdbc.queryForObject(
            "SELECT COALESCE(MAX(version), 0) FROM events WHERE aggregate_id = ?",
            Long.class, aggregateId
        );
        if (currentVersion != expectedVersion) {
            throw new OptimisticConcurrencyException(
                "Expected version %d but found %d for aggregate %s"
                    .formatted(expectedVersion, currentVersion, aggregateId)
            );
        }

        for (StoredEvent event : newEvents) {
            jdbc.update("""
                INSERT INTO events
                    (event_id, event_type, aggregate_type, aggregate_id,
                     version, payload, metadata, timestamp)
                VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?)
                """,
                event.eventId(), event.eventType(), event.aggregateType(),
                aggregateId, event.version(),
                event.payload(), event.metadata(), event.timestamp()
            );
        }
    }

    @Override
    public List<StoredEvent> loadStream(UUID aggregateId) {
        return jdbc.query(
            "SELECT * FROM events WHERE aggregate_id = ? ORDER BY version",
            this::mapRow, aggregateId
        );
    }

    @Override
    public List<StoredEvent> loadStreamFrom(UUID aggregateId, long fromVersion) {
        return jdbc.query(
            "SELECT * FROM events WHERE aggregate_id = ? AND version > ? ORDER BY version",
            this::mapRow, aggregateId, fromVersion
        );
    }

    private StoredEvent mapRow(ResultSet rs, int rowNum) throws SQLException {
        return new StoredEvent(
            rs.getObject("event_id", UUID.class),
            rs.getString("event_type"),
            rs.getString("aggregate_type"),
            rs.getObject("aggregate_id", UUID.class),
            rs.getLong("version"),
            rs.getString("payload"),
            rs.getString("metadata"),
            rs.getTimestamp("timestamp").toInstant()
        );
    }
}
```

#### TypeScript Repository (Node.js + pg)

```typescript
import { Pool } from 'pg';

export class PostgresEventStore {
  constructor(private pool: Pool) {}

  async append(
    aggregateId: string,
    expectedVersion: number,
    events: DomainEvent[]
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        'SELECT COALESCE(MAX(version), 0) AS current_version FROM events WHERE aggregate_id = $1',
        [aggregateId]
      );

      const currentVersion = parseInt(rows[0].current_version, 10);
      if (currentVersion !== expectedVersion) {
        throw new ConcurrencyError(
          `Expected version ${expectedVersion}, found ${currentVersion}`
        );
      }

      for (const event of events) {
        await client.query(
          `INSERT INTO events
             (event_id, event_type, aggregate_type, aggregate_id,
              version, payload, metadata, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            event.eventId, event.eventType, event.aggregateType,
            event.aggregateId, event.version,
            JSON.stringify(event.payload),
            JSON.stringify(event.metadata),
            event.timestamp,
          ]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async loadStream(aggregateId: string): Promise<DomainEvent[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM events WHERE aggregate_id = $1 ORDER BY version',
      [aggregateId]
    );
    return rows.map(this.toDomainEvent);
  }

  private toDomainEvent(row: any): DomainEvent {
    return {
      eventId: row.event_id,
      eventType: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      version: row.version,
      payload: row.payload,
      metadata: row.metadata,
      timestamp: row.timestamp.toISOString(),
    };
  }
}
```

### DynamoDB as Event Store

DynamoDB works well for high-throughput, serverless event stores. Use the aggregate ID as the partition key and version as the sort key. Conditional writes provide optimistic concurrency.

```typescript
import { DynamoDBClient, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const TABLE_NAME = 'EventStore';

export class DynamoEventStore {
  constructor(private dynamo: DynamoDBClient) {}

  async append(event: DomainEvent): Promise<void> {
    await this.dynamo.send(new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall({
        pk: `${event.aggregateType}#${event.aggregateId}`,
        sk: event.version,
        eventId: event.eventId,
        eventType: event.eventType,
        payload: event.payload,
        metadata: event.metadata,
        timestamp: event.timestamp,
      }),
      ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
    }));
  }

  async loadStream(aggregateType: string, aggregateId: string): Promise<DomainEvent[]> {
    const result = await this.dynamo.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: marshall({ ':pk': `${aggregateType}#${aggregateId}` }),
      ScanIndexForward: true,
    }));
    return (result.Items ?? []).map(item => {
      const record = unmarshall(item);
      return {
        eventId: record.eventId,
        eventType: record.eventType,
        aggregateType,
        aggregateId,
        version: record.sk,
        payload: record.payload,
        metadata: record.metadata,
        timestamp: record.timestamp,
      };
    });
  }
}
```

---

## Optimistic Concurrency

Optimistic concurrency prevents two concurrent command handlers from appending conflicting events to the same aggregate stream. The caller provides the `expectedVersion` (the version of the last event it read). The store rejects the write if the actual current version differs.

**Why it matters:** Without this, two simultaneous "withdraw" commands on the same bank account could both succeed even if only one should, because each reads the same balance and appends independently.

### Conflict Resolution Strategies

1. **Retry with merge** -- Re-read the stream, re-apply the command against the new state, and retry. Suitable when the conflicting events are independent.
2. **Fail fast** -- Return an error to the caller. Suitable for user-facing commands where a retry prompt is acceptable.
3. **Semantic conflict detection** -- Inspect the conflicting events. If they touch different fields (e.g., one changes shipping address, the other changes payment), merge automatically.

---

## Event Serialization and Deserialization

### Upcasting (Schema Evolution)

Events are immutable, but their schemas evolve. Upcasters transform old event shapes into the current shape at read time without altering stored data.

```typescript
type Upcaster = (event: DomainEvent) => DomainEvent;

const upcasters: Map<string, Upcaster[]> = new Map([
  ['OrderPlaced', [
    // v1 -> v2: added `currency` field
    (event) => {
      if (!event.payload.currency) {
        return { ...event, payload: { ...event.payload, currency: 'USD' } };
      }
      return event;
    },
    // v2 -> v3: renamed `customerName` to `customer.name`
    (event) => {
      if (event.payload.customerName) {
        const { customerName, ...rest } = event.payload;
        return {
          ...event,
          payload: { ...rest, customer: { name: customerName } },
        };
      }
      return event;
    },
  ]],
]);

function upcast(event: DomainEvent): DomainEvent {
  const chain = upcasters.get(event.eventType) ?? [];
  return chain.reduce((e, fn) => fn(e), event);
}
```

```java
public interface Upcaster {
    String eventType();
    JsonNode upcast(JsonNode payload);
}

public class OrderPlacedV1ToV2 implements Upcaster {
    @Override public String eventType() { return "OrderPlaced"; }

    @Override
    public JsonNode upcast(JsonNode payload) {
        if (!payload.has("currency")) {
            ((ObjectNode) payload).put("currency", "USD");
        }
        return payload;
    }
}
```

---

## Anti-Patterns

1. **Mutable events** -- Updating or deleting events violates the append-only invariant and destroys the audit trail. If you need to correct data, emit a compensating event.
2. **Fat events** -- Storing the entire aggregate state in each event instead of the delta. This bloats storage and makes projections brittle.
3. **Global stream without partitioning** -- A single flat table with no aggregate stream concept makes concurrency control impossible and reads expensive.
4. **Missing metadata** -- Omitting correlation and causation IDs makes it impossible to trace a chain of events across aggregates and services.
5. **Skipping concurrency checks** -- Appending without expected-version validation leads to silent data corruption under concurrent writes.
6. **Tight coupling to event payload shape** -- Deserializing directly into domain objects without an upcasting layer causes breakage when schemas evolve.

---

## Production Checklist

- [ ] Events table has a unique constraint on `(aggregate_id, version)`.
- [ ] All writes use optimistic concurrency with expected version.
- [ ] Events carry `correlationId` and `causationId` in metadata.
- [ ] An upcasting pipeline handles schema evolution at read time.
- [ ] Event payloads use a stable serialization format (JSON with explicit field names, not positional).
- [ ] The event store is backed up independently of read model databases.
- [ ] Retention and archival policies are defined (e.g., move events older than N years to cold storage).
- [ ] Monitoring tracks append latency, stream length, and concurrency conflict rate.
- [ ] A dead-letter or poison-event mechanism exists for events that fail deserialization.
- [ ] Load testing confirms acceptable performance at projected event volumes.
