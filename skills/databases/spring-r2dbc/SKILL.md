---
name: spring-r2dbc
description: |
  Spring Data R2DBC for reactive database access in Spring Boot 3.x.
  Covers R2dbcRepository, DatabaseClient, reactive transactions, and WebFlux integration.

  USE WHEN: user mentions "r2dbc", "reactive database", "R2dbcRepository",
  "DatabaseClient", "reactive SQL", "WebFlux database", "non-blocking database"

  DO NOT USE FOR: blocking JDBC - use `spring-data-jdbc` or `spring-data-jpa` instead,
  MongoDB reactive - use `spring-data-mongodb` with reactive repository
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Data R2DBC

## Quick Start

```xml
<!-- pom.xml -->
<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-r2dbc</artifactId>
    </dependency>
    <dependency>
        <groupId>org.postgresql</groupId>
        <artifactId>r2dbc-postgresql</artifactId>
        <scope>runtime</scope>
    </dependency>
</dependencies>
```

```yaml
# application.yml
spring:
  r2dbc:
    url: r2dbc:postgresql://localhost:5432/mydb
    username: ${DB_USERNAME}
    password: ${DB_PASSWORD}
    pool:
      enabled: true
      initial-size: 5
      max-size: 20
```

---

## Entity Definition

```java
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.relational.core.mapping.Table;
import org.springframework.data.relational.core.mapping.Column;

@Table("products")
public class Product {

    @Id
    private Long id;

    @Column("product_name")
    private String name;

    private String description;
    private BigDecimal price;

    @Column("category_id")
    private Long categoryId;

    @CreatedDate
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;

    private boolean active;

    // Constructors, getters, setters...
}
```

```java
// For immutable entities with records (Java 17+)
@Table("orders")
public record Order(
    @Id Long id,
    @Column("customer_id") Long customerId,
    BigDecimal total,
    OrderStatus status,
    @CreatedDate Instant createdAt
) {
    public Order withStatus(OrderStatus newStatus) {
        return new Order(id, customerId, total, newStatus, createdAt);
    }
}
```

---

## Repository Interface

```java
import org.springframework.data.r2dbc.repository.R2dbcRepository;
import org.springframework.data.r2dbc.repository.Query;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

public interface ProductRepository extends R2dbcRepository<Product, Long> {

    // Automatic derived queries
    Flux<Product> findByActiveTrue();
    Flux<Product> findByNameContainingIgnoreCase(String name);
    Flux<Product> findByCategoryId(Long categoryId);
    Flux<Product> findByPriceBetween(BigDecimal min, BigDecimal max);
    Mono<Product> findByNameIgnoreCase(String name);

    // Ordering and limiting
    Flux<Product> findTop10ByActiveTrueOrderByCreatedAtDesc();

    // Count and Exists
    Mono<Long> countByActiveTrue();
    Mono<Boolean> existsByName(String name);

    // Custom query
    @Query("SELECT * FROM products WHERE category_id = :categoryId AND price < :maxPrice")
    Flux<Product> findByCategoryWithMaxPrice(Long categoryId, BigDecimal maxPrice);

    @Query("UPDATE products SET active = false WHERE id = :id")
    @Modifying
    Mono<Integer> deactivateProduct(Long id);

    // Projection with DTO
    @Query("SELECT id, product_name as name, price FROM products WHERE active = true")
    Flux<ProductSummary> findAllSummaries();
}

public record ProductSummary(Long id, String name, BigDecimal price) {}
```

> **Full Reference**: See [database-client.md](database-client.md) for complex queries with DatabaseClient.

---

## Service Layer

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class ProductService {

    private final ProductRepository productRepository;

    // Create
    public Mono<Product> createProduct(CreateProductRequest request) {
        Product product = Product.create(request.name(), request.description(), request.price());
        product.setCategoryId(request.categoryId());
        return productRepository.save(product)
            .doOnSuccess(p -> log.info("Created product: {}", p.getId()));
    }

    // Read
    public Mono<Product> getProduct(Long id) {
        return productRepository.findById(id)
            .switchIfEmpty(Mono.error(new ProductNotFoundException(id)));
    }

    public Flux<Product> getAllActiveProducts() {
        return productRepository.findByActiveTrue();
    }

    // Update
    public Mono<Product> updateProduct(Long id, UpdateProductRequest request) {
        return productRepository.findById(id)
            .switchIfEmpty(Mono.error(new ProductNotFoundException(id)))
            .map(product -> {
                if (request.name() != null) product.setName(request.name());
                if (request.price() != null) product.setPrice(request.price());
                return product;
            })
            .flatMap(productRepository::save);
    }

    // Delete (soft delete)
    public Mono<Void> deactivateProduct(Long id) {
        return productRepository.deactivateProduct(id)
            .filter(count -> count > 0)
            .switchIfEmpty(Mono.error(new ProductNotFoundException(id)))
            .then();
    }
}
```

---

## Reactive Transactions

```java
@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;

    @Transactional
    public Mono<Order> createOrder(CreateOrderRequest request) {
        return validateProducts(request.items())
            .then(calculateTotal(request.items()))
            .flatMap(total -> {
                Order order = new Order(null, request.customerId(), total, OrderStatus.PENDING, null);
                return orderRepository.save(order);
            })
            .flatMap(order -> saveOrderItems(order.id(), request.items())
                .then(Mono.just(order)));
    }

    private Mono<BigDecimal> calculateTotal(List<OrderItemRequest> items) {
        return Flux.fromIterable(items)
            .flatMap(item -> productRepository.findById(item.productId())
                .map(p -> p.getPrice().multiply(BigDecimal.valueOf(item.quantity()))))
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
```

> **Full Reference**: See [transactions.md](transactions.md) for TransactionalOperator and relation handling.

---

## Best Practices

| Do | Don't |
|----|-------|
| Use R2DBC for WebFlux applications | Mix JDBC and R2DBC |
| Configure connection pool | Use without pool |
| Handle relations manually with batch queries | Expect JPA-like lazy loading |
| Use `@Transactional` or `TransactionalOperator` | Forget transaction management |
| Use `StepVerifier` for testing | Use `.block()` in production |

---

## When NOT to Use This Skill

- **Blocking applications** - Use `spring-data-jdbc` or `spring-data-jpa`
- **Complex ORM features** - R2DBC is simple, use JPA for lazy loading
- **Not using WebFlux** - R2DBC is for reactive stack
- **MongoDB reactive** - Use `spring-data-mongodb` reactive repositories

---

## Common Pitfalls

| Error | Cause | Solution |
|-------|-------|----------|
| `NoSuchBeanDefinitionException: ConnectionFactory` | Missing R2DBC driver | Add r2dbc-postgresql/mysql dependency |
| `Connection timeout` | Pool exhausted | Increase max-size, check connection leaks |
| `TransactionRequiredException` | Missing @Transactional | Add annotation or use TransactionalOperator |
| Entity not mapped | Missing annotations | Verify @Table, @Id, @Column |
| N+1 queries | Loading relations | Use batch queries with `IN` clause |

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Using .block() in production | Blocks event loop | Use reactive operators |
| N+1 queries for relations | Performance issues | Use batch queries with IN |
| Missing connection pool | Connection exhaustion | Configure r2dbc-pool |
| Large transactions | Connection held too long | Keep transactions short |
| No error handling | Silent failures | Use onErrorResume, onErrorMap |

---

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Connection timeout | Check pool settings | Increase max-size, check leaks |
| Entity not mapped | Check annotations | Add @Table, @Id, @Column |
| Transaction not working | Check @Transactional | Use TransactionalOperator if needed |
| Query returns empty | Check column names | Verify mapping matches DB |
| Pool exhausted | Monitor active connections | Increase pool, fix leaks |

---

## Reference Files

| File | Content |
|------|---------|
| [database-client.md](database-client.md) | DatabaseClient, Dynamic Queries, Aggregations |
| [transactions.md](transactions.md) | Transactions, Relations, Pagination |
| [advanced.md](advanced.md) | Auditing, Converters, Pool Config, Testing |

---

## External Documentation

- [Spring Data R2DBC](https://docs.spring.io/spring-data/r2dbc/reference/)
- [R2DBC Specification](https://r2dbc.io/)
