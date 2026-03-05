# Repository Pattern in Domain-Driven Design

## Overview

A repository mediates between the domain layer and data mapping, acting like an **in-memory collection of aggregates**. From the domain's perspective, you add aggregates, find them, and remove them. Persistence details are hidden behind the interface.

```
Domain Layer              Infrastructure Layer
+------------------+      +---------------------------+
| OrderRepository  |      | JpaOrderRepository        |
| (interface)      |<-----| (implementation)          |
| + save(order)    |      |   -> entityManager.merge()|
| + findById(id)   |      | + findById(id)            |
| + remove(order)  |      |   -> entityManager.find() |
+------------------+      +---------------------------+
```

## Collection-Oriented vs Persistence-Oriented

**Collection-oriented:** ORM tracks changes and persists automatically at transaction commit (JPA/Hibernate dirty checking). No explicit `save()` needed.

**Persistence-oriented:** Requires explicit `save()` after every modification. This is what TypeScript ORMs, document stores, and Spring Data use.

**Recommendation:** Use persistence-oriented as the default. More explicit, easier to reason about, works consistently across all storage technologies.

## Repository Interface Design

The interface belongs to the **domain layer**, expressed in domain terms.

### Java

```java
public interface OrderRepository {
    Optional<Order> findById(OrderId id);
    List<Order> findByCustomerId(CustomerId customerId);
    List<Order> findByStatus(OrderStatus status);
    void save(Order order);
    void remove(Order order);
    boolean exists(OrderId id);
}
```

### TypeScript

```typescript
interface OrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  findByCustomerId(customerId: CustomerId): Promise<Order[]>;
  save(order: Order): Promise<void>;
  remove(order: Order): Promise<void>;
  exists(id: OrderId): Promise<boolean>;
}
```

### Python

```python
class OrderRepository(ABC):
    @abstractmethod
    async def find_by_id(self, order_id: OrderId) -> Optional[Order]: ...
    @abstractmethod
    async def save(self, order: Order) -> None: ...
    @abstractmethod
    async def remove(self, order: Order) -> None: ...
```

### What NOT to Put in an Interface

```java
// BAD: Leaking infrastructure
List<Order> findByQuery(String sql);           // SQL in domain
Order merge(Order order);                       // JPA concept
Page<Order> findAll(Pageable pageable);         // Pagination framework
List<OrderSummaryDTO> findSummaries();          // DTOs, not domain objects
```

## Spring Data JPA Implementation

### Domain Interface + Infrastructure Implementation

```java
// Infrastructure: Spring Data bridge
public interface SpringDataOrderRepository extends JpaRepository<OrderJpaEntity, UUID> {
    List<OrderJpaEntity> findByCustomerId(UUID customerId);
}

// Infrastructure: Adapter implementing domain interface
@Repository
public class JpaOrderRepository implements OrderRepository {
    private final SpringDataOrderRepository springRepo;
    private final OrderMapper mapper;

    @Override
    public Optional<Order> findById(OrderId id) {
        return springRepo.findById(id.value()).map(mapper::toDomain);
    }

    @Override
    public List<Order> findByCustomerId(CustomerId customerId) {
        return springRepo.findByCustomerId(customerId.value())
            .stream().map(mapper::toDomain).toList();
    }

    @Override
    public void save(Order order) {
        springRepo.save(mapper.toJpaEntity(order));
        order.getDomainEvents().forEach(eventPublisher::publishEvent);
        order.clearDomainEvents();
    }

    @Override
    public void remove(Order order) {
        springRepo.deleteById(order.getId().value());
    }
}
```

### Mapper Between Domain and Persistence

```java
@Component
public class OrderMapper {
    public Order toDomain(OrderJpaEntity entity) {
        return Order.reconstitute(
            OrderId.from(entity.getId()),
            CustomerId.from(entity.getCustomerId()),
            entity.getLines().stream().map(this::lineToDomain).toList(),
            OrderStatus.valueOf(entity.getStatus()),
            new Money(entity.getTotalAmount(), Currency.getInstance(entity.getCurrency())),
            entity.getPlacedAt());
    }

    public OrderJpaEntity toJpaEntity(Order order) {
        OrderJpaEntity e = new OrderJpaEntity();
        e.setId(order.getId().value());
        e.setCustomerId(order.getCustomerId().value());
        e.setStatus(order.getStatus().name());
        e.setTotalAmount(order.getTotalAmount().amount());
        e.setCurrency(order.getTotalAmount().currency().getCurrencyCode());
        e.setPlacedAt(order.getPlacedAt());
        e.setLines(order.getLines().stream().map(this::lineToJpaEntity).toList());
        return e;
    }
}
```

## TypeScript Repository Implementations

### TypeORM

```typescript
class TypeOrmOrderRepository implements OrderRepository {
  private readonly repo: Repository<OrderTypeOrmEntity>;
  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(OrderTypeOrmEntity);
  }

  async findById(id: OrderId): Promise<Order | null> {
    const entity = await this.repo.findOne({
      where: { id: id.value }, relations: { lines: true }
    });
    return entity ? OrderMapper.toDomain(entity) : null;
  }

  async save(order: Order): Promise<void> {
    await this.repo.save(OrderMapper.toPersistence(order));
  }

  async remove(order: Order): Promise<void> {
    await this.repo.delete(order.id.value);
  }
}
```

### Prisma

```typescript
class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: OrderId): Promise<Order | null> {
    const data = await this.prisma.order.findUnique({
      where: { id: id.value }, include: { lines: true }
    });
    return data ? this.toDomain(data) : null;
  }

  async save(order: Order): Promise<void> {
    const s = order.toSnapshot();
    await this.prisma.order.upsert({
      where: { id: s.id },
      create: { id: s.id, customerId: s.customerId, status: s.status,
        totalAmount: s.totalAmount, currency: s.currency, placedAt: s.placedAt,
        lines: { create: s.lines.map((l) => ({
          id: l.id, productId: l.productId, productName: l.productName,
          quantity: l.quantity, unitPrice: l.unitPrice })) }},
      update: { status: s.status, totalAmount: s.totalAmount, placedAt: s.placedAt,
        lines: { deleteMany: {}, create: s.lines.map((l) => ({
          id: l.id, productId: l.productId, productName: l.productName,
          quantity: l.quantity, unitPrice: l.unitPrice })) }}
    });
  }
}
```

## Specification Pattern for Queries

Keep query logic in the domain layer with composable specifications.

### Java JPA Specification

```java
public class OrderSpecifications {
    public static Specification<OrderJpaEntity> hasStatus(OrderStatus status) {
        return (root, q, cb) -> cb.equal(root.get("status"), status.name());
    }
    public static Specification<OrderJpaEntity> belongsToCustomer(CustomerId id) {
        return (root, q, cb) -> cb.equal(root.get("customerId"), id.value());
    }
    public static Specification<OrderJpaEntity> totalExceeds(Money threshold) {
        return (root, q, cb) -> cb.greaterThan(root.get("totalAmount"), threshold.amount());
    }
}

// Usage: compose
List<OrderJpaEntity> results = springRepo.findAll(
    hasStatus(CONFIRMED).and(belongsToCustomer(custId)).and(totalExceeds(minAmount)));
```

### TypeScript Query Specification

```typescript
interface QuerySpecification<T> {
  toQueryCriteria(): { where: Record<string, any>; orderBy?: Record<string, "ASC"|"DESC"> };
  isSatisfiedBy(candidate: T): boolean;
}

class ConfirmedOrdersForCustomer implements QuerySpecification<Order> {
  constructor(private readonly customerId: CustomerId, private readonly minAmount?: Money) {}
  toQueryCriteria() {
    const where: Record<string, any> = {
      customerId: this.customerId.value, status: OrderStatus.CONFIRMED };
    if (this.minAmount) where.totalAmount = { gte: this.minAmount.amount };
    return { where, orderBy: { placedAt: "DESC" as const } };
  }
  isSatisfiedBy(order: Order): boolean {
    return order.status === OrderStatus.CONFIRMED
      && order.customerId.equals(this.customerId)
      && (!this.minAmount || order.totalAmount.isGreaterThan(this.minAmount));
  }
}
```

## Repository vs DAO

| Repository                        | DAO                            |
|-----------------------------------|--------------------------------|
| Domain-driven abstraction         | Data-access abstraction        |
| Returns domain objects            | Returns data rows/DTOs         |
| One per aggregate root            | One per table                  |
| Saves entire aggregate atomically | Caller coordinates tables      |
| Part of domain layer (interface)  | Part of infrastructure         |

## Unit of Work Pattern

Tracks changes across repositories and commits them atomically.

### TypeScript (Explicit)

```typescript
class TypeOrmUnitOfWork implements UnitOfWork {
  private queryRunner: QueryRunner;

  constructor(private readonly dataSource: DataSource) {
    this.queryRunner = dataSource.createQueryRunner();
  }

  get orderRepository(): OrderRepository {
    return new TypeOrmOrderRepository(this.queryRunner.manager);
  }

  async begin(): Promise<void> {
    await this.queryRunner.connect();
    await this.queryRunner.startTransaction();
  }

  async commit(): Promise<void> {
    try { await this.queryRunner.commitTransaction(); }
    finally { await this.queryRunner.release(); }
  }

  async rollback(): Promise<void> {
    try { await this.queryRunner.rollbackTransaction(); }
    finally { await this.queryRunner.release(); }
  }
}

// Usage
const uow = new TypeOrmUnitOfWork(dataSource);
await uow.begin();
try {
  const order = Order.create(customerId);
  order.addLine(productId, name, qty, price);
  await uow.orderRepository.save(order);
  await uow.commit();
} catch (e) { await uow.rollback(); throw e; }
```

### Java (Implicit via Spring @Transactional)

```java
@Service
public class PlaceOrderUseCase {
    @Transactional // This IS the Unit of Work boundary
    public OrderId execute(PlaceOrderCommand cmd) {
        Order order = Order.create(cmd.customerId());
        cmd.items().forEach(item -> order.addLine(item.productId(),
            item.productName(), item.quantity(), item.unitPrice()));
        order.confirm();
        orders.save(order);
        return order.getId();
    } // All changes committed atomically here
}
```

## In-Memory Repository for Testing

```typescript
class InMemoryOrderRepository implements OrderRepository {
  private readonly store = new Map<string, Order>();

  async findById(id: OrderId): Promise<Order | null> {
    return this.store.get(id.value) ?? null;
  }
  async save(order: Order): Promise<void> {
    this.store.set(order.id.value, structuredClone(order));
  }
  async remove(order: Order): Promise<void> { this.store.delete(order.id.value); }
  async exists(id: OrderId): Promise<boolean> { return this.store.has(id.value); }
  clear(): void { this.store.clear(); }
}
```

```java
public class InMemoryOrderRepository implements OrderRepository {
    private final Map<OrderId, Order> store = new ConcurrentHashMap<>();
    @Override public Optional<Order> findById(OrderId id) {
        return Optional.ofNullable(store.get(id));
    }
    @Override public void save(Order order) { store.put(order.getId(), order); }
    @Override public void remove(Order order) { store.remove(order.getId()); }
    public void clear() { store.clear(); }
}
```

## Anti-Patterns to Avoid

1. **Generic Repository** -- `GenericRepository<T, ID>` loses domain meaning. Prefer `findOverdueOrders()` over `findAll()` with filters.
2. **Repository Per Inner Entity** -- Only aggregate roots get repositories. `OrderLineRepository` is wrong.
3. **Leaking Persistence Concerns** -- Domain interface should not expose JPA fetch strategies or SQL.
4. **Business Logic in Repository** -- Validation belongs on the aggregate, not in `save()`.
5. **Returning DTOs** -- Repositories return domain objects. Use separate query services for read models.

## Production Checklist

- [ ] Repository interface defined in domain layer with domain types
- [ ] One repository per aggregate root only
- [ ] Repository implementation lives in infrastructure layer
- [ ] Repositories return fully hydrated aggregates (not lazy proxies)
- [ ] Save persists entire aggregate atomically (root + children)
- [ ] Domain events published after successful persistence
- [ ] In-memory implementations exist for unit testing
- [ ] Specifications used for complex queries
- [ ] No business logic in repository implementations
- [ ] Optimistic concurrency enforced at repository level
- [ ] Mapper exists between domain and persistence models
- [ ] Unit of Work boundaries are explicit
- [ ] Read-heavy queries use dedicated query services, not aggregate repositories
