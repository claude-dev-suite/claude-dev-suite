---
name: spring-data-elasticsearch
description: |
  Spring Data Elasticsearch for full-text search and analytics.
  Covers ElasticsearchOperations, repositories, aggregations, and index management.

  USE WHEN: user mentions "spring data elasticsearch", "ElasticsearchRepository",
  "ElasticsearchOperations", "@Document elasticsearch", "Spring Boot Elasticsearch"

  DO NOT USE FOR: raw Elasticsearch queries - use `elasticsearch` instead,
  ELK stack setup - use `elasticsearch` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Spring Data Elasticsearch - Quick Reference

> **Full Reference**: See [advanced.md](advanced.md) for aggregations, autocomplete/suggestions, bulk operations, index management, and Testcontainers integration.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `spring-data-elasticsearch` for comprehensive documentation.

## Dependencies

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-elasticsearch</artifactId>
</dependency>
```

## Configuration

```yaml
spring:
  elasticsearch:
    uris: http://localhost:9200
    username: ${ELASTICSEARCH_USERNAME:}
    password: ${ELASTICSEARCH_PASSWORD:}
    connection-timeout: 5s
    socket-timeout: 30s
```

## Document Mapping

```java
@Document(indexName = "products")
public class Product {

    @Id
    private String id;

    @Field(type = FieldType.Text, analyzer = "standard")
    private String name;

    @Field(type = FieldType.Text, analyzer = "standard")
    private String description;

    @Field(type = FieldType.Keyword)
    private String category;

    @Field(type = FieldType.Double)
    private BigDecimal price;

    @Field(type = FieldType.Integer)
    private Integer stock;

    @Field(type = FieldType.Boolean)
    private boolean active;

    @Field(type = FieldType.Date, format = DateFormat.date_hour_minute_second)
    private LocalDateTime createdAt;

    @Field(type = FieldType.Nested)
    private List<ProductAttribute> attributes;

    @Field(type = FieldType.Keyword)
    private List<String> tags;
}
```

## Repository Pattern

```java
public interface ProductRepository extends ElasticsearchRepository<Product, String> {

    List<Product> findByCategory(String category);
    List<Product> findByNameContaining(String name);
    List<Product> findByPriceBetween(BigDecimal min, BigDecimal max);
    List<Product> findByActiveTrue();

    // Pagination
    Page<Product> findByCategory(String category, Pageable pageable);

    // Sorting
    List<Product> findByCategoryOrderByPriceAsc(String category);

    // Count / Exists / Delete
    long countByCategory(String category);
    boolean existsByName(String name);
    void deleteByCategory(String category);
}
```

### Custom Queries
```java
public interface ProductRepository extends ElasticsearchRepository<Product, String> {

    @Query("""
        {
          "multi_match": {
            "query": "?0",
            "fields": ["name^3", "description", "tags"],
            "type": "best_fields",
            "fuzziness": "AUTO"
          }
        }
        """)
    Page<Product> fullTextSearch(String query, Pageable pageable);
}
```

## ElasticsearchOperations

```java
@Service
@RequiredArgsConstructor
public class ProductSearchService {

    private final ElasticsearchOperations elasticsearchOperations;

    public SearchHits<Product> search(ProductSearchCriteria criteria) {
        BoolQuery.Builder boolQuery = new BoolQuery.Builder();

        if (StringUtils.hasText(criteria.getQuery())) {
            boolQuery.must(MultiMatchQuery.of(m -> m
                .query(criteria.getQuery())
                .fields("name^3", "description", "tags")
                .fuzziness("AUTO")
            )._toQuery());
        }

        if (StringUtils.hasText(criteria.getCategory())) {
            boolQuery.filter(TermQuery.of(t -> t
                .field("category")
                .value(criteria.getCategory())
            )._toQuery());
        }

        NativeQuery query = NativeQuery.builder()
            .withQuery(boolQuery.build()._toQuery())
            .withPageable(PageRequest.of(criteria.getPage(), criteria.getSize()))
            .build();

        return elasticsearchOperations.search(query, Product.class);
    }
}
```

## Best Practices

| Do | Don't |
|----|-------|
| Use appropriate field types | Map everything as text |
| Define proper analyzers | Use default for all |
| Use filters for exact matches | Use match for keywords |
| Paginate large result sets | Fetch all documents at once |

## When NOT to Use This Skill

- **Raw Elasticsearch API** - Use `elasticsearch` skill for REST API
- **ELK stack setup** - Use `elasticsearch` skill
- **Primary database** - Elasticsearch is for search, not ACID transactions

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Refresh after each write | Performance degradation | Use refresh_interval, batch |
| Deep pagination with from/size | Memory issues | Use search_after |
| Mapping all as text | Poor search, high disk | Use appropriate field types |
| No index lifecycle | Disk exhaustion | Configure ILM policies |
| Fetching all fields | Wasted bandwidth | Use source filtering |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Connection failed | Check Elasticsearch running | Start ES, check URI, SSL |
| Index not found | Check index name | Create index, check @Document |
| Mapping conflict | Check field types | Reindex with correct mapping |
| Search returns nothing | Check analyzer | Test with _analyze API |
| Version conflict | Check @Version | Handle OptimisticLockingFailureException |

## Production Checklist

- [ ] Cluster configured (3+ nodes)
- [ ] Shards and replicas set
- [ ] Index lifecycle management
- [ ] Proper mapping defined
- [ ] Analyzers configured
- [ ] Bulk operations for indexing
- [ ] Monitoring enabled
- [ ] Security enabled

## Reference Documentation
- [Spring Data Elasticsearch Reference](https://docs.spring.io/spring-data/elasticsearch/reference/)
