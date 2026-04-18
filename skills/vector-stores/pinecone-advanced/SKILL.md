---
name: pinecone-advanced
description: |
  Pinecone advanced features. Serverless vs pods architecture, hybrid search with
  sparse-dense vectors, namespaces for multi-tenancy, metadata filtering performance,
  upsert batching limits, collections (snapshot/restore), Pinecone-integrated inference,
  Python SDK v5+, Assistants API.

  USE WHEN: user mentions "Pinecone", "Pinecone serverless", "Pinecone namespaces",
  "sparse-dense Pinecone", "Pinecone Assistants", "Pinecone inference"

  DO NOT USE FOR: other managed vector DBs - use `vector-stores/milvus`,
  `vector-stores/mongodb-atlas-vector`, `vector-stores/pinecone-advanced` siblings;
  hybrid fusion math - use `rag/hybrid-search`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Pinecone Advanced

## Serverless vs Pods

| Aspect | Pods (legacy) | Serverless (default for new projects) |
|---|---|---|
| Capacity unit | Per-pod RAM | Elastic — scales on read/write |
| Pricing | Per-pod per-hour | Per read/write unit + storage |
| Cold starts | None (always warm) | Possible on first query after idle |
| Min cost | ~$70/month (s1.x1) | Can run < $1/month at low traffic |
| Max vectors/index | Pod-limited | Effectively unlimited |
| Regions | All providers | Fewer regions in serverless |
| Hybrid sparse-dense | Yes | Yes (2024+) |

Serverless is the correct default for new deployments. Keep pods only when you need predictable latency on steady high-QPS workloads.

## Python SDK v5+

```python
# pip install pinecone==5.* pinecone-plugin-inference
from pinecone import Pinecone, ServerlessSpec

pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])

pc.create_index(
    name="kb",
    dimension=1024,
    metric="cosine",
    spec=ServerlessSpec(cloud="aws", region="us-east-1"),
    deletion_protection="enabled",
    tags={"env": "prod", "owner": "search"},
)

index = pc.Index("kb")
```

v5 drops the old `pinecone.init()`; always instantiate a `Pinecone` client. Serverless indexes support sparse-dense natively.

## Namespaces for Multi-Tenancy

Namespaces partition an index at query time with zero performance cost. Prefer namespaces over metadata filters for hard tenant isolation.

```python
index.upsert(
    vectors=[{"id": "doc-1", "values": vec, "metadata": {"source": "kb"}}],
    namespace="tenant-acme",
)

index.query(
    vector=q_vec,
    top_k=10,
    namespace="tenant-acme",
    filter={"source": {"$in": ["kb", "faq"]}},
    include_metadata=True,
)
```

Rules:

- Use namespace for tenant-level partitioning.
- Use metadata filters for within-tenant filtering (tags, dates, sources).
- Stats per namespace via `index.describe_index_stats()["namespaces"]`.

## Metadata Filtering Performance

Serverless indexes build metadata indexes automatically on high-cardinality fields. Selectivity rules of thumb:

- Filter keeps > 50% of vectors: tiny overhead, fast.
- Filter keeps 5-50%: noticeable latency bump, still fine.
- Filter keeps < 1%: can degrade — Pinecone falls back to post-filtering and may return < top_k.

Mitigation:

```python
# Explicitly disable metadata indexing on fields you never filter on
pc.create_index(
    name="kb", dimension=1024, metric="cosine",
    spec=ServerlessSpec(cloud="aws", region="us-east-1"),
    metadata_config={"indexed": ["tenant_id", "source", "created_at"]},
)
```

Indexing only filtered fields speeds both ingest and query and cuts storage cost.

## Upsert Batching Limits

| Limit | Value | Notes |
|---|---|---|
| Max vectors per upsert | 1000 | Batch in chunks |
| Max request size | 2 MB (4 MB for serverless) | Trim metadata size |
| Metadata payload | 40 KB per vector | Hard limit |
| Namespace count | Unlimited | But > 100k is unusual |
| Sparse indices per vector | 1000 active entries | Top-K the sparse vector |

```python
def batched(iterable, n):
    buf = []
    for x in iterable:
        buf.append(x)
        if len(buf) == n:
            yield buf; buf = []
    if buf:
        yield buf

from concurrent.futures import ThreadPoolExecutor

def upsert_parallel(vectors, namespace, batch_size=100, workers=8):
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = [ex.submit(index.upsert, vectors=batch, namespace=namespace)
                   for batch in batched(vectors, batch_size)]
        for f in futures:
            f.result()
```

For millions of vectors, use `index.upsert_from_dataframe()` (pandas) which handles batching internally.

## Sparse-Dense Hybrid

Pinecone's hybrid index stores both sparse and dense vectors per record; fusion happens server-side via an alpha.

```python
def hybrid_scale(dense, sparse, alpha):
    return (
        [v * alpha for v in dense],
        {"indices": sparse["indices"],
         "values": [v * (1 - alpha) for v in sparse["values"]]},
    )

index.upsert(
    vectors=[{
        "id": "doc-1",
        "values": dense_vec,
        "sparse_values": {"indices": [3, 17, 42], "values": [0.9, 0.6, 0.3]},
        "metadata": {"source": "kb"},
    }],
    namespace="tenant-acme",
)

d, s = hybrid_scale(q_dense, q_sparse, alpha=0.7)
index.query(vector=d, sparse_vector=s, top_k=10, namespace="tenant-acme")
```

See `rag/hybrid-search` for generating sparse vectors and tuning alpha.

## Pinecone Integrated Inference

Let Pinecone handle embedding generation server-side — no need to call OpenAI/Cohere separately.

```python
# Index records (text in, vectors stored automatically)
index.upsert_records(
    namespace="tenant-acme",
    records=[
        {"_id": "doc-1", "chunk_text": "OAuth uses refresh tokens.", "source": "kb"},
        {"_id": "doc-2", "chunk_text": "PKCE protects public clients.", "source": "kb"},
    ],
)

# Query by text
results = index.search(
    namespace="tenant-acme",
    query={"inputs": {"text": "how do I refresh a token"}, "top_k": 5},
    fields=["chunk_text", "source"],
)
```

Supported models include `multilingual-e5-large`, `llama-text-embed-v2`, and Cohere/Voyage embed models. The index must be created with `field_map` / `embed` configured.

```python
pc.create_index_for_model(
    name="kb-auto",
    cloud="aws", region="us-east-1",
    embed={
        "model": "multilingual-e5-large",
        "field_map": {"text": "chunk_text"},
    },
)
```

Integrated inference + reranking (`rerank=True`) runs end-to-end on Pinecone infrastructure — useful when keeping data off your network.

## Collections (Snapshot / Restore)

```python
pc.create_collection(name="kb-snap-2025-04", source="kb")

# Restore into a new index (possibly different pod type / region)
pc.create_index(
    name="kb-restored",
    dimension=1024,
    metric="cosine",
    spec=ServerlessSpec(cloud="aws", region="us-east-1"),
    source_collection="kb-snap-2025-04",
)
```

Use collections for:
- Scheduled backups before destructive migrations
- Blue-green index swaps (new embedding model version)
- Environment cloning (prod -> staging)

Collections preserve vectors but not traffic routes — swap your app's index name to use them.

## Pinecone Assistants API

High-level RAG pipeline managed by Pinecone — upload files, ask questions, get citations. Useful for prototyping before building your own pipeline.

```python
from pinecone import Pinecone
pc = Pinecone()

assistant = pc.assistant.create_assistant(
    assistant_name="support-kb",
    metadata={"domain": "customer-support"},
)

assistant.upload_file("./docs/runbook.pdf", metadata={"type": "runbook"})

response = assistant.chat(
    messages=[{"role": "user", "content": "How do I rotate API keys?"}],
    model="claude-3-5-sonnet",
)
print(response.message.content)
print([c for c in response.citations])
```

Assistants are a black box — you trade control for zero-ops RAG. Move to a custom pipeline once you need domain-specific chunking, custom retrieval strategies, or fine-grained cost control.

## Scaling Checklist by Corpus Size

| Vectors | Index type | Tips |
|---|---|---|
| < 100k | Serverless | Single namespace; trivial costs |
| 100k - 10M | Serverless | Split by tenant via namespaces |
| 10M - 100M | Serverless | Index metadata only on filtered fields |
| > 100M | Serverless or multiple indexes | Consider multiple indexes sharded by cohort |

For > 1B vectors, talk to Pinecone support — they may recommend a specific region/topology.

## Latency Optimization

- Keep serverless warm on a low-traffic cron query.
- Reduce metadata payload: store large text elsewhere and keep only IDs in Pinecone metadata.
- Avoid high-cardinality metadata values (unique IDs) in `$in` filters; use namespaces instead.
- Use `include_values=False` by default; only fetch vectors when required.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| One namespace for all tenants + metadata filter | Use namespaces for tenant isolation |
| Indexing every metadata field | Explicit `metadata_config.indexed` whitelist |
| Upserting one vector at a time | Batch 100-1000 per request, parallelize |
| Storing full document text in metadata | Keep only IDs; hydrate from primary store |
| Using pods for a prototype | Start serverless; migrate to pods if QPS is steady |
| Forgetting `deletion_protection` on prod | Always `enabled` on prod indexes |
| Swapping embedding models in place | Create new index + collection, blue-green swap |
| Mixing sparse and dense indexes | Use a single sparse-dense hybrid index |

## Production Checklist

- [ ] Serverless unless QPS pattern justifies pods
- [ ] Namespaces for tenant isolation (not metadata filter)
- [ ] `metadata_config.indexed` whitelist only the filtered fields
- [ ] Batch upserts 100-1000, parallel threads
- [ ] `deletion_protection="enabled"` on production indexes
- [ ] Collection snapshots before model upgrades
- [ ] Sparse-dense hybrid where lexical matching matters
- [ ] Metadata payload under 10 KB per vector (limit is 40 KB)
- [ ] Latency + read/write unit dashboards
- [ ] Recovery runbook: restore index from collection tested quarterly
