# DatabaseClient for Complex Queries

## Dynamic Query Building

```java
@Repository
@RequiredArgsConstructor
public class ProductCustomRepository {

    private final DatabaseClient databaseClient;

    // Query con parametri dinamici
    public Flux<Product> searchWithFilters(ProductSearchCriteria criteria) {
        StringBuilder sql = new StringBuilder("SELECT * FROM products WHERE 1=1");
        Map<String, Object> params = new HashMap<>();

        if (criteria.name() != null) {
            sql.append(" AND product_name ILIKE :name");
            params.put("name", "%" + criteria.name() + "%");
        }
        if (criteria.categoryId() != null) {
            sql.append(" AND category_id = :categoryId");
            params.put("categoryId", criteria.categoryId());
        }
        if (criteria.minPrice() != null) {
            sql.append(" AND price >= :minPrice");
            params.put("minPrice", criteria.minPrice());
        }
        if (criteria.maxPrice() != null) {
            sql.append(" AND price <= :maxPrice");
            params.put("maxPrice", criteria.maxPrice());
        }
        if (criteria.active() != null) {
            sql.append(" AND active = :active");
            params.put("active", criteria.active());
        }

        sql.append(" ORDER BY created_at DESC");

        if (criteria.limit() != null) {
            sql.append(" LIMIT :limit");
            params.put("limit", criteria.limit());
        }

        DatabaseClient.GenericExecuteSpec spec = databaseClient.sql(sql.toString());
        for (Map.Entry<String, Object> entry : params.entrySet()) {
            spec = spec.bind(entry.getKey(), entry.getValue());
        }

        return spec.map((row, metadata) -> mapToProduct(row)).all();
    }

    private Product mapToProduct(io.r2dbc.spi.Row row) {
        Product product = new Product();
        product.setId(row.get("id", Long.class));
        product.setName(row.get("product_name", String.class));
        product.setDescription(row.get("description", String.class));
        product.setPrice(row.get("price", BigDecimal.class));
        product.setCategoryId(row.get("category_id", Long.class));
        product.setCreatedAt(row.get("created_at", Instant.class));
        product.setUpdatedAt(row.get("updated_at", Instant.class));
        product.setActive(row.get("active", Boolean.class));
        return product;
    }
}

public record ProductSearchCriteria(
    String name,
    Long categoryId,
    BigDecimal minPrice,
    BigDecimal maxPrice,
    Boolean active,
    Integer limit
) {}
```

---

## Insert with RETURNING

```java
public Mono<Product> insertReturning(Product product) {
    return databaseClient.sql("""
            INSERT INTO products (product_name, description, price, category_id, active, created_at)
            VALUES (:name, :description, :price, :categoryId, :active, :createdAt)
            RETURNING *
            """)
        .bind("name", product.getName())
        .bind("description", product.getDescription())
        .bind("price", product.getPrice())
        .bind("categoryId", product.getCategoryId())
        .bind("active", product.isActive())
        .bind("createdAt", Instant.now())
        .map((row, metadata) -> mapToProduct(row))
        .one();
}
```

---

## Aggregations

```java
public Mono<CategoryStats> getCategoryStats(Long categoryId) {
    return databaseClient.sql("""
            SELECT
                COUNT(*) as product_count,
                AVG(price) as avg_price,
                MIN(price) as min_price,
                MAX(price) as max_price
            FROM products
            WHERE category_id = :categoryId AND active = true
            """)
        .bind("categoryId", categoryId)
        .map((row, metadata) -> new CategoryStats(
            row.get("product_count", Long.class),
            row.get("avg_price", BigDecimal.class),
            row.get("min_price", BigDecimal.class),
            row.get("max_price", BigDecimal.class)
        ))
        .one();
}

public record CategoryStats(
    Long productCount,
    BigDecimal avgPrice,
    BigDecimal minPrice,
    BigDecimal maxPrice
) {}
```

---

## Batch Operations

```java
public Mono<Long> batchInsert(List<Product> products) {
    if (products.isEmpty()) {
        return Mono.just(0L);
    }

    StringBuilder sql = new StringBuilder(
        "INSERT INTO products (product_name, description, price, category_id, active) VALUES ");

    List<String> valuePlaceholders = new ArrayList<>();
    Map<String, Object> params = new HashMap<>();

    for (int i = 0; i < products.size(); i++) {
        Product p = products.get(i);
        valuePlaceholders.add(String.format(
            "(:name%d, :desc%d, :price%d, :cat%d, :active%d)", i, i, i, i, i));
        params.put("name" + i, p.getName());
        params.put("desc" + i, p.getDescription());
        params.put("price" + i, p.getPrice());
        params.put("cat" + i, p.getCategoryId());
        params.put("active" + i, p.isActive());
    }

    sql.append(String.join(", ", valuePlaceholders));

    DatabaseClient.GenericExecuteSpec spec = databaseClient.sql(sql.toString());
    for (Map.Entry<String, Object> entry : params.entrySet()) {
        spec = spec.bind(entry.getKey(), entry.getValue());
    }

    return spec.fetch().rowsUpdated();
}
```

---

## Upsert (ON CONFLICT)

```java
public Mono<Product> upsert(Product product) {
    return databaseClient.sql("""
            INSERT INTO products (id, product_name, description, price, category_id, active)
            VALUES (:id, :name, :description, :price, :categoryId, :active)
            ON CONFLICT (id) DO UPDATE SET
                product_name = EXCLUDED.product_name,
                description = EXCLUDED.description,
                price = EXCLUDED.price,
                category_id = EXCLUDED.category_id,
                updated_at = NOW()
            RETURNING *
            """)
        .bind("id", product.getId())
        .bind("name", product.getName())
        .bind("description", product.getDescription())
        .bind("price", product.getPrice())
        .bind("categoryId", product.getCategoryId())
        .bind("active", product.isActive())
        .map((row, metadata) -> mapToProduct(row))
        .one();
}
```
