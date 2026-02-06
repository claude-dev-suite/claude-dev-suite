# Elasticsearch Advanced Patterns

## Aggregations

### Basic Aggregations

```typescript
const result = await client.search({
  index: 'products',
  body: {
    size: 0, // Only aggregations, no hits
    aggs: {
      // Terms aggregation (facets)
      categories: {
        terms: { field: 'category', size: 10 },
      },

      // Stats
      price_stats: {
        stats: { field: 'price' },
      },

      // Histogram
      price_ranges: {
        histogram: {
          field: 'price',
          interval: 100,
        },
      },

      // Date histogram
      sales_over_time: {
        date_histogram: {
          field: 'createdAt',
          calendar_interval: 'month',
        },
      },

      // Nested aggregation
      category_with_avg_price: {
        terms: { field: 'category' },
        aggs: {
          avg_price: { avg: { field: 'price' } },
        },
      },
    },
  },
});

console.log(result.aggregations);
```

### Filtered Aggregations

```typescript
const result = await client.search({
  index: 'products',
  body: {
    query: {
      bool: {
        filter: [{ term: { inStock: true } }],
      },
    },
    aggs: {
      filtered_categories: {
        terms: { field: 'category' },
      },
    },
  },
});
```

---

## Autocomplete / Suggestions

### Completion Suggester

```typescript
// Index with completion field
await client.indices.create({
  index: 'products',
  body: {
    mappings: {
      properties: {
        name: { type: 'text' },
        suggest: {
          type: 'completion',
          analyzer: 'simple',
          search_analyzer: 'simple',
        },
      },
    },
  },
});

// Index document
await client.index({
  index: 'products',
  body: {
    name: 'iPhone 15 Pro',
    suggest: {
      input: ['iPhone', 'iPhone 15', 'iPhone 15 Pro', 'Apple iPhone'],
      weight: 10,
    },
  },
});

// Search suggestions
const result = await client.search({
  index: 'products',
  body: {
    suggest: {
      product_suggest: {
        prefix: 'iph',
        completion: {
          field: 'suggest',
          size: 5,
          fuzzy: { fuzziness: 'AUTO' },
        },
      },
    },
  },
});
```

---

## Highlighting

```typescript
const result = await client.search({
  index: 'products',
  body: {
    query: {
      match: { description: 'smartphone' },
    },
    highlight: {
      fields: {
        description: {
          pre_tags: ['<em>'],
          post_tags: ['</em>'],
          fragment_size: 150,
        },
      },
    },
  },
});

// Access highlights
result.hits.hits.forEach((hit) => {
  console.log(hit.highlight?.description);
});
```

---

## Analyzers

```typescript
// Test analyzer
const analyzed = await client.indices.analyze({
  body: {
    analyzer: 'standard',
    text: 'The Quick Brown Fox',
  },
});

// Custom analyzer in index
{
  settings: {
    analysis: {
      analyzer: {
        my_analyzer: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding', 'snowball'],
        },
      },
      filter: {
        snowball: {
          type: 'snowball',
          language: 'English',
        },
      },
    },
  },
}
```

---

## Production Configuration

### Index Template

```typescript
await client.indices.putIndexTemplate({
  name: 'products_template',
  body: {
    index_patterns: ['products-*'],
    template: {
      settings: {
        number_of_shards: 3,
        number_of_replicas: 1,
        refresh_interval: '30s',
      },
      mappings: {
        properties: {
          // ... your mappings
        },
      },
    },
  },
});
```

### Index Lifecycle Management

```typescript
await client.ilm.putLifecycle({
  policy: 'products_policy',
  body: {
    policy: {
      phases: {
        hot: {
          min_age: '0ms',
          actions: {
            rollover: {
              max_size: '50GB',
              max_age: '30d',
            },
          },
        },
        warm: {
          min_age: '30d',
          actions: {
            shrink: { number_of_shards: 1 },
            forcemerge: { max_num_segments: 1 },
          },
        },
        delete: {
          min_age: '90d',
          actions: {
            delete: {},
          },
        },
      },
    },
  },
});
```

---

## Spring Data Elasticsearch

```java
@Document(indexName = "products")
public class Product {
    @Id
    private String id;

    @Field(type = FieldType.Text, analyzer = "standard")
    private String name;

    @Field(type = FieldType.Float)
    private Float price;

    @Field(type = FieldType.Keyword)
    private String category;
}

@Repository
public interface ProductRepository extends ElasticsearchRepository<Product, String> {
    List<Product> findByName(String name);
    List<Product> findByPriceBetween(Float min, Float max);

    @Query("{\"match\": {\"name\": \"?0\"}}")
    List<Product> searchByName(String name);
}
```

---

## Performance Tips

| Optimization | Recommendation |
|--------------|----------------|
| Bulk indexing | Batch 5000-15000 docs |
| Refresh interval | 30s in production |
| Replicas during index | Set to 0, restore after |
| Mapping | Explicit, not dynamic |
| Shards | 1 shard per 50GB |

## Monitoring Metrics

| Metric | Target |
|--------|--------|
| Search latency | < 100ms p99 |
| Indexing rate | Depends on use case |
| JVM heap | < 75% |
| Disk usage | < 80% |
