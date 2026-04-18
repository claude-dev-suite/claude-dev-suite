---
name: milvus
description: |
  Milvus 2.4+ distributed vector database. Architecture (etcd + MinIO + Pulsar),
  partitions, index types (IVF_FLAT, HNSW, DiskANN, GPU_IVF_PQ), scalar field
  indexing, hybrid search (BM25 + vector), Zilliz Cloud managed, dynamic schema,
  upserts, time travel, pymilvus v2 client.

  USE WHEN: user mentions "Milvus", "pymilvus", "Zilliz", "DiskANN", "IVF_FLAT",
  "Milvus partition", "GPU vector index"

  DO NOT USE FOR: other vector DBs - use `vector-stores/*` siblings; general vector
  index theory - use `rag/vector-quantization`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Milvus 2.4+

## Architecture at a Glance

Milvus 2.x is cloud-native by design:

```
Clients (pymilvus, REST, gRPC)
     |
  Proxy nodes   ---- etcd (metadata, service discovery)
     |
  Coord nodes   ---- Pulsar / Kafka (message stream for writes)
     |
  Query / Data / Index nodes
     |
  MinIO / S3 (persistent object storage)
```

Key consequences:

- Horizontal scale by adding query/data/index nodes.
- Writes go to a message stream, not directly to storage — eventually consistent.
- State lives in etcd + object storage; nodes are stateless.

For small deployments, `milvus-standalone` packs everything into one container. Don't run standalone in production > a few million vectors.

## Zilliz Cloud (Managed Milvus)

Use Zilliz Cloud if you don't want to run the dependencies yourself. Tiers:

- Serverless — pay per read/write; cold starts on first query.
- Dedicated — pinned compute, predictable latency.
- Cloud Enterprise — multi-region, private networking, BYOK.

The `pymilvus` client works identically against OSS Milvus and Zilliz Cloud.

## pymilvus v2 Connection

```python
# pip install pymilvus==2.4.*
from pymilvus import MilvusClient, DataType, Function, FunctionType

client = MilvusClient(
    uri="https://in03-xxxx.api.gcp-us-west1.zillizcloud.com",
    token=os.environ["ZILLIZ_TOKEN"],  # or user:password for OSS
)
```

For OSS local: `uri="http://localhost:19530"`, no token.

## Collection with Dynamic Schema

Dynamic schema lets you push arbitrary JSON fields without pre-declaring them — like MongoDB but for vectors.

```python
schema = client.create_schema(auto_id=False, enable_dynamic_field=True)
schema.add_field("doc_id", DataType.VARCHAR, is_primary=True, max_length=64)
schema.add_field("vector", DataType.FLOAT_VECTOR, dim=1024)
schema.add_field("tenant_id", DataType.VARCHAR, max_length=32)
schema.add_field("created_at", DataType.INT64)
# dynamic fields (not declared) are stored in the `$meta` JSON blob

index_params = client.prepare_index_params()
index_params.add_index(field_name="vector", index_type="HNSW",
                       metric_type="COSINE", params={"M": 16, "efConstruction": 200})
index_params.add_index(field_name="tenant_id", index_type="INVERTED")

client.create_collection(
    collection_name="docs",
    schema=schema,
    index_params=index_params,
    consistency_level="Bounded",   # Strong | Bounded | Eventually | Session
)
```

## Partitions for Scale

Partitions are physical subdivisions within a collection, loaded/unloaded independently. Use them for:

- Hot/cold data (recent vs archive)
- Multi-tenancy at huge tenant counts
- Per-topic isolation

```python
client.create_partition(collection_name="docs", partition_name="2025-Q2")
client.insert(collection_name="docs", partition_name="2025-Q2",
              data=[{"doc_id": "d1", "vector": v, "tenant_id": "acme", "created_at": ts}])

client.search(
    collection_name="docs",
    partition_names=["2025-Q2"],
    data=[q_vec],
    limit=10,
)
```

`partition_key` (declared on the schema) auto-routes rows to partitions based on a field — cleanest for multi-tenant workloads.

```python
schema.add_field("tenant_id", DataType.VARCHAR, max_length=32, is_partition_key=True)
```

## Index Types

| Index | Disk | GPU | Best for |
|---|---|---|---|
| FLAT | No | No | Small collections, exact search |
| IVF_FLAT | No | Optional | Medium collections, balanced |
| IVF_PQ | No | Optional | Memory-constrained, lossy |
| IVF_SQ8 | No | Optional | Memory-constrained, scalar quantization |
| HNSW | No | No | Default for millions, high recall |
| SCANN | No | No | Very large, Google ScaNN algo |
| DiskANN | Yes | No | Billions of vectors on disk |
| GPU_IVF_FLAT | No | Yes | GPU-accelerated, exact per cluster |
| GPU_IVF_PQ | No | Yes | Billion-scale on GPU |
| GPU_CAGRA | No | Yes | NVIDIA CAGRA, highest GPU throughput |

Defaults: HNSW for general use; DiskANN when vector count * bytes exceeds available RAM.

```python
index_params.add_index(
    field_name="vector",
    index_type="HNSW",
    metric_type="COSINE",
    params={"M": 16, "efConstruction": 200},
)

# DiskANN
index_params.add_index(
    field_name="vector",
    index_type="DISKANN",
    metric_type="COSINE",
    params={"search_list": 100},
)
```

## Scalar Field Indexing

Milvus 2.4+ supports rich scalar indexes, not just the primary key:

```python
index_params.add_index("tenant_id", index_type="INVERTED")      # exact match
index_params.add_index("created_at", index_type="STL_SORT")     # range queries
index_params.add_index("tags", index_type="INVERTED")           # array field
```

Without scalar indexes, filter expressions force a full scan before ANN.

## Hybrid Search (BM25 + Vector) via Multi-Vector

Milvus 2.5+ introduces full-text (BM25) search as a first-class capability via function fields.

```python
schema = client.create_schema(auto_id=True, enable_dynamic_field=False)
schema.add_field("id", DataType.INT64, is_primary=True)
schema.add_field("text", DataType.VARCHAR, max_length=8192, enable_analyzer=True)
schema.add_field("dense", DataType.FLOAT_VECTOR, dim=1024)
schema.add_field("sparse", DataType.SPARSE_FLOAT_VECTOR)

schema.add_function(Function(
    name="bm25_fn",
    input_field_names=["text"],
    output_field_names=["sparse"],
    function_type=FunctionType.BM25,
))

ix = client.prepare_index_params()
ix.add_index("dense", index_type="HNSW", metric_type="COSINE",
             params={"M": 16, "efConstruction": 200})
ix.add_index("sparse", index_type="SPARSE_INVERTED_INDEX", metric_type="BM25")

client.create_collection("hybrid", schema=schema, index_params=ix)

# Hybrid query
from pymilvus import AnnSearchRequest, RRFRanker
req_dense = AnnSearchRequest(data=[q_vec], anns_field="dense",
                             param={"metric_type": "COSINE"}, limit=50)
req_sparse = AnnSearchRequest(data=["oauth token refresh"], anns_field="sparse",
                              param={"metric_type": "BM25"}, limit=50)
results = client.hybrid_search(
    collection_name="hybrid",
    reqs=[req_dense, req_sparse],
    ranker=RRFRanker(60),
    limit=10,
)
```

## Upserts

Milvus 2.3+ supports true upserts (delete-then-insert atomic):

```python
client.upsert(
    collection_name="docs",
    data=[{"doc_id": "d1", "vector": new_vec, "tenant_id": "acme", "created_at": ts}],
)
```

Without upsert, you `delete` by primary key and `insert`. The stream-based write model means deletes are logical until compaction — do not rely on immediate disappearance.

## Time Travel (point-in-time queries)

```python
# Query as of a timestamp (micro-second precision)
client.search(
    collection_name="docs",
    data=[q_vec],
    limit=10,
    travel_timestamp=1712000000000,
)
```

Useful for reproducible eval runs and debugging. Retention is bounded by `dataCoord.gc.dropTolerance` (default 3 hours); extend for longer time-travel windows.

## Consistency Levels

| Level | Guarantees | Latency impact |
|---|---|---|
| Strong | Reads see all writes | Highest |
| Bounded | Reads within a bounded staleness window | Low |
| Eventually | Best-effort, may be stale | Lowest |
| Session | Read your own writes | Low |

Default: `Bounded`. Use `Strong` only when your RAG pipeline must reflect a just-ingested document immediately.

## Load / Release for Memory Management

Collections must be loaded into memory to be searchable. Release when not in use to free RAM.

```python
client.load_collection("docs")
# search, insert, etc.
client.release_collection("docs")
```

For partitioned collections, load only the hot partitions.

## Sizing Estimation

RAM per vector (approximate):

- FLOAT_VECTOR 1024-d: 4 KB
- HNSW overhead: +20-40%
- IVF_FLAT overhead: +5-10% + centroids
- DiskANN: mostly on disk, ~0.1 KB/vector in RAM

For 100M 1024-d vectors with HNSW: ~500 GB RAM in pure vector terms — consider DiskANN, IVF_PQ, or GPU indexes.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Standalone Milvus in production | Run distributed or use Zilliz Cloud |
| No scalar index on filtered fields | Add INVERTED/STL_SORT indexes |
| Dynamic schema abused for high-cardinality fields | Declare as fixed fields; dynamic is for rare metadata |
| Running with consistency_level="Strong" everywhere | Default to Bounded; Strong only when needed |
| Collection always loaded for cold data | Partition by time; load only hot partitions |
| Using IVF_FLAT when HNSW fits | HNSW has higher recall at same RAM for most sizes |
| DiskANN on in-memory-sized corpus | Only switch to DiskANN when RAM runs out |
| Bulk inserts one row at a time | Batch 1000-10000 per insert |

## Production Checklist

- [ ] Distributed deployment (or Zilliz) — not standalone
- [ ] Scalar indexes on all filtered fields
- [ ] Consistency level chosen per use case
- [ ] Partition key on tenant/time field if multi-tenant
- [ ] Index type matches RAM budget (HNSW / DiskANN / IVF_PQ / GPU)
- [ ] Load / release strategy for cold partitions
- [ ] Batch insert 1000-10000 rows per request
- [ ] Compaction schedule reviewed (deletes linger otherwise)
- [ ] etcd and MinIO backed up
- [ ] Monitoring: query node CPU, data node storage, compaction lag
- [ ] Upgrade path tested (2.3 -> 2.4 -> 2.5)
