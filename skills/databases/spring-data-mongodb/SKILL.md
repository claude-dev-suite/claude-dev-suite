---
name: spring-data-mongodb
description: |
  Spring Data MongoDB for Java/Spring Boot applications.
  Covers repositories, MongoTemplate, aggregations, and document mapping.

  USE WHEN: user mentions "spring data mongodb", "MongoTemplate", "MongoRepository",
  "@Document", "Spring Boot MongoDB", "aggregation pipeline Java"

  DO NOT USE FOR: raw MongoDB driver - use `mongodb` instead,
  relational databases - use `spring-data-jpa` or `spring-data-jdbc` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Data MongoDB - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-data-mongodb` for comprehensive documentation.

## Setup

### Dependencies (Maven)
```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-mongodb</artifactId>
</dependency>
```

### Configuration
```yaml
spring:
  data:
    mongodb:
      uri: mongodb://localhost:27017/mydb
      # Or explicit
      host: localhost
      port: 27017
      database: mydb
      username: user
      password: secret
      authentication-database: admin
```

## Entity Mapping

### Basic Document
```java
@Document(collection = "products")
public class Product {
    @Id
    private String id;

    @Field("product_name")
    private String name;

    @Indexed
    private String category;

    private BigDecimal price;

    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}
```

### Embedded Documents
```java
@Document(collection = "orders")
public class Order {
    @Id
    private String id;

    private Customer customer;           // Embedded
    private List<OrderItem> items;       // Embedded list
    private Address shippingAddress;     // Embedded
}

// No @Document - embedded class
public class OrderItem {
    private String productId;
    private String productName;
    private int quantity;
    private BigDecimal price;
}
```

### References
```java
@Document(collection = "posts")
public class Post {
    @Id
    private String id;
    private String title;

    @DBRef
    private User author;                 // Lazy loaded reference

    // Manual reference (preferred for performance)
    private String authorId;
}
```

## Repository Pattern

### Basic Repository
```java
public interface ProductRepository extends MongoRepository<Product, String> {

    // Derived queries
    List<Product> findByCategory(String category);
    List<Product> findByPriceLessThan(BigDecimal price);
    List<Product> findByCategoryAndPriceBetween(
        String category, BigDecimal min, BigDecimal max);

    // Sorting
    List<Product> findByCategoryOrderByPriceDesc(String category);

    // Limiting
    List<Product> findTop5ByCategoryOrderByPriceAsc(String category);

    // Exists/Count
    boolean existsByName(String name);
    long countByCategory(String category);
}
```

### @Query Annotation
```java
public interface ProductRepository extends MongoRepository<Product, String> {

    @Query("{ 'category': ?0, 'price': { $lte: ?1 } }")
    List<Product> findByCategoryWithMaxPrice(String category, BigDecimal maxPrice);

    @Query("{ 'tags': { $in: ?0 } }")
    List<Product> findByAnyTag(List<String> tags);

    @Query("{ 'name': { $regex: ?0, $options: 'i' } }")
    List<Product> searchByName(String keyword);

    // Projection
    @Query(value = "{ 'category': ?0 }", fields = "{ 'name': 1, 'price': 1 }")
    List<Product> findNameAndPriceByCategory(String category);
}
```

### Aggregation in Repository
```java
@Aggregation(pipeline = {
    "{ $match: { status: 'COMPLETED' } }",
    "{ $group: { _id: '$customerId', total: { $sum: '$amount' } } }",
    "{ $sort: { total: -1 } }",
    "{ $limit: 10 }"
})
List<CustomerTotal> findTopCustomers();
```

## MongoTemplate

### CRUD Operations
```java
@Service
@RequiredArgsConstructor
public class ProductService {
    private final MongoTemplate mongoTemplate;

    // Create
    public Product save(Product product) {
        return mongoTemplate.save(product);
    }

    // Insert (fails if exists)
    public Product insert(Product product) {
        return mongoTemplate.insert(product);
    }

    // Read
    public Product findById(String id) {
        return mongoTemplate.findById(id, Product.class);
    }

    public List<Product> findByCategory(String category) {
        Query query = Query.query(Criteria.where("category").is(category));
        return mongoTemplate.find(query, Product.class);
    }

    // Update
    public UpdateResult updatePrice(String id, BigDecimal price) {
        Query query = Query.query(Criteria.where("id").is(id));
        Update update = Update.update("price", price);
        return mongoTemplate.updateFirst(query, update, Product.class);
    }

    // Delete
    public DeleteResult delete(String id) {
        Query query = Query.query(Criteria.where("id").is(id));
        return mongoTemplate.remove(query, Product.class);
    }
}
```

### Complex Queries
```java
public List<Product> search(ProductFilter filter) {
    Query query = new Query();

    // Multiple criteria
    if (filter.getCategory() != null) {
        query.addCriteria(Criteria.where("category").is(filter.getCategory()));
    }

    if (filter.getMinPrice() != null && filter.getMaxPrice() != null) {
        query.addCriteria(Criteria.where("price")
            .gte(filter.getMinPrice())
            .lte(filter.getMaxPrice()));
    }

    // OR condition
    if (filter.getKeywords() != null) {
        query.addCriteria(new Criteria().orOperator(
            Criteria.where("name").regex(filter.getKeywords(), "i"),
            Criteria.where("description").regex(filter.getKeywords(), "i")
        ));
    }

    // Pagination
    query.with(PageRequest.of(filter.getPage(), filter.getSize()));

    // Sorting
    query.with(Sort.by(Sort.Direction.DESC, "createdAt"));

    // Projection
    query.fields().include("name", "price", "category");

    return mongoTemplate.find(query, Product.class);
}
```

## Aggregation Framework

### Basic Pipeline
```java
public List<CategoryStats> getCategoryStats() {
    Aggregation agg = Aggregation.newAggregation(
        Aggregation.match(Criteria.where("active").is(true)),
        Aggregation.group("category")
            .count().as("count")
            .avg("price").as("avgPrice")
            .sum("stock").as("totalStock"),
        Aggregation.sort(Sort.Direction.DESC, "count")
    );

    return mongoTemplate.aggregate(agg, "products", CategoryStats.class)
        .getMappedResults();
}
```

### Lookup (Join)
```java
Aggregation agg = Aggregation.newAggregation(
    Aggregation.lookup("users", "userId", "_id", "user"),
    Aggregation.unwind("user"),
    Aggregation.project()
        .andInclude("orderNumber", "total")
        .and("user.name").as("customerName")
);
```

### Unwind Arrays
```java
Aggregation agg = Aggregation.newAggregation(
    Aggregation.unwind("items"),
    Aggregation.group("items.productId")
        .sum("items.quantity").as("totalSold")
        .first("items.productName").as("productName"),
    Aggregation.sort(Sort.Direction.DESC, "totalSold"),
    Aggregation.limit(10)
);
```

## Indexes

### Annotations
```java
@Document(collection = "products")
@CompoundIndex(name = "category_price", def = "{'category': 1, 'price': -1}")
public class Product {

    @Indexed(unique = true)
    private String sku;

    @Indexed
    private String category;

    @TextIndexed(weight = 3)
    private String name;

    @TextIndexed
    private String description;

    @Indexed(expireAfter = "30d")
    private LocalDateTime expiresAt;
}
```

### Programmatic
```java
mongoTemplate.indexOps(Product.class).ensureIndex(
    new Index()
        .on("category", Sort.Direction.ASC)
        .on("price", Sort.Direction.DESC)
        .named("category_price_idx")
);
```

## Update Operations

### Update Operators
```java
Update update = new Update()
    .set("name", "New Name")
    .inc("viewCount", 1)
    .push("tags", "new-tag")
    .addToSet("categories", "electronics")
    .unset("deprecatedField")
    .currentDate("lastModified");

mongoTemplate.updateFirst(query, update, Product.class);
```

### Upsert
```java
mongoTemplate.upsert(query, update, Product.class);
```

### Bulk Operations
```java
BulkOperations bulkOps = mongoTemplate.bulkOps(BulkMode.ORDERED, Product.class);
products.forEach(p -> bulkOps.insert(p));
bulkOps.execute();
```

## Testing with Testcontainers

```java
@DataMongoTest
@Testcontainers
class ProductRepositoryTest {

    @Container
    @ServiceConnection
    static MongoDBContainer mongo = new MongoDBContainer("mongo:7.0");

    @Autowired
    private ProductRepository repository;

    @Test
    void shouldFindByCategory() {
        repository.save(new Product("Phone", "electronics", BigDecimal.valueOf(999)));

        List<Product> found = repository.findByCategory("electronics");

        assertThat(found).hasSize(1);
    }
}
```

## Common Query Methods

| Method | MongoDB Equivalent |
|--------|-------------------|
| `findByX(x)` | `{ x: x }` |
| `findByXAndY(x, y)` | `{ x: x, y: y }` |
| `findByXOrY(x, y)` | `{ $or: [{x: x}, {y: y}] }` |
| `findByXBetween(a, b)` | `{ x: { $gte: a, $lte: b } }` |
| `findByXLessThan(x)` | `{ x: { $lt: x } }` |
| `findByXIn(list)` | `{ x: { $in: list } }` |
| `findByXRegex(pattern)` | `{ x: { $regex: pattern } }` |
| `findByXExists(bool)` | `{ x: { $exists: bool } }` |

## When NOT to Use This Skill

- **Raw MongoDB driver** - Use `mongodb` skill for driver-level operations
- **Relational data** - Use `spring-data-jpa` or `spring-data-jdbc`
- **Full-text search focus** - Consider `spring-data-elasticsearch`
- **Graph relationships** - Use `spring-data-neo4j`

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Using @DBRef everywhere | N+1 queries, slow | Embed or manual references |
| Missing indexes | Slow queries | Add @Indexed, compound indexes |
| Fetching full documents | Wasted bandwidth | Use projections, fields() |
| Transactions without replica set | Transactions fail | Configure replica set |
| Documents > 16MB | Insert fails | Redesign, use GridFS for large files |
| Dynamic field types | Query issues | Use consistent schemas |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Connection refused | Check MongoDB running | Start MongoDB, check URI |
| Duplicate key error | Check @Id or unique index | Handle or use upsert |
| Query returns empty | Check field names | Verify @Field mapping matches DB |
| Slow aggregation | Check stages | Add $match early, use indexes |
| Transaction fails | Check replica set | Configure replica set or remove transaction |

## Reference Documentation
- [Spring Data MongoDB Reference](https://docs.spring.io/spring-data/mongodb/reference/)
