---
name: ddd
description: |
  Domain-Driven Design patterns. Bounded contexts, aggregates, entities,
  value objects, domain events, repositories, and application services.
  Strategic and tactical DDD for complex business domains.

  USE WHEN: user mentions "DDD", "Domain-Driven Design", "bounded context",
  "aggregate", "value object", "domain event", "ubiquitous language",
  "aggregate root", "domain service"

  DO NOT USE FOR: database schema design - use database skills;
  CQRS/Event Sourcing specifics - use `event-sourcing-cqrs`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Domain-Driven Design

## Strategic DDD

```
┌─────────────────┐     ┌─────────────────┐
│  Order Context   │────▶│ Payment Context  │
│  (core domain)   │     │  (supporting)    │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Inventory Context│     │ Notification Ctx  │
│  (supporting)    │     │  (generic)       │
└─────────────────┘     └─────────────────┘
```

## Tactical DDD (TypeScript)

### Entity

```typescript
class Order {
  private constructor(
    readonly id: OrderId,
    private items: OrderItem[],
    private status: OrderStatus,
    private readonly createdAt: Date,
  ) {}

  static create(items: OrderItem[]): Order {
    if (items.length === 0) throw new DomainError('Order must have at least one item');
    return new Order(OrderId.generate(), items, OrderStatus.PENDING, new Date());
  }

  get total(): Money {
    return this.items.reduce((sum, item) => sum.add(item.subtotal), Money.zero('USD'));
  }

  confirm(): DomainEvent[] {
    if (this.status !== OrderStatus.PENDING) throw new DomainError('Can only confirm pending orders');
    this.status = OrderStatus.CONFIRMED;
    return [new OrderConfirmed(this.id, this.total)];
  }
}
```

### Value Object

```typescript
class Money {
  private constructor(readonly amount: number, readonly currency: string) {
    if (amount < 0) throw new DomainError('Amount cannot be negative');
  }

  static of(amount: number, currency: string): Money {
    return new Money(Math.round(amount * 100) / 100, currency);
  }

  static zero(currency: string): Money { return new Money(0, currency); }

  add(other: Money): Money {
    if (this.currency !== other.currency) throw new DomainError('Currency mismatch');
    return Money.of(this.amount + other.amount, this.currency);
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }
}
```

### Domain Event

```typescript
class OrderConfirmed implements DomainEvent {
  readonly occurredAt = new Date();
  constructor(readonly orderId: OrderId, readonly total: Money) {}
}
```

### Repository (Port)

```typescript
interface OrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  save(order: Order): Promise<void>;
  nextId(): OrderId;
}
```

### Application Service

```typescript
class ConfirmOrderUseCase {
  constructor(
    private orders: OrderRepository,
    private eventBus: EventBus,
  ) {}

  async execute(orderId: string): Promise<void> {
    const order = await this.orders.findById(OrderId.from(orderId));
    if (!order) throw new NotFoundError('Order', orderId);

    const events = order.confirm();
    await this.orders.save(order);
    await this.eventBus.publishAll(events);
  }
}
```

## DDD Building Blocks

| Building Block | Purpose | Identity? | Mutable? |
|---------------|---------|-----------|----------|
| Entity | Domain object with identity | Yes (ID) | Yes |
| Value Object | Immutable descriptor | No (structural equality) | No |
| Aggregate | Consistency boundary | Root entity has ID | Yes (via root) |
| Domain Event | Something that happened | Event ID | No |
| Repository | Persistence abstraction | N/A | N/A |
| Domain Service | Logic not belonging to entity | N/A | N/A |

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Anemic domain model (logic in services) | Put business logic in entities |
| Aggregate too large | Keep aggregates small, reference by ID |
| Exposing entity internals | Use methods that express domain intent |
| Cross-aggregate transactions | Use domain events for eventual consistency |
| Repository returning DTOs | Return domain objects, map in application layer |

## Production Checklist

- [ ] Bounded contexts identified and documented
- [ ] Ubiquitous language in code matches business terms
- [ ] Aggregates enforce invariants
- [ ] Value objects for all descriptors (Money, Email, Address)
- [ ] Domain events for cross-context communication
- [ ] Repository pattern for persistence abstraction
