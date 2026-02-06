# Spring Data Elasticsearch Advanced Patterns

## Aggregations

```java
public Map<String, Long> getCategoryStats() {
    NativeQuery query = NativeQuery.builder()
        .withQuery(MatchAllQuery.of(m -> m)._toQuery())
        .withAggregation("categories", Aggregation.of(a -> a
            .terms(t -> t.field("category").size(100))
        ))
        .withMaxResults(0)  // Don't need hits
        .build();

    SearchHits<Product> searchHits = elasticsearchOperations.search(query, Product.class);

    ElasticsearchAggregations aggregations =
        (ElasticsearchAggregations) searchHits.getAggregations();

    return aggregations.get("categories").aggregation().getAggregate()
        .sterms().buckets().array().stream()
        .collect(Collectors.toMap(
            b -> b.key().stringValue(),
            StringTermsBucket::docCount
        ));
}

public Map<String, Object> getPriceStats(String category) {
    NativeQuery query = NativeQuery.builder()
        .withQuery(TermQuery.of(t -> t.field("category").value(category))._toQuery())
        .withAggregation("price_stats", Aggregation.of(a -> a
            .stats(s -> s.field("price"))
        ))
        .withAggregation("price_histogram", Aggregation.of(a -> a
            .histogram(h -> h.field("price").interval(100.0))
        ))
        .withMaxResults(0)
        .build();

    SearchHits<Product> searchHits = elasticsearchOperations.search(query, Product.class);

    // Process aggregations
    return Map.of(
        "stats", aggregations.get("price_stats"),
        "histogram", aggregations.get("price_histogram")
    );
}
```

## Autocomplete / Suggestions

```java
@Service
public class AutocompleteService {

    private final ElasticsearchOperations elasticsearchOperations;

    public List<String> getSuggestions(String prefix, int size) {
        NativeQuery query = NativeQuery.builder()
            .withSuggester(Suggester.of(s -> s
                .suggesters("product-suggest", fs -> fs
                    .prefix(prefix)
                    .completion(cs -> cs
                        .field("suggest")
                        .size(size)
                        .skipDuplicates(true)
                    )
                )
            ))
            .build();

        SearchHits<Product> searchHits = elasticsearchOperations.search(query, Product.class);

        // Extract suggestions
        return searchHits.getSuggest().getSuggestion("product-suggest")
            .getEntries().stream()
            .flatMap(entry -> entry.getOptions().stream())
            .map(option -> option.getText())
            .toList();
    }

    // Save product with suggestions
    public void saveWithSuggestions(Product product) {
        Completion suggest = new Completion(
            List.of(product.getName(), product.getBrand())
        );
        suggest.setWeight(product.getStock()); // Higher stock = higher weight
        product.setSuggest(suggest);

        elasticsearchOperations.save(product);
    }
}
```

## Bulk Operations

```java
public void bulkIndex(List<Product> products) {
    List<IndexQuery> queries = products.stream()
        .map(product -> new IndexQueryBuilder()
            .withId(product.getId())
            .withObject(product)
            .build())
        .toList();

    elasticsearchOperations.bulkIndex(queries, Product.class);
    elasticsearchOperations.indexOps(Product.class).refresh();
}

public void bulkUpdate(List<Product> products) {
    List<UpdateQuery> queries = products.stream()
        .map(product -> UpdateQuery.builder(product.getId())
            .withDocument(Document.from(Map.of(
                "price", product.getPrice(),
                "stock", product.getStock()
            )))
            .build())
        .toList();

    elasticsearchOperations.bulkUpdate(queries, Product.class);
}
```

## Index Management

```java
@Service
@RequiredArgsConstructor
public class IndexManagementService {

    private final ElasticsearchOperations elasticsearchOperations;

    public void createIndex(Class<?> clazz) {
        IndexOperations indexOps = elasticsearchOperations.indexOps(clazz);
        if (!indexOps.exists()) {
            indexOps.create();
            indexOps.putMapping();
        }
    }

    public void deleteIndex(Class<?> clazz) {
        IndexOperations indexOps = elasticsearchOperations.indexOps(clazz);
        if (indexOps.exists()) {
            indexOps.delete();
        }
    }

    public void reindex(Class<?> clazz) {
        deleteIndex(clazz);
        createIndex(clazz);
    }

    public void refreshIndex(Class<?> clazz) {
        elasticsearchOperations.indexOps(clazz).refresh();
    }
}
```

## Highlighting

```java
public SearchHits<Product> searchWithHighlight(String searchTerm) {
    NativeQuery query = NativeQuery.builder()
        .withQuery(MultiMatchQuery.of(m -> m
            .query(searchTerm)
            .fields("name", "description")
        )._toQuery())
        .withHighlightQuery(new HighlightQuery(
            new Highlight(List.of(
                new HighlightField("name"),
                new HighlightField("description")
            )),
            Product.class
        ))
        .build();

    return elasticsearchOperations.search(query, Product.class);
}
```

## Testcontainers Integration

```java
@SpringBootTest
@Testcontainers
class ElasticsearchIntegrationTest {

    @Container
    @ServiceConnection
    static ElasticsearchContainer elasticsearch =
        new ElasticsearchContainer("docker.elastic.co/elasticsearch/elasticsearch:8.11.0")
            .withEnv("xpack.security.enabled", "false");

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ElasticsearchOperations elasticsearchOperations;

    @BeforeEach
    void setUp() {
        elasticsearchOperations.indexOps(Product.class).refresh();
    }

    @Test
    void shouldIndexAndSearch() {
        Product product = new Product();
        product.setId("1");
        product.setName("Test Product");
        product.setCategory("electronics");

        productRepository.save(product);
        elasticsearchOperations.indexOps(Product.class).refresh();

        List<Product> found = productRepository.findByCategory("electronics");
        assertThat(found).hasSize(1);
    }
}
```

## Advanced Search Service

```java
@Service
@RequiredArgsConstructor
public class ProductSearchService {

    private final ElasticsearchOperations elasticsearchOperations;

    public SearchHits<Product> search(ProductSearchCriteria criteria) {
        BoolQuery.Builder boolQuery = new BoolQuery.Builder();

        // Full-text search
        if (StringUtils.hasText(criteria.getQuery())) {
            boolQuery.must(MultiMatchQuery.of(m -> m
                .query(criteria.getQuery())
                .fields("name^3", "description", "tags")
                .fuzziness("AUTO")
            )._toQuery());
        }

        // Filters
        if (StringUtils.hasText(criteria.getCategory())) {
            boolQuery.filter(TermQuery.of(t -> t
                .field("category")
                .value(criteria.getCategory())
            )._toQuery());
        }

        if (criteria.getMinPrice() != null) {
            boolQuery.filter(RangeQuery.of(r -> r
                .field("price")
                .gte(JsonData.of(criteria.getMinPrice()))
            )._toQuery());
        }

        if (criteria.getMaxPrice() != null) {
            boolQuery.filter(RangeQuery.of(r -> r
                .field("price")
                .lte(JsonData.of(criteria.getMaxPrice()))
            )._toQuery());
        }

        // Active only
        boolQuery.filter(TermQuery.of(t -> t
            .field("active")
            .value(true)
        )._toQuery());

        NativeQuery query = NativeQuery.builder()
            .withQuery(boolQuery.build()._toQuery())
            .withPageable(PageRequest.of(criteria.getPage(), criteria.getSize()))
            .withSort(Sort.by(Sort.Direction.DESC, "createdAt"))
            .build();

        return elasticsearchOperations.search(query, Product.class);
    }
}
```

## Custom Queries in Repository

```java
public interface ProductRepository extends ElasticsearchRepository<Product, String> {

    @Query("""
        {
          "bool": {
            "must": [
              { "match": { "name": "?0" } }
            ],
            "filter": [
              { "term": { "category": "?1" } },
              { "range": { "price": { "lte": ?2 } } }
            ]
          }
        }
        """)
    List<Product> searchByNameAndCategoryWithMaxPrice(String name, String category, BigDecimal maxPrice);

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
