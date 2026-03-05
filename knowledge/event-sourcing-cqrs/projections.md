# Read Model Projections

## Overview

A projection transforms a stream of domain events into a read-optimized data structure. In a CQRS + Event Sourcing system, the event store is the source of truth, but it is not designed for arbitrary queries. Projections build the materialized views that serve API responses, dashboards, reports, and search indices.

Every projection is **disposable and rebuildable**. If a projection has a bug, you fix the code, delete the read model data, and replay all events from the beginning to reconstruct it. This is a fundamental property that makes projections safe to evolve.

---

## Projection Types

### Inline Projections (Synchronous)

The projection updates in the same transaction as the event append. This guarantees the read model is always consistent with the write model, but couples them tightly.

**When to use:** Simple systems, prototypes, or when strong consistency between command and query is a hard requirement.

```java
@Service
public class OrderSummaryInlineProjection {

    private final JdbcTemplate jdbc;

    @Transactional
    public void project(StoredEvent event) {
        switch (event.eventType()) {
            case "OrderPlaced" -> {
                var payload = parsePayload(event);
                jdbc.update("""
                    INSERT INTO order_summaries
                        (order_id, customer_id, status, item_count, placed_at)
                    VALUES (?, ?, 'placed', ?, ?)
                    """,
                    event.aggregateId(),
                    payload.get("customerId"),
                    ((List<?>) payload.get("items")).size(),
                    event.timestamp()
                );
            }
            case "OrderCancelled" -> {
                jdbc.update("""
                    UPDATE order_summaries
                    SET status = 'cancelled', cancelled_at = ?
                    WHERE order_id = ?
                    """,
                    event.timestamp(),
                    event.aggregateId()
                );
            }
        }
    }
}
```

### Catch-Up Projections (Async, Batch)

The projection reads events from the store in batches, starting from a stored checkpoint. It runs as a background process and can be restarted from the beginning at any time.

**When to use:** Most production systems. This is the default choice.

```typescript
interface ProjectionCheckpoint {
  projectionName: string;
  lastProcessedPosition: number;
  updatedAt: string;
}

export class CatchUpProjectionRunner {
  private running = false;

  constructor(
    private eventStore: EventStoreReader,
    private checkpointStore: CheckpointStore,
    private projections: Map<string, Projection>,
    private batchSize = 500,
    private pollIntervalMs = 1000,
  ) {}

  async start(): Promise<void> {
    this.running = true;

    while (this.running) {
      for (const [name, projection] of this.projections) {
        await this.processBatch(name, projection);
      }
      await this.sleep(this.pollIntervalMs);
    }
  }

  stop(): void {
    this.running = false;
  }

  private async processBatch(name: string, projection: Projection): Promise<void> {
    const checkpoint = await this.checkpointStore.get(name);
    const lastPosition = checkpoint?.lastProcessedPosition ?? 0;

    const events = await this.eventStore.readAllFrom(lastPosition, this.batchSize);

    if (events.length === 0) return;

    for (const event of events) {
      try {
        await projection.handle(event);
      } catch (err) {
        console.error(`Projection ${name} failed on event ${event.eventId}:`, err);
        // Options: skip, retry, stop, dead-letter
        throw err; // stop processing this projection
      }
    }

    const lastEvent = events[events.length - 1];
    await this.checkpointStore.save({
      projectionName: name,
      lastProcessedPosition: lastEvent.globalPosition,
      updatedAt: new Date().toISOString(),
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Live Projections (Async, Push)

The projection subscribes to a real-time event stream (e.g., EventStoreDB subscription, Kafka consumer, PostgreSQL LISTEN/NOTIFY). Events arrive as they are appended.

**When to use:** When low latency between write and read model is critical.

```typescript
// EventStoreDB live subscription
import { EventStoreDBClient, PARK, START } from '@eventstore/db-client';

export class LiveProjectionSubscriber {
  constructor(
    private client: EventStoreDBClient,
    private groupName: string,
    private streamName: string,
    private projection: Projection,
  ) {}

  async subscribe(): Promise<void> {
    // Create persistent subscription if it does not exist
    try {
      await this.client.createPersistentSubscriptionToAll(this.groupName, {
        startFrom: START,
      });
    } catch {
      // Already exists, ignore
    }

    const subscription = this.client.subscribeToPersistentSubscriptionToAll(this.groupName);

    for await (const event of subscription) {
      try {
        const resolved = event.event!;
        await this.projection.handle({
          eventId: resolved.id,
          eventType: resolved.type,
          aggregateId: resolved.streamId.split('-')[1],
          aggregateType: resolved.streamId.split('-')[0],
          version: Number(resolved.revision),
          payload: resolved.data as Record<string, unknown>,
          metadata: resolved.metadata as Record<string, unknown>,
          timestamp: resolved.created!.toISOString(),
          globalPosition: Number(resolved.position?.commit ?? 0),
        });
        await subscription.ack(event);
      } catch (err) {
        console.error('Projection error, nacking event:', err);
        await subscription.nack(event, PARK, 'Projection handler failed');
      }
    }
  }
}
```

---

## Building Materialized Views

### PostgreSQL Read Model

A common pattern: one PostgreSQL schema for the event store, another for read models. Each projection writes to its own tables.

```sql
-- Read model schema
CREATE SCHEMA IF NOT EXISTS read_model;

CREATE TABLE read_model.order_summaries (
    order_id        UUID PRIMARY KEY,
    customer_id     UUID NOT NULL,
    customer_name   VARCHAR(255),
    status          VARCHAR(50) NOT NULL,
    item_count      INT NOT NULL DEFAULT 0,
    total_amount    DECIMAL(12, 2) NOT NULL DEFAULT 0,
    placed_at       TIMESTAMPTZ,
    shipped_at      TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_summaries_customer ON read_model.order_summaries (customer_id);
CREATE INDEX idx_order_summaries_status ON read_model.order_summaries (status);

-- Projection checkpoint table
CREATE TABLE read_model.projection_checkpoints (
    projection_name         VARCHAR(100) PRIMARY KEY,
    last_processed_position BIGINT NOT NULL DEFAULT 0,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### Java Projection Implementation

```java
@Component
public class OrderSummaryProjection implements Projection {

    private final JdbcTemplate jdbc;

    @Override
    public Set<String> handledEventTypes() {
        return Set.of("OrderPlaced", "LineItemAdded", "OrderShipped", "OrderCancelled");
    }

    @Override
    @Transactional
    public void handle(StoredEvent event) {
        switch (event.eventType()) {
            case "OrderPlaced" -> handleOrderPlaced(event);
            case "LineItemAdded" -> handleLineItemAdded(event);
            case "OrderShipped" -> handleOrderShipped(event);
            case "OrderCancelled" -> handleOrderCancelled(event);
        }
    }

    private void handleOrderPlaced(StoredEvent event) {
        var payload = parseJson(event.payload());
        var items = (List<Map<String, Object>>) payload.get("items");
        double total = items.stream()
            .mapToDouble(i -> ((Number) i.get("price")).doubleValue()
                            * ((Number) i.get("quantity")).intValue())
            .sum();

        jdbc.update("""
            INSERT INTO read_model.order_summaries
                (order_id, customer_id, status, item_count, total_amount, placed_at)
            VALUES (?, ?, 'placed', ?, ?, ?)
            ON CONFLICT (order_id) DO NOTHING
            """,
            event.aggregateId(),
            UUID.fromString((String) payload.get("customerId")),
            items.size(),
            total,
            event.timestamp()
        );
    }

    private void handleLineItemAdded(StoredEvent event) {
        var payload = parseJson(event.payload());
        double lineTotal = ((Number) payload.get("price")).doubleValue()
                         * ((Number) payload.get("quantity")).intValue();

        jdbc.update("""
            UPDATE read_model.order_summaries
            SET item_count = item_count + 1,
                total_amount = total_amount + ?,
                updated_at = now()
            WHERE order_id = ?
            """,
            lineTotal,
            event.aggregateId()
        );
    }

    private void handleOrderShipped(StoredEvent event) {
        jdbc.update("""
            UPDATE read_model.order_summaries
            SET status = 'shipped', shipped_at = ?, updated_at = now()
            WHERE order_id = ?
            """,
            event.timestamp(), event.aggregateId()
        );
    }

    private void handleOrderCancelled(StoredEvent event) {
        jdbc.update("""
            UPDATE read_model.order_summaries
            SET status = 'cancelled', cancelled_at = ?, updated_at = now()
            WHERE order_id = ?
            """,
            event.timestamp(), event.aggregateId()
        );
    }
}
```

### MongoDB Read Model

MongoDB excels when the read model is a complex document that would require multiple joins in SQL.

```typescript
import { Collection, Db } from 'mongodb';

interface OrderDetailView {
  _id: string; // orderId
  customerId: string;
  customerName: string;
  status: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  shippingAddress: Address;
  totalAmount: number;
  timeline: Array<{ event: string; at: string; details?: string }>;
}

export class OrderDetailProjection implements Projection {
  private collection: Collection<OrderDetailView>;

  constructor(db: Db) {
    this.collection = db.collection('order_details');
  }

  async handle(event: ProjectedEvent): Promise<void> {
    switch (event.eventType) {
      case 'OrderPlaced':
        await this.onOrderPlaced(event);
        break;
      case 'LineItemAdded':
        await this.onLineItemAdded(event);
        break;
      case 'OrderShipped':
        await this.onStatusChange(event, 'shipped');
        break;
      case 'OrderCancelled':
        await this.onStatusChange(event, 'cancelled');
        break;
    }
  }

  private async onOrderPlaced(event: ProjectedEvent): Promise<void> {
    const { customerId, items, shippingAddress } = event.payload;
    const totalAmount = items.reduce(
      (sum: number, i: any) => sum + i.unitPrice * i.quantity, 0
    );

    await this.collection.insertOne({
      _id: event.aggregateId,
      customerId,
      customerName: '', // enriched by a separate projection or lookup
      status: 'placed',
      items: items.map((i: any) => ({
        ...i,
        lineTotal: i.unitPrice * i.quantity,
      })),
      shippingAddress,
      totalAmount,
      timeline: [{ event: 'OrderPlaced', at: event.timestamp }],
    });
  }

  private async onLineItemAdded(event: ProjectedEvent): Promise<void> {
    const { productId, productName, quantity, unitPrice } = event.payload;
    const lineTotal = unitPrice * quantity;

    await this.collection.updateOne(
      { _id: event.aggregateId },
      {
        $push: {
          items: { productId, productName, quantity, unitPrice, lineTotal },
          timeline: { event: 'LineItemAdded', at: event.timestamp, details: productName },
        },
        $inc: { totalAmount: lineTotal },
      }
    );
  }

  private async onStatusChange(event: ProjectedEvent, status: string): Promise<void> {
    await this.collection.updateOne(
      { _id: event.aggregateId },
      {
        $set: { status },
        $push: {
          timeline: {
            event: event.eventType,
            at: event.timestamp,
            details: event.payload.reason ?? undefined,
          },
        },
      }
    );
  }
}
```

---

## Handling Projection Failures

### Retry Strategies

```typescript
export class ResilientProjectionRunner {
  private readonly maxRetries = 3;
  private readonly retryDelays = [1000, 5000, 15000]; // exponential backoff

  async processEvent(projection: Projection, event: ProjectedEvent): Promise<void> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        await projection.handle(event);
        return;
      } catch (err) {
        if (attempt === this.maxRetries) {
          await this.sendToDeadLetter(projection.name, event, err as Error);
          return; // Skip and continue with next event
        }
        console.warn(
          `Projection ${projection.name} attempt ${attempt + 1} failed, retrying...`
        );
        await this.sleep(this.retryDelays[attempt]);
      }
    }
  }

  private async sendToDeadLetter(
    projectionName: string,
    event: ProjectedEvent,
    error: Error,
  ): Promise<void> {
    await this.deadLetterStore.insert({
      projectionName,
      eventId: event.eventId,
      eventType: event.eventType,
      event: JSON.stringify(event),
      error: error.message,
      stackTrace: error.stack,
      failedAt: new Date().toISOString(),
    });
    console.error(
      `Event ${event.eventId} sent to dead letter for projection ${projectionName}`
    );
  }
}
```

### Full Replay (Rebuilding a Projection)

```typescript
export class ProjectionRebuilder {
  constructor(
    private eventStore: EventStoreReader,
    private checkpointStore: CheckpointStore,
    private batchSize = 1000,
  ) {}

  async rebuild(projectionName: string, projection: Projection): Promise<void> {
    console.log(`Starting rebuild of projection: ${projectionName}`);

    // 1. Clear existing read model data
    await projection.reset();

    // 2. Reset checkpoint to zero
    await this.checkpointStore.save({
      projectionName,
      lastProcessedPosition: 0,
      updatedAt: new Date().toISOString(),
    });

    // 3. Replay all events in batches
    let position = 0;
    let totalProcessed = 0;

    while (true) {
      const events = await this.eventStore.readAllFrom(position, this.batchSize);
      if (events.length === 0) break;

      for (const event of events) {
        await projection.handle(event);
      }

      position = events[events.length - 1].globalPosition + 1;
      totalProcessed += events.length;

      // Checkpoint periodically
      await this.checkpointStore.save({
        projectionName,
        lastProcessedPosition: position - 1,
        updatedAt: new Date().toISOString(),
      });

      console.log(`Rebuilt ${totalProcessed} events so far...`);
    }

    console.log(`Rebuild complete. Processed ${totalProcessed} events.`);
  }
}
```

---

## Eventual Consistency Considerations

In an async projection system, the read model is eventually consistent with the write model. After a command succeeds, there is a window where the read model does not yet reflect the new events.

### Strategies for Managing Staleness

1. **Accept it.** Most UIs tolerate sub-second staleness. Display "last updated" timestamps so users understand freshness.

2. **Read-your-writes consistency.** After a command, the API returns the new aggregate version. The client includes this version in subsequent queries. The query service waits until its projection has caught up to that version before responding (with a timeout).

```typescript
async function queryWithMinVersion(
  orderId: string,
  minVersion: number,
  timeoutMs = 5000,
): Promise<OrderSummary> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const summary = await orderSummaryRepo.findById(orderId);
    if (summary && summary.projectedVersion >= minVersion) {
      return summary;
    }
    await new Promise(r => setTimeout(r, 100));
  }

  throw new StaleReadError(
    `Projection for order ${orderId} has not reached version ${minVersion}`
  );
}
```

3. **Optimistic UI.** The client applies the expected state change locally without waiting for the server read model. If the projection later reveals a conflict, the UI corrects itself.

4. **Subscription-based UI updates.** The client subscribes to a WebSocket or SSE feed that pushes projection updates in real time.

---

## Anti-Patterns

1. **One projection to rule them all** -- A single giant read model that tries to serve every query is just a traditional database with extra steps. Build one projection per distinct query need.
2. **Projection writes back to the event store** -- Projections are pure consumers. They must never produce events. If a projected view triggers a business action, use a process manager or saga.
3. **Skipping checkpoints** -- Without persisted checkpoints, a projection restart replays from the beginning every time. On large event stores this can take hours.
4. **Non-idempotent projections** -- Events may be redelivered (at-least-once semantics). A projection that increments a counter without checking if the event was already processed will produce incorrect totals.
5. **Coupling projection schema to event payload** -- If you `JSON.parse(event.payload).items[0].price` without mapping through a typed handler, any event schema change breaks the projection silently.
6. **Ignoring replay performance** -- A projection that makes an external API call per event (e.g., geocoding an address) becomes a bottleneck during replay. Cache or skip external calls during catch-up mode.

---

## Production Checklist

- [ ] Every projection has a persisted checkpoint that survives restarts.
- [ ] Projections are idempotent: reprocessing the same event produces the same result.
- [ ] A rebuild mechanism exists: clear read model, reset checkpoint, replay from zero.
- [ ] Dead-letter storage captures events that fail all retry attempts.
- [ ] Monitoring tracks projection lag (distance between latest event and last processed position).
- [ ] Alerts fire when projection lag exceeds a defined threshold.
- [ ] Read model databases are separate from the event store (different schema or different server).
- [ ] Projection code is tested with event fixtures covering ordering edge cases (out-of-order, duplicates, missing predecessors).
- [ ] A versioning or naming scheme allows running old and new projection versions side-by-side during migration.
- [ ] External service calls during projection are cached or deferred to avoid replay bottlenecks.
