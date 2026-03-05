# Aggregates in Domain-Driven Design

## Overview

An aggregate is a cluster of domain objects treated as a single unit for data changes. Every aggregate has a **root entity** (the aggregate root) which is the sole entry point for external access. Aggregates define a **consistency boundary**: invariants within an aggregate are enforced in a single transaction; consistency between aggregates is achieved eventually.

```
+----------------------------------------------------------------+
|                     Order Aggregate                             |
|  +---------------------------+                                  |
|  |     Order (Root)          |  <-- Only external entry point   |
|  |  - orderId, status        |                                  |
|  |  + addLine(), confirm()   |                                  |
|  +---------------------------+                                  |
|        |              |                                         |
|  +------------+  +------------+                                 |
|  | OrderLine  |  | OrderLine  |   <-- Inner entities            |
|  | - productId|  | - productId|   price, quantity = VOs         |
|  +------------+  +------------+                                 |
|                                                                 |
|  Invariant: total = SUM(line.price * line.quantity)             |
|  Invariant: at least one line item required                     |
+----------------------------------------------------------------+
```

## Aggregate Design Rules

### Rule 1: Model True Invariants in a Single Aggregate

The boundary must encompass exactly the data needed to enforce a business invariant in one transaction. "An order must have at least one line item" spans Order and OrderLines -- same aggregate. "A customer's lifetime spending must not exceed credit limit" involves Customer and all Orders -- too large, enforce with eventual consistency instead.

### Rule 2: Keep Aggregates Small

Large aggregates cause lock contention, performance degradation, and merge conflicts. Aim for the aggregate root plus a small number of child entities.

```
BAD: One massive aggregate           GOOD: Small, focused aggregates
+---------------------------+        +----------+  +---------+
|        Customer           |        | Customer |  |  Order  |
|  - orders[]               |        | - name   |  | - lines |
|    - lines[]              |        +----------+  +---------+
|  - addresses[]            |             |             |
|  - paymentMethods[]       |        ref by ID     ref by ID
+---------------------------+
```

### Rule 3: Reference Other Aggregates by ID Only

```java
// BAD: Direct reference loads entire object graph
public class Order { private Customer customer; }

// GOOD: Reference by ID
public class Order { private CustomerId customerId; }
```

### Rule 4: Use Eventual Consistency Between Aggregates

Publish a domain event from one aggregate; let another react asynchronously.

## Aggregate Root: Java/Spring Implementation

```java
public class Order extends AggregateRoot {
    private final OrderId id;
    private final CustomerId customerId;
    private final List<OrderLine> lines = new ArrayList<>();
    private OrderStatus status;
    private Money totalAmount;
    private Instant placedAt;

    public static Order create(CustomerId customerId) {
        Order o = new Order(OrderId.generate(), customerId);
        o.status = OrderStatus.DRAFT;
        o.totalAmount = Money.ZERO_USD;
        return o;
    }

    public void addLine(ProductId productId, String name, int qty, Money unitPrice) {
        if (status != OrderStatus.DRAFT) throw new OrderNotModifiableException(id, status);
        if (qty <= 0) throw new IllegalArgumentException("Quantity must be positive");
        lines.add(new OrderLine(OrderLineId.generate(), productId, name, qty, unitPrice));
        recalculateTotal();
    }

    public void confirm() {
        if (status != OrderStatus.DRAFT) throw new OrderNotModifiableException(id, status);
        if (lines.isEmpty()) throw new OrderMustHaveLinesException(id);
        this.status = OrderStatus.CONFIRMED;
        this.placedAt = Instant.now();
        registerEvent(new OrderConfirmed(id.value(), customerId.value(), totalAmount, placedAt));
    }

    private void recalculateTotal() {
        this.totalAmount = lines.stream()
            .map(OrderLine::lineTotal).reduce(Money.ZERO_USD, Money::add);
    }

    @Override public boolean equals(Object o) {
        return o instanceof Order other && id.equals(other.id);
    }
    @Override public int hashCode() { return id.hashCode(); }
}
```

### Spring Data JPA Mapping

```java
@Entity @Table(name = "orders")
public class Order extends AggregateRoot {
    @EmbeddedId private OrderId id;

    @Embedded
    @AttributeOverride(name = "value", column = @Column(name = "customer_id"))
    private CustomerId customerId;

    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @JoinColumn(name = "order_id")
    private List<OrderLine> lines = new ArrayList<>();

    @Enumerated(EnumType.STRING) private OrderStatus status;

    @Embedded @AttributeOverrides({
        @AttributeOverride(name = "amount", column = @Column(name = "total_amount")),
        @AttributeOverride(name = "currency", column = @Column(name = "total_currency"))
    })
    private Money totalAmount;

    @Version private Long version; // Optimistic concurrency

    protected Order() {} // JPA requires no-arg constructor
}
```

## Aggregate Root: TypeScript/TypeORM Implementation

```typescript
class Order {
  private readonly _domainEvents: DomainEvent[] = [];

  private constructor(
    private readonly _id: OrderId,
    private readonly _customerId: CustomerId,
    private _lines: OrderLine[],
    private _status: OrderStatus,
    private _totalAmount: Money,
    private _placedAt: Date | null
  ) {}

  static create(customerId: CustomerId): Order {
    return new Order(OrderId.generate(), customerId, [], OrderStatus.DRAFT,
                     Money.of(0, "USD"), null);
  }

  addLine(productId: ProductId, name: string, qty: number, unitPrice: Money): void {
    if (this._status !== OrderStatus.DRAFT) throw new OrderNotModifiableError(this._id);
    this._lines.push(OrderLine.create(productId, name, qty, unitPrice));
    this.recalculateTotal();
  }

  confirm(): void {
    if (this._status !== OrderStatus.DRAFT) throw new OrderNotModifiableError(this._id);
    if (this._lines.length === 0) throw new DomainError("Order must have at least one line");
    this._status = OrderStatus.CONFIRMED;
    this._placedAt = new Date();
    this._domainEvents.push(new OrderConfirmed(this._id.value, this._customerId.value,
                                                this._totalAmount, this._placedAt));
  }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents.length = 0;
    return events;
  }

  private recalculateTotal(): void {
    this._totalAmount = this._lines.reduce(
      (sum, line) => sum.add(line.lineTotal()), Money.of(0, "USD"));
  }
}
```

### TypeORM Persistence Entity + Mapper

```typescript
@Entity("orders")
class OrderTypeOrmEntity {
  @PrimaryColumn("uuid") id!: string;
  @Column("uuid", { name: "customer_id" }) customerId!: string;
  @OneToMany(() => OrderLineEntity, (l) => l.order, { cascade: true, eager: true })
  lines!: OrderLineEntity[];
  @Column({ type: "varchar" }) status!: string;
  @Column({ type: "decimal", name: "total_amount" }) totalAmount!: number;
  @VersionColumn() version!: number;
}

class OrderMapper {
  static toDomain(entity: OrderTypeOrmEntity): Order {
    return Order.reconstitute(OrderId.from(entity.id),
      CustomerId.from(entity.customerId),
      entity.lines.map(OrderLineMapper.toDomain),
      entity.status as OrderStatus,
      Money.of(Number(entity.totalAmount), entity.totalCurrency),
      entity.placedAt);
  }
}
```

## Transactional Consistency

All changes within a single aggregate are persisted in one transaction:

```java
@Transactional
public void addLineToOrder(OrderId orderId, AddLineCommand cmd) {
    Order order = orderRepository.findById(orderId)
        .orElseThrow(() -> new OrderNotFoundException(orderId));
    order.addLine(cmd.productId(), cmd.productName(), cmd.quantity(), cmd.unitPrice());
    orderRepository.save(order);
}
```

Use **optimistic concurrency** (`@Version`) to prevent lost updates when two users modify the same aggregate concurrently.

## Eventual Consistency Between Aggregates

```
+-----------------+     OrderConfirmed      +-------------------+
|  Order          | ----------------------> | Inventory         |
|  (Transaction 1)|    (async event)        | (Transaction 2)   |
|  - confirm()    |                         | - reserve(items)  |
+-----------------+                         +-------------------+

If reservation fails --> publish InventoryReservationFailed
  --> Order reacts by transitioning to CANCELLED (compensating transaction / saga)
```

```java
@Component
public class OrderSagaHandlers {
    @EventListener
    public void onInventoryReservationFailed(InventoryReservationFailedEvent event) {
        Order order = orders.findById(OrderId.from(event.orderId())).orElseThrow();
        order.cancel("Insufficient inventory: " + event.reason());
        orders.save(order);
    }
}
```

## Aggregate Boundary Decisions

**Should Order contain Product?** No. Hold `ProductId` and a snapshot of name/price at order time.

**Should Customer contain Orders?** No. Thousands of orders creates contention. Separate aggregates.

**Should Order contain ShippingAddress?** Yes, as a value object snapshot of the address at order time.

## Design Heuristic Flowchart

```
Does the business rule involve a SINGLE entity and its children?
  YES --> Put it in ONE aggregate
  NO  --> Does it need IMMEDIATE consistency?
            YES --> Can you combine into one aggregate without making it too large?
                      YES --> Single aggregate
                      NO  --> Separate aggregates + eventual consistency
            NO  --> Use domain events for eventual consistency
```

## Anti-Patterns to Avoid

1. **Aggregate Too Large** -- Loading takes seconds, concurrent conflicts are frequent. Split and use events.
2. **Accessing Inner Entities Directly** -- Bypasses the root, breaks invariants. Always go through the root.
3. **Cross-Aggregate Transactions** -- A single `@Transactional` spanning two aggregates. Use events instead.
4. **Anemic Aggregate Root** -- Just getters/setters with no invariant enforcement.
5. **No Optimistic Concurrency** -- Without version checks, concurrent modifications silently overwrite each other.

## Production Checklist

- [ ] Each aggregate has a clearly defined root entity
- [ ] Aggregates are as small as possible while still enforcing their invariants
- [ ] Other aggregates referenced by ID only, never direct object reference
- [ ] All modifications go through the aggregate root
- [ ] Invariants enforced in every mutation method
- [ ] Domain events published for cross-aggregate coordination
- [ ] Optimistic concurrency (version field) enabled on all aggregate roots
- [ ] Aggregate loading fetches the entire aggregate eagerly
- [ ] Cross-aggregate consistency uses events/sagas, not distributed transactions
- [ ] Aggregate methods return void or value objects -- never expose mutable internals
