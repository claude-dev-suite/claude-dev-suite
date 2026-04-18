---
name: qdrant-advanced
description: |
  Advanced Qdrant features. Payload indexing, scalar/binary/product quantization,
  named vectors (multi-vector), sparse vectors, multi-tenancy, snapshots, sharding,
  gRPC vs HTTP, pre- vs post-filtering, and oversampling/rescoring.

  USE WHEN: user mentions "Qdrant", "named vectors", "sparse vectors",
  "scalar quantization qdrant", "qdrant filtering", "qdrant sharding",
  "qdrant multi-tenant"

  DO NOT USE FOR: basic Qdrant upsert/query - use `ai-integration/vector-databases`;
  other vector DBs - use other `vector-stores/*`; quantization theory - use
  `vector-quantization`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Qdrant Advanced

## Collection Configuration

```python
from qdrant_client import QdrantClient, models

client = QdrantClient(url="http://localhost:6333", prefer_grpc=True, api_key=None)

client.create_collection(
    collection_name="docs",
    vectors_config={
        "dense": models.VectorParams(
            size=1024, distance=models.Distance.COSINE,
            on_disk=True,  # mmap vectors to disk; index stays in RAM
        ),
        "colbert": models.VectorParams(
            size=128,
            distance=models.Distance.COSINE,
            multivector_config=models.MultiVectorConfig(
                comparator=models.MultiVectorComparator.MAX_SIM,
            ),
        ),
    },
    sparse_vectors_config={
        "sparse": models.SparseVectorParams(
            index=models.SparseIndexParams(on_disk=False),
        ),
    },
    optimizers_config=models.OptimizersConfigDiff(
        indexing_threshold=20000,      # build HNSW after N vectors
        default_segment_number=4,
    ),
    hnsw_config=models.HnswConfigDiff(m=16, ef_construct=128, on_disk=False),
    quantization_config=models.ScalarQuantization(
        scalar=models.ScalarQuantizationConfig(
            type=models.ScalarType.INT8,
            quantile=0.99,
            always_ram=True,  # keep quantized vectors in RAM for speed
        ),
    ),
    shard_number=6,
    replication_factor=2,
    write_consistency_factor=1,
)
```

## Named Vectors (Multi-Vector per Point)

Store multiple embeddings per document — e.g., title, body, image — search any of them or combine.

```python
client.upsert(
    collection_name="docs",
    points=[
        models.PointStruct(
            id=1,
            vector={
                "dense":   dense_vec.tolist(),           # 1024-d
                "colbert": colbert_vecs.tolist(),        # (tokens, 128)
            },
            payload={"title": "...", "tenant_id": "acme"},
        ),
    ],
)

# Search one named vector
client.query_points(
    collection_name="docs",
    query=query_dense.tolist(),
    using="dense",
    limit=10,
)
```

## Sparse Vectors (SPLADE / BM25-style)

```python
# Sparse vector: (indices[], values[])
sparse = models.SparseVector(indices=[12, 340, 9001], values=[0.6, 0.4, 0.9])

client.upsert(
    collection_name="docs",
    points=[
        models.PointStruct(
            id=1,
            vector={"dense": dense_vec.tolist()},
            sparse_vector={"sparse": sparse},
            payload={"tenant_id": "acme"},
        ),
    ],
)

client.query_points(
    collection_name="docs",
    query=models.SparseVector(indices=[12, 340], values=[1.0, 0.5]),
    using="sparse",
    limit=10,
)
```

## Hybrid Search with Fusion (Qdrant 1.10+)

Qdrant performs server-side RRF / DBSF fusion across named + sparse vectors in a single call.

```python
client.query_points(
    collection_name="docs",
    prefetch=[
        models.Prefetch(
            query=dense_q.tolist(),
            using="dense",
            limit=50,
        ),
        models.Prefetch(
            query=models.SparseVector(indices=[...], values=[...]),
            using="sparse",
            limit=50,
        ),
    ],
    query=models.FusionQuery(fusion=models.Fusion.RRF),
    limit=10,
)
```

## ColBERT-style Late Interaction with Rescoring

```python
# Stage 1: fast dense shortlist
# Stage 2: ColBERT MaxSim rescoring
client.query_points(
    collection_name="docs",
    prefetch=models.Prefetch(
        query=dense_q.tolist(),
        using="dense",
        limit=100,
    ),
    query=colbert_q.tolist(),   # (tokens, 128)
    using="colbert",
    limit=10,
)
```

## Quantization Options

| Type | Memory reduction | Speed | Recall impact |
|---|---|---|---|
| Scalar int8 | 4x | 2x faster | -1 to -2% |
| Binary | 32x | 40x faster | -5 to -15% (recover with rescoring) |
| Product (PQ) | 8-64x | 2-4x faster | -2 to -10% |

### Binary quantization with oversampling + rescoring

```python
client.update_collection(
    collection_name="docs",
    quantization_config=models.BinaryQuantization(
        binary=models.BinaryQuantizationConfig(always_ram=True),
    ),
)

client.query_points(
    collection_name="docs",
    query=qvec.tolist(),
    using="dense",
    limit=10,
    search_params=models.SearchParams(
        quantization=models.QuantizationSearchParams(
            ignore=False,
            rescore=True,
            oversampling=3.0,   # fetch 30 from binary, rescore with float32
        ),
    ),
)
```

## Payload Indexing (critical for filtered search)

Without payload indexes, filters force full scan on the filtered subset.

```python
client.create_payload_index(
    collection_name="docs",
    field_name="tenant_id",
    field_schema=models.PayloadSchemaType.KEYWORD,
)
client.create_payload_index(
    collection_name="docs",
    field_name="created_at",
    field_schema=models.PayloadSchemaType.DATETIME,
)
client.create_payload_index(
    collection_name="docs",
    field_name="tags",
    field_schema=models.KeywordIndexParams(
        type=models.KeywordIndexType.KEYWORD,
        is_tenant=True,   # tenancy hint for optimizer
    ),
)
```

### Filtered search with pre-filter

```python
client.query_points(
    collection_name="docs",
    query=qvec.tolist(),
    using="dense",
    query_filter=models.Filter(
        must=[
            models.FieldCondition(key="tenant_id", match=models.MatchValue(value="acme")),
            models.FieldCondition(key="tags", match=models.MatchAny(any=["api", "auth"])),
            models.FieldCondition(
                key="created_at",
                range=models.DatetimeRange(gte="2025-01-01T00:00:00Z"),
            ),
        ],
        must_not=[
            models.FieldCondition(key="archived", match=models.MatchValue(value=True)),
        ],
    ),
    limit=10,
)
```

## Multi-Tenancy

Two patterns:

1. Single collection + `tenant_id` payload + tenant-aware keyword index (default).
2. Collection per tenant (only if small number of large tenants).

For pattern 1, always set `is_tenant=True` on the tenant field so Qdrant uses a
tenant-optimized layout.

## Snapshots and Backup

```python
snap = client.create_snapshot(collection_name="docs")
# Download: GET /collections/docs/snapshots/{name}

# Restore into a fresh collection
client.recover_snapshot(
    collection_name="docs",
    location="http://source:6333/collections/docs/snapshots/<name>",
    priority=models.SnapshotPriority.SNAPSHOT,
)
```

## Sharding and Replication

```python
client.create_collection(
    "docs",
    vectors_config=models.VectorParams(size=1024, distance=models.Distance.COSINE),
    shard_number=6,              # horizontal scale
    replication_factor=2,        # HA
    write_consistency_factor=1,  # 1=fast, N=strong
)
```

Rule of thumb: `shard_number = ceil(total_vectors / 5M)`, capped by node count.

## gRPC vs HTTP

- gRPC (`prefer_grpc=True`, port 6334): ~2-5x lower latency, better for bulk writes.
- HTTP (port 6333): easier debugging, works through HTTP proxies / CDNs.
- Use gRPC for app-server to Qdrant in production; HTTP for local debugging.

## Pre-filter vs Post-filter

Qdrant uses cardinality-based filter routing:
- Low-selectivity filter (keeps >20% of points): filter happens during HNSW traversal (pre-filter-like).
- Highly selective filter (<1%): Qdrant falls back to plain scan, then ANN on the subset.
- Use payload indexes with `is_tenant=True` / `on_disk=False` hints for hot fields.

## Scroll API (full export / migration)

```python
offset = None
while True:
    batch, offset = client.scroll(
        collection_name="docs",
        scroll_filter=models.Filter(must=[
            models.FieldCondition(key="tenant_id", match=models.MatchValue(value="acme")),
        ]),
        limit=1000,
        offset=offset,
        with_payload=True,
        with_vectors=True,
    )
    process(batch)
    if offset is None:
        break
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| No payload index on tenant_id | Create keyword index with `is_tenant=True` |
| Binary quantization without rescoring | Set `rescore=True` and `oversampling >= 2.0` |
| HTTP client for high-QPS ingestion | Switch to gRPC (`prefer_grpc=True`) |
| Replication factor 1 in production | Set to 2+ for HA |
| `indexing_threshold` left at default for small collections | Lower to 1000 so HNSW builds early |
| Single collection for 10k+ tenants | Keep single collection; use tenant payload index |
| Recreating the collection to add a payload field | Use dynamic payload — just include new keys in upsert |

## Production Checklist

- [ ] gRPC enabled for app to Qdrant traffic
- [ ] Payload indexes created for every filtered field
- [ ] `is_tenant=True` set on tenancy field
- [ ] Quantization configured (scalar int8 default, binary for huge collections)
- [ ] Rescoring enabled with oversampling when binary/PQ
- [ ] Replication factor >= 2
- [ ] Snapshot schedule (daily) + off-cluster retention
- [ ] Monitoring: `collection_size`, `indexed_vectors_count`, search latency p95
- [ ] Backup and restore drill run at least once
