---
name: spring-data-jdbc
description: |
  Spring Data JDBC for simple, lightweight database access without JPA complexity.
  Covers aggregates, repositories, custom queries, and DDD patterns.

  USE WHEN: user mentions "spring data jdbc", "simple database access", "no JPA",
  "aggregate roots", "DDD with JDBC", "lightweight ORM", "@MappedCollection"

  DO NOT USE FOR: JPA/Hibernate features - use `spring-data-jpa` instead,
  reactive database - use `spring-r2dbc` instead, NoSQL - use respective skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Data JDBC - Quick Reference

> **Full Reference**: See [advanced.md](advanced.md) for custom row mappers, ID generation, auditing, event listeners, and Testcontainers integration.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-data-jdbc` for comprehensive documentation.

## Why Spring Data JDBC over JPA?

| Spring Data JDBC | Spring Data JPA |
|------------------|-----------------|
| No lazy loading | Lazy loading |
| No dirty checking | Auto dirty checking |
| No session/cache | First-level cache |
| Explicit SQL | Generated SQL |
| Fast startup | Slower startup |

## Dependencies

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-jdbc</artifactId>
</dependency>
```

## Entity Mapping

```java
@Table("users")
public class User {
    @Id
    private Long id;
    private String username;
    private String email;

    @Column("created_at")
    private LocalDateTime createdAt;
}
```

## Aggregate Design

```java
@Table("orders")
public class Order {
    @Id
    private Long id;
    private Long customerId;  // Reference by ID, not entity
    private OrderStatus status;

    @MappedCollection(idColumn = "order_id")
    private Set<OrderItem> items = new HashSet<>();

    public void addItem(Long productId, int quantity, BigDecimal price) {
        items.add(new OrderItem(productId, quantity, price));
    }

    public BigDecimal getTotal() {
        return items.stream()
            .map(OrderItem::getSubtotal)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}

// Aggregate member (no @Id - lifecycle managed by root)
public class OrderItem {
    private Long productId;
    private int quantity;
    private BigDecimal unitPrice;

    public BigDecimal getSubtotal() {
        return unitPrice.multiply(BigDecimal.valueOf(quantity));
    }
}
```

## Repository Pattern

```java
public interface OrderRepository extends CrudRepository<Order, Long> {

    List<Order> findByCustomerId(Long customerId);
    List<Order> findByStatus(OrderStatus status);

    @Query("SELECT * FROM orders WHERE status = :status ORDER BY created_at DESC LIMIT :limit")
    List<Order> findRecentByStatus(OrderStatus status, int limit);

    @Modifying
    @Query("UPDATE orders SET status = :newStatus WHERE status = :oldStatus AND created_at < :before")
    int updateOldOrders(OrderStatus oldStatus, OrderStatus newStatus, LocalDateTime before);

    boolean existsByCustomerIdAndStatus(Long customerId, OrderStatus status);
}
```

## Schema

```sql
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    status VARCHAR(50) NOT NULL
);

CREATE TABLE order_item (
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL
);
```

## When NOT to Use This Skill

- **Need lazy loading** - Use `spring-data-jpa` for complex entity graphs
- **Reactive applications** - Use `spring-r2dbc` for non-blocking access
- **Complex ORM features** - Use JPA for second-level cache, dirty checking

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| JPA-style entity graphs | Not supported | Design proper aggregates |
| Embedding other aggregates | Coupling | Reference by ID only |
| Large aggregates | Performance issues | Keep aggregates small |
| Missing CASCADE on FK | Orphan records | Add ON DELETE CASCADE |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Entity not saved | Check @Id generation | Configure ID callback or auto-increment |
| Children not persisted | Check @MappedCollection | Add idColumn properly |
| Column not mapped | Check naming | Use @Column for custom names |
| Transaction not working | Check @Transactional | Ensure Spring proxy |

## Best Practices

| Do | Don't |
|----|-------|
| Design proper aggregates | Use JPA-style entity graphs |
| Reference other aggregates by ID | Embed other aggregate roots |
| Keep aggregates small | Create huge aggregate graphs |
| Use immutable value objects | Mutate embedded objects directly |

## Production Checklist

- [ ] Aggregate boundaries defined
- [ ] Schema matches entity mapping
- [ ] Indexes on query columns
- [ ] Foreign keys with CASCADE
- [ ] Transaction boundaries clear
- [ ] Connection pool configured

## Reference Documentation
- [Spring Data JDBC Reference](https://docs.spring.io/spring-data/jdbc/reference/)
