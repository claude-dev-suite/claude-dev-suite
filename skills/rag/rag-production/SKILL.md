---
name: rag-production
description: |
  Operational concerns for RAG at scale. Incremental indexing (CDC, doc diffing),
  blue-green re-indexing, index aliases/versioning, embedding-model hot-swap,
  cost optimization (dimension reduction, cheaper embed models), capacity and
  token budgets, p50/p95/p99 SLAs, horizontal scaling, multi-tenant isolation,
  async ingestion (Kafka/Pub-Sub).

  USE WHEN: user mentions "incremental indexing", "reindex", "index alias",
  "blue-green reindex", "RAG cost optimization", "multi-tenant RAG",
  "RAG capacity planning", "async ingestion", "CDC for RAG", "embedding model swap"

  DO NOT USE FOR: caching - use `rag-caching`;
  tracing/metrics - use `rag-observability`;
  access control / PII - use `rag-security`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# RAG in Production

## Incremental Indexing

Never reindex the whole corpus on every change. Three trigger sources:

1. **Change Data Capture (CDC)** from the source database (Debezium, native Postgres logical replication).
2. **Document diffing** on filesystem/S3: store `sha256 + last_modified` per doc; reprocess when changed.
3. **Event-driven**: producer emits `doc.created | doc.updated | doc.deleted` on a queue.

```python
# Doc diffing example
import hashlib, json, pathlib

STATE = pathlib.Path(".index_state.json")
state = json.loads(STATE.read_text()) if STATE.exists() else {}

def scan_and_upsert(root: pathlib.Path):
    seen = set()
    for p in root.rglob("*.md"):
        content = p.read_bytes()
        h = hashlib.sha256(content).hexdigest()
        key = str(p)
        seen.add(key)
        if state.get(key) != h:
            reindex_document(key, content.decode())
            state[key] = h
    for key in list(state.keys()) - seen:
        delete_from_index(key)
        state.pop(key, None)
    STATE.write_text(json.dumps(state))
```

At chunk level, store `doc_id + chunk_hash`; on doc update, delete chunks where `chunk_hash` is no longer present, insert new ones.

## Blue-Green Re-indexing (Full Rebuild)

Required when changing embedding model, chunking strategy, or schema. Never rebuild in place.

```python
# Pinecone: use different index names and swap at the application layer
# Weaviate/Qdrant/Elasticsearch: use index aliases

# Elasticsearch
client.indices.create(index="docs_v42", body=mapping)
# ... reindex into docs_v42 ...
client.indices.update_aliases(actions=[
    {"remove": {"index": "docs_v41", "alias": "docs"}},
    {"add":    {"index": "docs_v42", "alias": "docs"}},
])
# Keep docs_v41 around for fast rollback, delete after N days
```

**Validation gate before switching the alias**: run a golden eval set against both indexes, require new index recall@5 >= old - 1%.

## Hot-Swap of Embedding Models

Changing embedding model invalidates the entire index. Procedure:

1. Build `index_v{new}` offline with new embeddings.
2. Shadow: send 10% of live queries to both indexes, log differences.
3. Gate on eval metrics + shadow diff rate.
4. Flip alias; keep old index warm for 72h.
5. Invalidate semantic caches (they contain old embeddings).

Track `embedding_model_version` in `.dev-suite-manifest.json` style metadata alongside the index.

## Index Versioning and Aliases

| Pattern | Vector DB | Example |
|---|---|---|
| Alias | Elasticsearch, OpenSearch, Weaviate | alias `docs` -> `docs_v42` |
| Namespace/collection | Pinecone, Qdrant, Chroma | app reads `COLLECTION_NAME` env |
| Tenant prefix | Pinecone namespace | `tenant_{id}_v42` |

Always deploy through the alias/env var. Never hardcode index names in application code.

## Cost Optimization

| Lever | Savings | Tradeoff |
|---|---|---|
| Use cheaper embedding model (e.g., `text-embedding-3-small` vs `-large`) | 6x | 2-4% recall loss; test |
| Reduce embedding dimension (Matryoshka models) | 2-4x storage, faster search | Small recall loss per halving |
| Product Quantization (pgvector IVFFlat+PQ, Qdrant SQ) | 4-32x storage | Recall drop; rerank to recover |
| Smaller `k` + rerank | 2x query cost, better quality | Extra rerank call |
| Filter before ANN search | Big wins on multi-tenant | Requires selective metadata |
| Haiku/gpt-4o-mini for extraction, Opus/GPT-4o only for synthesis | 10-20x | Prompt engineering per tier |
| Prompt caching (provider) | 10x on static prefix | Prefix must be >= min tokens |
| Batch embedding requests | 2x throughput, fewer HTTP | Tail-latency on small batches |

### Matryoshka Embedding Truncation

OpenAI `text-embedding-3-*` and Nomic `nomic-embed-text-v1.5` expose `dimensions` parameter; truncate then L2-renormalize.

```python
import numpy as np
def truncate_renorm(v: list[float], d: int = 512) -> list[float]:
    arr = np.array(v[:d], dtype=np.float32)
    return (arr / np.linalg.norm(arr)).tolist()
```

## SLA Targets

| Tier | p50 | p95 | p99 |
|---|---|---|---|
| Retrieval only | 50ms | 150ms | 300ms |
| Retrieval + rerank | 150ms | 400ms | 800ms |
| Full RAG (small model) | 600ms | 1.5s | 3s |
| Full RAG (large model) | 1.5s | 4s | 8s |

Measure per stage. Streaming (SSE) the LLM response lets you hide a 2s generation behind first-token latency of ~400ms.

## Capacity Planning

Simple model for ANN capacity:

```
memory_bytes ~= num_vectors * (4 * dim + 24)   # float32 + HNSW overhead
                + index_metadata (~20%)

QPS_per_replica ~= 1000ms / p95_query_ms * parallelism_factor(0.6-0.8)
replicas = ceil(target_qps / QPS_per_replica) + 1 (headroom)
```

Rules of thumb:
- Keep per-replica index size < 50 GB for in-memory HNSW (else shard).
- Plan for 2x query volume spikes (traffic + rebuild catch-up).
- Reserve 30% CPU headroom on embedding/rerank servers; GPU utilization target 60-70%.

## Horizontal Scaling Patterns

| Component | Scaling axis | Notes |
|---|---|---|
| Embedder | Stateless, scale on queue depth | Use async with per-request batching (8-32 items) |
| Vector DB | Shard by tenant or hash(doc_id) | Pinecone/Qdrant/Weaviate handle natively |
| Reranker (cross-encoder) | GPU replicas behind LB | Big gains from batch size 16-32 |
| LLM synthesis | Rate-limited by provider | Tier accounts; failover to secondary region |
| Cache layer | Redis cluster | Consistent hashing; per-tenant key prefix |

## Multi-Tenant Strategies

```
Strategy        Isolation    Cost     Use case
-----------------------------------------------------------
Per-tenant DB   strongest    $$$$     Regulated / sovereignty
Namespace       strong       $$       Most SaaS B2B
Filter only     weakest      $        Small tenants, shared budget
```

```python
# Pinecone namespace pattern
pc_index.namespace(f"tenant_{tenant_id}").query(vector=v, top_k=5)

# Metadata filter pattern (avoid for >100 tenants due to selectivity)
pc_index.query(vector=v, top_k=5, filter={"tenant_id": tenant_id})

# Row-level security in pgvector
# Role granted SELECT ... USING (tenant_id = current_setting('app.tenant_id')::int)
```

**Never** rely on filter-only isolation when tenants have very different document counts; rebalance to namespaces.

## Async Ingestion Pipelines

```
Source -> CDC/producer -> Kafka/Pub-Sub -> Ingest worker
  -> Chunk -> Embed (batched) -> Upsert -> Update manifest
  -> Publish `index.updated` event for cache invalidation
```

```python
# Example Kafka worker skeleton
from aiokafka import AIOKafkaConsumer
import asyncio, orjson

async def run():
    consumer = AIOKafkaConsumer("docs.events",
        bootstrap_servers="kafka:9092", group_id="rag-ingest",
        enable_auto_commit=False)
    await consumer.start()
    try:
        batch = []
        async for msg in consumer:
            batch.append(orjson.loads(msg.value))
            if len(batch) >= 32:
                await ingest_batch(batch)
                await consumer.commit()
                batch.clear()
    finally:
        await consumer.stop()
```

Key properties:
- **At-least-once** with idempotent upserts (keyed by `doc_id + chunk_idx`).
- **DLQ** for malformed docs; alert if DLQ > N/hour.
- **Backpressure**: pause consumption if embedding API is rate-limited.
- **Ordering**: partition by `doc_id` so updates to the same doc don't race.

## Embedding API Rate-Limit Handling

```python
import asyncio, random
from openai import AsyncOpenAI, RateLimitError

async def embed_batch(texts, client: AsyncOpenAI, max_retries=6):
    for attempt in range(max_retries):
        try:
            r = await client.embeddings.create(model="text-embedding-3-small", input=texts)
            return [d.embedding for d in r.data]
        except RateLimitError:
            await asyncio.sleep((2 ** attempt) + random.random())
    raise RuntimeError("embedding rate-limit budget exhausted")
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Full corpus reindex on every deploy | Incremental with doc diffing or CDC |
| In-place index rebuild (downtime) | Blue-green with alias swap |
| Same index for all tenants on enterprise tier | Namespace per tenant, filter for small tiers |
| No idempotency keys on upsert | Key by `doc_id + chunk_idx`; safe replays |
| Embedding inline in request path | Async pipeline; request path only queries |
| Hardcoded index name | Read from env / config per environment |
| No rollback plan | Keep previous alias target for 72h |
| Ignoring cache invalidation on reindex | Bump semantic cache version prefix |

## Production Checklist

- [ ] Incremental ingestion (CDC or doc diff) wired
- [ ] Blue-green reindex tested in staging
- [ ] Index alias used by all readers (no hardcoded names)
- [ ] Manifest records embedding model, chunk params, index version
- [ ] Per-stage latency budgets defined and measured
- [ ] Multi-tenant isolation strategy chosen and enforced in tests
- [ ] Async ingest DLQ + alerts configured
- [ ] Embedding / rerank / LLM rate-limit retry with backoff
- [ ] Rollback runbook (swap alias back, invalidate cache)
- [ ] Cost dashboards per stage (embed, vector, rerank, generation)
