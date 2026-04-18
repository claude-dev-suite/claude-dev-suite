---
name: weaviate-advanced
description: |
  Advanced Weaviate 1.27+ features. Native hybrid (BM25+vector) search, modules
  (reranker, generative), multi-tenancy, replication, compression (PQ / BQ / SQ),
  async indexing, sharding, and Weaviate Cloud vs self-hosted tradeoffs.

  USE WHEN: user mentions "Weaviate", "hybrid BM25", "weaviate multi-tenant",
  "weaviate reranker", "weaviate generative", "weaviate compression", "PQ BQ SQ
  weaviate"

  DO NOT USE FOR: basic vector DB usage - use `ai-integration/vector-databases`;
  other stores - use other `vector-stores/*`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Weaviate Advanced

## Client Setup (v4 Python)

```python
import weaviate
from weaviate.classes.init import Auth, AdditionalConfig, Timeout

client = weaviate.connect_to_weaviate_cloud(
    cluster_url="https://my-cluster.weaviate.network",
    auth_credentials=Auth.api_key("..."),
    headers={"X-OpenAI-Api-Key": "..."},  # for generative/vectorizer modules
    additional_config=AdditionalConfig(timeout=Timeout(init=10, query=60)),
)

# Self-hosted
# client = weaviate.connect_to_local(host="localhost", port=8080, grpc_port=50051)
```

## Collection Creation with Modules

```python
from weaviate.classes.config import (
    Configure, Property, DataType, VectorDistances, Tokenization,
)

client.collections.create(
    name="Docs",
    vectorizer_config=Configure.Vectorizer.text2vec_openai(
        model="text-embedding-3-large",
        dimensions=1024,   # MRL truncation
    ),
    generative_config=Configure.Generative.openai(model="gpt-4o-mini"),
    reranker_config=Configure.Reranker.cohere(model="rerank-english-v3.0"),
    vector_index_config=Configure.VectorIndex.hnsw(
        distance_metric=VectorDistances.COSINE,
        ef_construction=128,
        max_connections=32,
        ef=-1,              # dynamic ef (autotuned)
        quantizer=Configure.VectorIndex.Quantizer.pq(
            segments=128,
            centroids=256,
            training_limit=100_000,
        ),
    ),
    inverted_index_config=Configure.inverted_index(
        bm25_b=0.75, bm25_k1=1.2,
    ),
    multi_tenancy_config=Configure.multi_tenancy(
        enabled=True,
        auto_tenant_creation=True,
        auto_tenant_activation=True,
    ),
    replication_config=Configure.replication(factor=3, async_enabled=True),
    sharding_config=Configure.sharding(virtual_per_physical=128, desired_count=3),
    properties=[
        Property(name="content", data_type=DataType.TEXT,
                 tokenization=Tokenization.WORD),
        Property(name="title", data_type=DataType.TEXT),
        Property(name="tags", data_type=DataType.TEXT_ARRAY,
                 tokenization=Tokenization.FIELD),
        Property(name="created_at", data_type=DataType.DATE),
    ],
)
```

## Native Hybrid Search (BM25 + Vector)

Weaviate computes BM25 and vector search server-side and fuses with a weighted
convex combination or Relative Score Fusion.

```python
from weaviate.classes.query import HybridFusion, Filter, MetadataQuery

docs = client.collections.get("Docs").with_tenant("acme")

result = docs.query.hybrid(
    query="how do I revoke an OAuth token",
    alpha=0.7,                         # 1=pure vector, 0=pure BM25
    fusion_type=HybridFusion.RELATIVE_SCORE,
    limit=10,
    filters=Filter.by_property("tags").contains_any(["auth", "oauth"]),
    return_metadata=MetadataQuery(score=True, explain_score=True),
)
for o in result.objects:
    print(o.metadata.score, o.properties["title"])
```

## Reranking (module-based)

```python
from weaviate.classes.query import Rerank

result = docs.query.hybrid(
    query="how do I revoke an OAuth token",
    alpha=0.5,
    limit=50,
    rerank=Rerank(prop="content", query="revoke OAuth token"),
    # top scorer after rerank is returned first
)
```

Pairing: broad hybrid (limit=50) → reranker trims to the top-K that actually
answers the query.

## Generative Search (RAG in one call)

```python
from weaviate.classes.generate import GenerativeConfig

result = docs.generate.hybrid(
    query="how do I revoke an OAuth token",
    alpha=0.6,
    limit=5,
    grouped_task="Using the provided context, answer concisely with citations.",
    generative_provider=GenerativeConfig.openai(model="gpt-4o-mini"),
)
print(result.generative.text)
```

## Multi-Tenancy

Weaviate implements first-class tenants: each tenant is a physical shard and
can be hot / cold / frozen.

```python
from weaviate.classes.tenants import Tenant, TenantActivityStatus

docs.tenants.create([Tenant(name="acme"), Tenant(name="globex")])

# Offload inactive tenants to cloud storage (reduces RAM)
docs.tenants.update([
    Tenant(name="globex", activity_status=TenantActivityStatus.OFFLOADED),
])

# Reactivate on first query (if auto_tenant_activation=True)
tenant_docs = docs.with_tenant("acme")
```

## Compression Tradeoffs

| Option | Memory reduction | Speed | Recall impact |
|---|---|---|---|
| PQ (Product Quantization) | 8-32x | Fast | -1 to -5% |
| BQ (Binary) | 32x | Very fast | -5 to -15% (rescore) |
| SQ (Scalar) | 4x | Fast | < -1% |

### Binary Quantization

```python
client.collections.get("Docs").config.update(
    vector_index_config=Configure.VectorIndex.hnsw(
        quantizer=Configure.VectorIndex.Quantizer.bq(rescore_limit=100, cache=True),
    ),
)
```

Binary with `rescore_limit=100` means: search in bit-space, then rescore top 100
with full vectors. This recovers most of the lost recall.

### Scalar Quantization

```python
quantizer = Configure.VectorIndex.Quantizer.sq(
    training_limit=100_000,
    rescore_limit=50,
    cache=True,
)
```

## Async Indexing (Weaviate 1.22+)

Under heavy writes, async HNSW indexing decouples ingest latency from index build:

```python
vector_index_config = Configure.VectorIndex.hnsw(
    ef_construction=128,
    max_connections=32,
)
# enable globally via env var on the server: ASYNC_INDEXING=true
```

Queries include a small stream of unindexed recent vectors via the "flat" sidecar
until HNSW catches up — eventually consistent.

## Sharding

Each collection is split across virtual shards mapped to physical shards.
`desired_count` = physical shards; Weaviate routes writes by document ID hash.

```python
sharding_config = Configure.sharding(
    virtual_per_physical=128,
    desired_count=3,
    actual_count=3,
    actual_virtual_count=384,
)
```

For multi-tenant collections, each tenant is its own shard — `sharding_config`
does NOT apply.

## Replication

```python
replication_config = Configure.replication(
    factor=3,
    async_enabled=True,       # async write replication (faster, weaker durability)
)
```

Consistency levels per operation:

```python
from weaviate.classes.config import ConsistencyLevel

docs.data.insert(properties={...}, consistency_level=ConsistencyLevel.QUORUM)
# ONE (fast, weaker) | QUORUM (balanced) | ALL (strong)
```

## Batch Insert at Scale

```python
with docs.batch.dynamic() as batch:
    for row in rows:
        batch.add_object(
            properties={"content": row["text"], "title": row["title"]},
            vector=row["embedding"],   # skip vectorizer module if pre-computed
            uuid=row["id"],
        )
failed = docs.batch.failed_objects
for f in failed[:10]:
    print(f.message, f.object_.uuid)
```

## Weaviate Cloud vs Self-Hosted

| Aspect | Cloud | Self-Hosted |
|---|---|---|
| Ops | Managed, autoscale | You run k8s / docker |
| Cost | Per GB-month, higher | Infra only |
| Modules | All enabled | Configure via env vars |
| Compliance | SOC2, GDPR-ready | On-prem, air-gapped possible |
| Best for | < 100M vectors, startups | > 100M vectors, data residency |

Self-hosted: enable modules via env vars, e.g. `ENABLE_MODULES=text2vec-openai,generative-openai,reranker-cohere`.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Multi-tenant collection with `multi_tenancy_config` disabled | Enable it; do not emulate via property filter |
| alpha=0 or alpha=1 always | Tune per query type; 0.5-0.7 is typical for QA |
| No reranker on hybrid top-50 | Add `rerank=Rerank(...)` — quality jump is large |
| Binary quantization without `rescore_limit` | Set rescore_limit=100+ or accept recall loss |
| Batch inserts via `insert_many` without dynamic batcher | Use `collections.batch.dynamic()` with error handling |
| Replication factor 1 in production | Use factor >= 2 |
| Leaving all inactive tenants hot | Offload to cold storage with `TenantActivityStatus.OFFLOADED` |

## Production Checklist

- [ ] Weaviate >= 1.27
- [ ] Multi-tenancy enabled if serving >1 customer
- [ ] Replication factor >= 2 (3 for multi-region)
- [ ] Quantization chosen (PQ default, BQ for huge collections)
- [ ] Rescore limit set when using BQ/PQ
- [ ] Reranker module configured and applied on top-K
- [ ] Batch writes via dynamic batcher with retry on failures
- [ ] Async indexing enabled for write-heavy workloads
- [ ] Backup with S3 backup module scheduled
- [ ] Monitoring: shard counts, queue depth, p95 search latency
