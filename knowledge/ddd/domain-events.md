# Domain Events in Domain-Driven Design

## Overview

A domain event represents something meaningful that happened in the domain. Events are **facts** -- immutable records of state transitions that already occurred. They use **past-tense naming** (`OrderPlaced`, `PaymentReceived`, `InventoryReserved`).

Domain events serve three purposes:
1. **Decoupling** -- Aggregates notify the world without knowing who listens.
2. **Eventual consistency** -- Coordinate state changes across aggregate boundaries.
3. **Audit trail** -- Complete history of what happened and when.

```
Aggregate          Event Bus / Broker         Handlers
+--------+         +---------------+         +-----------+
| Order  |--emit-->| OrderConfirmed|--sub--->| Inventory |
|confirm()|        |               |--sub--->| Notifier  |
+--------+         +---------------+         +-----------+
Events are FACTS. Handlers react independently.
```

## Event Structure

Every domain event should include: event ID (idempotency), aggregate ID, timestamp, event type, and relevant data (not the entire aggregate).

### Java Implementation

```java
public interface DomainEvent {
    UUID eventId();
    Instant occurredAt();
}

public record OrderConfirmed(
    UUID eventId,
    UUID orderId,
    UUID customerId,
    BigDecimal totalAmount,
    String currency,
    List<OrderLineSnapshot> lines,
    Instant occurredAt
) implements DomainEvent {

    public static OrderConfirmed from(Order order) {
        return new OrderConfirmed(UUID.randomUUID(), order.getId().value(),
            order.getCustomerId().value(), order.getTotalAmount().amount(),
            order.getTotalAmount().currency().getCurrencyCode(),
            order.getLines().stream().map(OrderLineSnapshot::from).toList(),
            Instant.now());
    }
}

public record OrderLineSnapshot(UUID productId, String name, int quantity,
                                 BigDecimal unitPrice) {
    public static OrderLineSnapshot from(OrderLine line) {
        return new OrderLineSnapshot(line.getProductId().value(),
            line.getProductName(), line.getQuantity(), line.getUnitPrice().amount());
    }
}
```

### TypeScript Implementation

```typescript
interface DomainEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly aggregateId: string;
}

class OrderConfirmed implements DomainEvent {
  readonly eventType = "OrderConfirmed";
  private constructor(
    readonly eventId: string, readonly aggregateId: string,
    readonly customerId: string, readonly totalAmount: number,
    readonly currency: string, readonly lines: ReadonlyArray<OrderLineSnapshot>,
    readonly occurredAt: Date
  ) { Object.freeze(this); }

  static from(order: Order): OrderConfirmed {
    return new OrderConfirmed(crypto.randomUUID(), order.id.value,
      order.customerId.value, order.totalAmount.amount, order.totalAmount.currency,
      order.lines.map((l) => ({ productId: l.productId.value, name: l.productName,
        quantity: l.quantity, unitPrice: l.unitPrice.amount })), new Date());
  }
}
```

### Python Implementation

```python
@dataclass(frozen=True)
class OrderConfirmed:
    order_id: UUID
    customer_id: UUID
    total_amount: float
    currency: str
    occurred_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    event_id: UUID = field(default_factory=uuid4)
```

## Collecting Events in Aggregates

```java
public abstract class AggregateRoot {
    @Transient private final List<DomainEvent> domainEvents = new ArrayList<>();
    protected void registerEvent(DomainEvent event) { domainEvents.add(event); }
    public List<DomainEvent> getDomainEvents() {
        return Collections.unmodifiableList(domainEvents);
    }
    public void clearDomainEvents() { domainEvents.clear(); }
}

public class Order extends AggregateRoot {
    public void confirm() {
        // ... validation ...
        this.status = OrderStatus.CONFIRMED;
        registerEvent(OrderConfirmed.from(this));
    }
}
```

## Event Publishing

### Spring ApplicationEventPublisher (In-Process)

```java
@Transactional
public void confirmOrder(OrderId orderId) {
    Order order = orderRepository.findById(orderId).orElseThrow();
    order.confirm();
    orderRepository.save(order);
    order.getDomainEvents().forEach(eventPublisher::publishEvent);
    order.clearDomainEvents();
}
```

Spring Data can automate this with `@DomainEvents` / `@AfterDomainEventPublication` annotations on the aggregate root -- Spring calls them after `save()`.

### Node.js Custom Event Bus

```typescript
class TypedEventBus {
  private handlers = new Map<string, ((event: DomainEvent) => Promise<void>)[]>();

  on<T extends DomainEvent>(eventClass: new (...a: any[]) => T,
                             handler: (event: T) => Promise<void>): void {
    const key = eventClass.name;
    this.handlers.set(key, [...(this.handlers.get(key) ?? []), handler]);
  }

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.constructor.name) ?? [];
    await Promise.allSettled(handlers.map((h) => h(event)));
  }
}
```

### Python Event Bus

```python
class EventBus:
    def __init__(self):
        self._handlers: dict[type, list[Callable]] = defaultdict(list)

    def subscribe(self, event_type: type, handler: Callable) -> None:
        self._handlers[event_type].append(handler)

    async def publish(self, event) -> None:
        for handler in self._handlers.get(type(event), []):
            try: await handler(event)
            except Exception as e: logger.error(f"Handler failed: {e}")
```

## Event Handlers

Handlers must be **idempotent** (safe to receive duplicates), **independent** (one handler's failure does not affect others), and **focused** (each does one thing).

```java
@Component
public class ReserveInventoryOnOrderConfirmed {
    @TransactionalEventListener(phase = AFTER_COMMIT) // Only after order commits
    public void handle(OrderConfirmed event) {
        inventoryService.reserveItems(event.orderId(),
            event.lines().stream()
                .map(l -> new ReservationRequest(l.productId(), l.quantity()))
                .toList());
    }
}

@Component
public class SendOrderConfirmationEmail {
    @EventListener @Async
    public void handle(OrderConfirmed event) {
        emailService.send(event.customerId(), "Order Confirmed",
                          buildBody(event));
    }
}
```

## Outbox Pattern for Reliable Publishing

Publishing events directly to a broker outside the database transaction creates the **dual-write problem**. The outbox pattern writes events to a database table in the same transaction, then publishes asynchronously.

```
Transaction 1 (atomic):
  UPDATE orders SET status = 'CONFIRMED'
  INSERT INTO outbox_events (id, type, payload, published=false)

Background poller:
  SELECT FROM outbox_events WHERE published = false
  --> publish to Kafka/RabbitMQ
  --> UPDATE SET published = true
```

### Java Implementation

```java
@Entity @Table(name = "outbox_events")
public class OutboxEvent {
    @Id private UUID id;
    @Column(name = "event_type") private String eventType;
    @Column(columnDefinition = "jsonb") private String payload;
    @Column(name = "aggregate_id") private UUID aggregateId;
    private boolean published;
    private Instant createdAt;
}

@Service @Transactional
public class OrderApplicationService {
    public void confirmOrder(OrderId orderId) {
        Order order = orderRepository.findById(orderId).orElseThrow();
        order.confirm();
        orderRepository.save(order);
        for (DomainEvent event : order.getDomainEvents())
            outboxRepository.save(OutboxEvent.from(event, "Order", orderId.value()));
        order.clearDomainEvents();
    }
}

@Component
public class OutboxPublisher {
    @Scheduled(fixedDelay = 1000)
    @Transactional
    public void publishPending() {
        for (OutboxEvent event : outboxRepository.findUnpublished()) {
            try {
                kafka.send(event.getEventType(), event.getAggregateId().toString(),
                           event.getPayload());
                event.markPublished();
            } catch (Exception e) { log.error("Publish failed: {}", e.getMessage()); break; }
        }
    }
}
```

### TypeScript Implementation

```typescript
class OutboxRepository {
  constructor(private readonly db: DataSource) {}

  async save(event: DomainEvent, aggregateId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO outbox_events (id, event_type, payload, created_at, published)
       VALUES ($1, $2, $3, $4, false)`,
      [event.eventId, event.eventType, JSON.stringify(event), event.occurredAt]);
  }

  async fetchUnpublished(limit = 100): Promise<OutboxRow[]> {
    return this.db.query(
      `SELECT * FROM outbox_events WHERE published = false
       ORDER BY created_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED`, [limit]);
  }
}
```

## Event Sourcing Integration

Instead of storing current state, store every event. Current state = replay of events.

```java
public class Order {
    public static Order fromHistory(List<DomainEvent> history) {
        Order order = new Order();
        history.forEach(order::apply); // Replay without recording
        return order;
    }

    public void confirm() {
        if (status != OrderStatus.DRAFT) throw new OrderNotModifiableException(id, status);
        raise(new OrderConfirmed(/*...*/)); // Record + apply
    }

    private void raise(DomainEvent event) { apply(event); uncommittedEvents.add(event); }

    private void apply(DomainEvent event) {
        switch (event) {
            case OrderPlaced e -> { this.id = OrderId.from(e.orderId()); this.status = OrderStatus.DRAFT; }
            case OrderConfirmed e -> { this.status = OrderStatus.CONFIRMED; }
            default -> throw new IllegalArgumentException("Unknown event");
        }
    }
}
```

## Event Versioning

Events are contracts. When you change structure, upcast old events:

```java
public class OrderConfirmedV1ToV2Upcaster implements EventUpcaster {
    public JsonNode upcast(JsonNode old, int fromVersion) {
        ObjectNode node = (ObjectNode) old;
        if (!node.has("currency")) node.put("currency", "USD"); // V2 added currency
        return node;
    }
}
```

## Anti-Patterns to Avoid

1. **Events Carrying Too Much Data** -- Include only what consumers need, not the entire aggregate.
2. **Mutable Events** -- Events are facts about the past. Never modify a published event.
3. **Synchronous Cross-Aggregate Handling** -- Use `@Async` or `AFTER_COMMIT` to decouple handler failures.
4. **Missing Idempotency** -- At-least-once delivery means duplicates. Track processed event IDs.
5. **No Outbox Pattern** -- Direct broker publishing outside the transaction causes dual-write problems.

## Production Checklist

- [ ] Events are immutable and use past-tense naming
- [ ] Each event has unique ID, timestamp, and aggregate ID
- [ ] Events carry only the data consumers need
- [ ] Aggregate roots collect events; published after persistence
- [ ] Outbox pattern used for cross-service event publishing
- [ ] Event handlers are idempotent and independent
- [ ] Events are versioned with an upcasting strategy
- [ ] Failed event publication retried with backoff
- [ ] Dead-letter queues capture unprocessable events
- [ ] Event ordering preserved per aggregate (partition by aggregate ID)
- [ ] Monitoring and alerting for outbox lag and handler failures
