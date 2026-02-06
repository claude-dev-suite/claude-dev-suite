---
name: elasticsearch
description: |
  Elasticsearch search and analytics engine. Full-text search, aggregations, document store.
  Use when implementing search functionality or log analytics.

  USE WHEN: user mentions "elasticsearch", "full-text search", "search indexing", "log analytics",
  "ELK stack", "aggregations", "faceted search", "autocomplete", "suggestions"

  DO NOT USE FOR: primary database - use `postgresql` or `mongodb` instead,
  caching - use `redis` instead, ACID transactions - use SQL databases instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Elasticsearch - Quick Reference

> **Full Reference**: See [advanced.md](advanced.md) for aggregations, autocomplete/suggestions, highlighting, custom analyzers, index templates, ILM, and Spring Data Elasticsearch.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `elasticsearch` for comprehensive documentation.

## Setup

```bash
# Docker
docker run -d --name elasticsearch \
  -p 9200:9200 -p 9300:9300 \
  -e "discovery.type=single-node" \
  -e "xpack.security.enabled=false" \
  elasticsearch:8.12.0
```

```yaml
# docker-compose.yml
services:
  elasticsearch:
    image: elasticsearch:8.12.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    ports:
      - "9200:9200"
    volumes:
      - esdata:/usr/share/elasticsearch/data

volumes:
  esdata:
```

## Node.js Client

```bash
npm install @elastic/elasticsearch
```

```typescript
import { Client } from '@elastic/elasticsearch';

const client = new Client({
  node: 'http://localhost:9200',
  // With authentication
  // auth: { username: 'elastic', password: 'password' }
});

// Health check
const health = await client.cluster.health();
console.log(health);
```

---

## Index Management

### Create Index

```typescript
await client.indices.create({
  index: 'products',
  body: {
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
      analysis: {
        analyzer: {
          custom_analyzer: {
            type: 'custom',
            tokenizer: 'standard',
            filter: ['lowercase', 'asciifolding'],
          },
        },
      },
    },
    mappings: {
      properties: {
        name: {
          type: 'text',
          analyzer: 'custom_analyzer',
          fields: {
            keyword: { type: 'keyword' },
          },
        },
        description: { type: 'text' },
        price: { type: 'float' },
        category: { type: 'keyword' },
        tags: { type: 'keyword' },
        inStock: { type: 'boolean' },
        createdAt: { type: 'date' },
        location: { type: 'geo_point' },
      },
    },
  },
});
```

### Index Operations

```typescript
// Check if exists
const exists = await client.indices.exists({ index: 'products' });

// Get mapping
const mapping = await client.indices.getMapping({ index: 'products' });

// Update mapping (add fields only)
await client.indices.putMapping({
  index: 'products',
  body: {
    properties: {
      newField: { type: 'keyword' },
    },
  },
});

// Delete index
await client.indices.delete({ index: 'products' });

// Reindex
await client.reindex({
  body: {
    source: { index: 'products' },
    dest: { index: 'products_v2' },
  },
});
```

---

## Document Operations

### CRUD

```typescript
// Index document
await client.index({
  index: 'products',
  id: '1', // optional, auto-generated if not provided
  body: {
    name: 'iPhone 15',
    description: 'Latest Apple smartphone',
    price: 999.99,
    category: 'electronics',
    tags: ['phone', 'apple', 'smartphone'],
    inStock: true,
    createdAt: new Date(),
  },
});

// Get document
const doc = await client.get({ index: 'products', id: '1' });

// Update document
await client.update({
  index: 'products',
  id: '1',
  body: {
    doc: { price: 899.99, inStock: false },
  },
});

// Delete document
await client.delete({ index: 'products', id: '1' });
```

### Bulk Operations

```typescript
const products = [
  { name: 'Product 1', price: 10 },
  { name: 'Product 2', price: 20 },
  { name: 'Product 3', price: 30 },
];

const body = products.flatMap((doc, i) => [
  { index: { _index: 'products', _id: String(i + 1) } },
  doc,
]);

const { body: bulkResponse } = await client.bulk({ body, refresh: true });

if (bulkResponse.errors) {
  const erroredDocuments = bulkResponse.items.filter(
    (item: any) => item.index?.error
  );
  console.error('Bulk errors:', erroredDocuments);
}
```

---

## Search

### Basic Search

```typescript
const result = await client.search({
  index: 'products',
  body: {
    query: {
      match: { name: 'iphone' },
    },
  },
});

console.log(result.hits.hits); // Array of matching documents
console.log(result.hits.total); // Total count
```

### Query Types

```typescript
// Match (full-text search)
{ match: { name: 'iphone pro' } }

// Match phrase
{ match_phrase: { name: 'iphone pro' } }

// Multi-match (search multiple fields)
{
  multi_match: {
    query: 'iphone',
    fields: ['name^2', 'description'],  // name has 2x weight
  }
}

// Term (exact match for keywords)
{ term: { category: 'electronics' } }

// Terms (multiple exact values)
{ terms: { category: ['electronics', 'phones'] } }

// Range
{ range: { price: { gte: 100, lte: 500 } } }

// Bool (combine queries)
{
  bool: {
    must: [{ match: { name: 'iphone' } }],
    filter: [
      { term: { inStock: true } },
      { range: { price: { lte: 1000 } } }
    ],
    should: [{ term: { category: 'electronics' } }],
    must_not: [{ term: { category: 'refurbished' } }],
    minimum_should_match: 1
  }
}

// Wildcard
{ wildcard: { name: 'iph*' } }

// Fuzzy (typo tolerance)
{ fuzzy: { name: { value: 'iphne', fuzziness: 'AUTO' } } }

// Prefix
{ prefix: { name: 'iph' } }
```

### Pagination & Sorting

```typescript
const result = await client.search({
  index: 'products',
  body: {
    from: 0,
    size: 10,
    query: { match_all: {} },
    sort: [
      { price: 'asc' },
      { createdAt: 'desc' },
      '_score',
    ],
    _source: ['name', 'price', 'category'], // Select fields
  },
});
```

### Search After (for deep pagination)

```typescript
// First page
const firstPage = await client.search({
  index: 'products',
  body: {
    size: 10,
    query: { match_all: {} },
    sort: [{ createdAt: 'desc' }, { _id: 'asc' }],
  },
});

// Next page (use sort values from last hit)
const lastHit = firstPage.hits.hits[firstPage.hits.hits.length - 1];
const nextPage = await client.search({
  index: 'products',
  body: {
    size: 10,
    query: { match_all: {} },
    sort: [{ createdAt: 'desc' }, { _id: 'asc' }],
    search_after: lastHit.sort,
  },
});
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Dynamic mapping in production | Schema drift, type conflicts | Define explicit mappings |
| Deep pagination with from/size | Memory issues, slow queries | Use search_after or scroll |
| No index lifecycle management | Disk space exhaustion | Configure ILM policies |
| Wildcard queries starting with * | Very slow, full index scan | Avoid or use ngrams |
| Storing everything in _source | Disk waste | Use _source filtering |
| No refresh interval tuning | Index lag or performance issues | Set 30s for production |
| Missing replicas | Data loss risk, no HA | Configure at least 1 replica |

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

## Checklist

- [ ] Explicit mapping defined
- [ ] Analyzers configured for language
- [ ] Index template for patterns
- [ ] ILM policy for retention
- [ ] Replicas configured
- [ ] Monitoring active

## When NOT to Use This Skill

- **Primary database** - Use `postgresql` or `mongodb` for transactional data
- **Caching** - Use `redis` for session storage and caching
- **ACID transactions** - Elasticsearch is eventual consistency, use SQL for strong consistency
- **Small datasets** - Overhead not justified for <100K documents
- **Real-time updates** - Near-real-time (1s delay by default), use websockets if needed

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Cluster yellow/red | `GET _cluster/health` | Check shard allocation, disk space |
| Slow searches | `GET _search?explain=true` | Add caching, optimize queries |
| Out of memory | Check JVM heap usage | Increase heap, reduce field data cache |
| Index not updating | Check refresh_interval | Force refresh or wait for interval |
| Mapping conflicts | `GET index/_mapping` | Reindex with correct mapping |
| High disk usage | `GET _cat/indices?v` | Configure ILM, delete old indices |

## Reference Documentation

- [Elasticsearch Docs](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)
