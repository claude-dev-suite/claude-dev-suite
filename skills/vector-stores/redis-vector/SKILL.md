---
name: redis-vector
description: |
  Redis Stack vector search. FT.CREATE with VECTOR field, HNSW vs FLAT, hybrid with
  other field types, RedisVL Python library, Redis Enterprise scaling, pipelines for
  bulk ingest, TTL for ephemeral vectors (cache use case), Redis JSON + vectors pattern.

  USE WHEN: user mentions "Redis vector", "Redis Stack", "FT.CREATE", "RedisVL",
  "Redis HNSW", "Redis JSON vector", "semantic cache Redis"

  DO NOT USE FOR: other vector stores - use `vector-stores/*` siblings; embedding
  caching theory - use `rag/caching-retrieval`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Redis Vector Search

## When Redis Is the Right Choice

Redis is the correct default vector store when:

- Your stack already uses Redis for cache / session / queue.
- You need sub-10ms p95 on modest corpus sizes (< 10M vectors).
- Vectors live alongside hot transactional data (user profiles, product records).
- You want a single system for semantic cache *and* knowledge retrieval.

Redis is a poor fit for:

- Billions of vectors — RAM cost becomes prohibitive vs DiskANN stores.
- Long-term archival storage with infrequent reads.
- Analytics-style scans without ID-based access patterns.

## Redis Stack vs OSS Redis

Vector search requires the `search` module (`RediSearch` 2.4+). It ships with:

- Redis Stack (local dev, Docker, `redis/redis-stack:latest`)
- Redis Enterprise (managed, scales horizontally)
- Redis Cloud (fully managed Enterprise)

Plain `redis:latest` OSS has no search module. Attempt `FT.CREATE` on it and you get "unknown command".

## FT.CREATE with VECTOR Field

```python
# pip install redis>=5
import redis
from redis.commands.search.field import VectorField, TagField, NumericField, TextField
from redis.commands.search.indexDefinition import IndexDefinition, IndexType

r = redis.Redis(host="localhost", port=6379, decode_responses=False)

schema = (
    VectorField(
        "vector",
        "HNSW",
        {
            "TYPE": "FLOAT32",
            "DIM": 1024,
            "DISTANCE_METRIC": "COSINE",
            "M": 16,
            "EF_CONSTRUCTION": 200,
            "EF_RUNTIME": 10,
        },
    ),
    TagField("tenant_id"),
    TagField("source"),
    NumericField("created_at"),
    TextField("text"),
)

r.ft("idx:docs").create_index(
    fields=schema,
    definition=IndexDefinition(prefix=["doc:"], index_type=IndexType.HASH),
)
```

The index watches any key starting with `doc:` — insert data with those prefixes and it gets indexed automatically.

## HNSW vs FLAT

| Index | Use case | Build time | Memory | Recall |
|---|---|---|---|---|
| FLAT | < 10k vectors, exact search | Instant | 1x | 100% |
| HNSW | 10k - 10M vectors, approximate | Slow insert | ~1.2x | 95-99% |

Parameters:

- `M` (default 16): connections per node. Higher = better recall, more RAM.
- `EF_CONSTRUCTION` (200): build-time search width. Higher = better index, slower ingest.
- `EF_RUNTIME` (10): query-time search width. Higher = better recall, slower query.

Tune `EF_RUNTIME` per query if different clients have different recall/latency needs — pass via `$EF_RUNTIME` in the query.

## Insert via Hash Pattern

```python
def insert(doc_id: str, vector: np.ndarray, tenant_id: str, source: str, text: str):
    key = f"doc:{doc_id}"
    r.hset(key, mapping={
        "vector": vector.astype("float32").tobytes(),
        "tenant_id": tenant_id,
        "source": source,
        "created_at": int(time.time()),
        "text": text,
    })

insert("d1", dense_vec, "acme", "kb", "OAuth uses refresh tokens.")
```

Vectors are stored as raw FLOAT32 bytes — not JSON, not base64.

## Query

```python
from redis.commands.search.query import Query
import numpy as np

q_bytes = q_vec.astype("float32").tobytes()

q = (
    Query("(@tenant_id:{acme} @source:{kb|faq})=>[KNN 10 @vector $BLOB AS score]")
    .sort_by("score")
    .return_fields("score", "text", "source")
    .paging(0, 10)
    .dialect(2)
)

results = r.ft("idx:docs").search(q, query_params={"BLOB": q_bytes})
for doc in results.docs:
    print(doc.score, doc.text)
```

The `(...)` pre-filter runs first (tag index), then KNN over the filtered subset — true pre-filtering.

## Hybrid with Text + Vector

```python
q = (
    Query("@text:(oauth refresh token) @tenant_id:{acme}=>[KNN 10 @vector $BLOB AS score]")
    .dialect(2)
)
```

`@text:(...)` uses Redis's built-in tokenizer + stemmer. Combine with KNN for a keyword-filtered semantic search.

For full hybrid retrieval (BM25 + vector fusion) use RedisVL's hybrid query below.

## RedisVL (Higher-Level Client)

```python
# pip install redisvl
from redisvl.index import SearchIndex
from redisvl.schema import IndexSchema
from redisvl.query import VectorQuery, FilterQuery
from redisvl.query.filter import Tag, Num

schema = IndexSchema.from_dict({
    "index": {"name": "docs", "prefix": "doc:", "storage_type": "hash"},
    "fields": [
        {"name": "text", "type": "text"},
        {"name": "tenant_id", "type": "tag"},
        {"name": "created_at", "type": "numeric"},
        {"name": "vector", "type": "vector",
         "attrs": {"dims": 1024, "algorithm": "hnsw", "distance_metric": "cosine"}},
    ],
})

index = SearchIndex(schema, r)
index.create(overwrite=False)

filt = (Tag("tenant_id") == "acme") & (Num("created_at") > 1700000000)
q = VectorQuery(vector=q_vec.tolist(), vector_field_name="vector",
                return_fields=["text", "source"], num_results=10, filter_expression=filt)
results = index.query(q)
```

RedisVL adds typed schemas, Pydantic-style filter expressions, and semantic cache / LLM session primitives.

## Semantic Cache Pattern

Redis's native fit: cache LLM responses keyed by query embedding. Vector similarity check -> reuse answer.

```python
from redisvl.extensions.llmcache import SemanticCache

cache = SemanticCache(
    name="llmcache",
    redis_url="redis://localhost:6379",
    distance_threshold=0.1,
    ttl=3600,            # entries expire in 1h
)

hit = cache.check(prompt="What is OAuth PKCE?")
if hit:
    answer = hit[0]["response"]
else:
    answer = call_llm("What is OAuth PKCE?")
    cache.store(prompt="What is OAuth PKCE?", response=answer)
```

Distance threshold tuning: too tight and cache misses dominate; too loose and wrong answers return. Start at 0.1 for cosine and calibrate.

## Ephemeral Vectors with TTL

```python
# TTL applies to the whole hash, vector included
r.hset("doc:session:abc", mapping={"vector": q_bytes, "user": "u123"})
r.expire("doc:session:abc", 900)   # 15 minutes
```

The index tracks the key; when it expires, the vector is dropped from the index. Useful for session memory, short-term recommendations, user-scoped caches.

## Redis JSON + Vectors

```python
from redis.commands.search.field import VectorField
from redis.commands.search.indexDefinition import IndexDefinition, IndexType

r.ft("idx:json").create_index(
    fields=(
        VectorField("$.vector", "HNSW",
                    {"TYPE": "FLOAT32", "DIM": 1024, "DISTANCE_METRIC": "COSINE"},
                    as_name="vector"),
        TagField("$.tenant_id", as_name="tenant_id"),
    ),
    definition=IndexDefinition(prefix=["doc:"], index_type=IndexType.JSON),
)

r.json().set("doc:d1", "$", {
    "vector": dense_vec.tolist(),
    "tenant_id": "acme",
    "metadata": {"source": "kb", "authors": ["alice", "bob"]},
})
```

JSON lets you nest arbitrary metadata; hash is faster for pure vector + flat fields. Pick hash for speed unless nested structure matters.

## Pipelines for Bulk Ingest

```python
def bulk_insert(items: list[dict], batch: int = 500):
    pipe = r.pipeline(transaction=False)
    for i, it in enumerate(items):
        pipe.hset(f"doc:{it['id']}", mapping={
            "vector": it["vec"].astype("float32").tobytes(),
            "tenant_id": it["tenant_id"],
            "text": it["text"],
        })
        if (i + 1) % batch == 0:
            pipe.execute()
    pipe.execute()
```

`transaction=False` is essential for throughput — otherwise Redis wraps the batch in MULTI/EXEC which serializes. Expect 10-50k inserts/sec per connection.

## Redis Enterprise Scaling

Redis Enterprise clusters shard by key hash. For vector search:

- Vector index is per-shard — KNN query fans out across shards and merges.
- Use consistent hash prefixes (`{tenant}:doc:id`) to co-locate a tenant on one shard when possible.
- Active-Active replication supports geo distribution; vector writes converge eventually.

## Monitoring

- `FT.INFO idx:docs` — index stats, memory, doc count.
- `INFO memory` — total RAM; vector indexes sit in `used_memory_dataset`.
- Slow query log: `FT.CONFIG SET SLOWLOG-LOG-SLOWER-THAN 10000` (microseconds).
- Grafana Redis datasource exposes `FT.INFO` counters.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Storing vectors as JSON array of floats in hash | Use raw `FLOAT32` bytes — 4-8x more compact |
| FLAT index on > 10k vectors | Switch to HNSW |
| `EF_RUNTIME=10` for critical queries | Raise to 40-80 for those queries via `$EF_RUNTIME` |
| MULTI pipeline for bulk insert | `transaction=False` pipeline |
| No pre-filter on high-selectivity filters | Write filter before `=>[KNN ...]` to pre-filter |
| Running vector workloads on OSS `redis:latest` | Must be Redis Stack / Enterprise |
| Reindexing the whole dataset to change M / dim | Build new index on a new prefix; swap atomically |
| Mixing session and kb vectors in one index | Separate prefixes and indexes; different TTL regimes |

## Production Checklist

- [ ] Redis Stack or Enterprise (not OSS `redis:latest`)
- [ ] HNSW with `M` and `EF_CONSTRUCTION` sized to corpus
- [ ] `EF_RUNTIME` tunable per query
- [ ] Vectors stored as raw FLOAT32 bytes
- [ ] Pipeline bulk ingest with `transaction=False`
- [ ] Tag / Numeric fields indexed for filtered queries
- [ ] TTL strategy for ephemeral / session vectors
- [ ] `FT.INFO` monitoring + slow query log
- [ ] Redis replication + persistence (AOF or RDB)
- [ ] Swap plan for re-indexing without downtime (prefix switch)
- [ ] Semantic cache threshold calibrated against a gold set
