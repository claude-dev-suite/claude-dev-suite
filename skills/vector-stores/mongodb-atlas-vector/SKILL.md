---
name: mongodb-atlas-vector
description: |
  MongoDB Atlas Vector Search. $vectorSearch aggregation stage, index definition JSON,
  quantization (scalar, binary), hybrid with Atlas Search text via $rankFusion, dynamic
  schema benefits, sharding, Atlas Triggers for auto-embedding.

  USE WHEN: user mentions "Atlas Vector Search", "$vectorSearch", "MongoDB vector",
  "$rankFusion", "Atlas Triggers embedding", "MongoDB HNSW"

  DO NOT USE FOR: self-hosted vector stores - use `vector-stores/qdrant-advanced`,
  `vector-stores/milvus`; MongoDB without Atlas (self-hosted) - vector search is an
  Atlas-only feature
allowed-tools: Read, Grep, Glob, Write, Edit
---
# MongoDB Atlas Vector Search

## Why Atlas Vector Search

Vector Search lives inside MongoDB Atlas alongside your operational data. Kill the ETL:

- No separate vector DB to sync.
- Vectors and documents are one row; filtering is just a MongoDB query.
- Atlas Search index (Lucene) and Vector Search index (hnswlib-derived) are queryable in the same aggregation pipeline.
- Managed service — sharding, replication, backups handled by Atlas.

Skip it if you are not on Atlas: community MongoDB has no vector search. Use a dedicated vector store instead.

## Index Definition (JSON)

Atlas Vector Search indexes are JSON documents. Create via the UI, CLI, or Admin API.

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1024,
      "similarity": "cosine",
      "quantization": "scalar"
    },
    { "type": "filter", "path": "tenant_id" },
    { "type": "filter", "path": "source" },
    { "type": "filter", "path": "created_at" }
  ]
}
```

Fields marked `"type": "filter"` are indexed for pre-filter lookups. Unspecified fields still work with `$match` after retrieval but without the performance benefit.

`similarity`: `cosine`, `euclidean`, or `dotProduct`. `quantization`: `none`, `scalar` (1 byte/component), `binary` (1 bit/component) — see below.

### Create via PyMongo

```python
# pip install pymongo>=4.7
from pymongo import MongoClient
from pymongo.operations import SearchIndexModel

client = MongoClient(os.environ["MONGODB_URI"])
coll = client["app"]["docs"]

coll.create_search_index(SearchIndexModel(
    definition={
        "fields": [
            {"type": "vector", "path": "embedding",
             "numDimensions": 1024, "similarity": "cosine",
             "quantization": "scalar"},
            {"type": "filter", "path": "tenant_id"},
        ],
    },
    name="docs_vector_idx",
    type="vectorSearch",
))
```

Index builds asynchronously. Check with `coll.list_search_indexes()`.

## $vectorSearch Aggregation Stage

```python
results = coll.aggregate([
    {"$vectorSearch": {
        "index": "docs_vector_idx",
        "path": "embedding",
        "queryVector": q_vec.tolist(),
        "numCandidates": 200,   # ANN candidate pool
        "limit": 10,             # final top-k
        "filter": {
            "tenant_id": "acme",
            "source": {"$in": ["kb", "faq"]},
        },
    }},
    {"$project": {"text": 1, "source": 1,
                  "score": {"$meta": "vectorSearchScore"}}},
])
```

Rule of thumb: `numCandidates` between 10x and 20x `limit`. Too low hurts recall; too high adds latency.

Filters inside `$vectorSearch` are pre-filters (applied before ANN). A post-`$match` after the stage filters after, with no performance benefit.

## Quantization

| Type | Storage | Recall loss | When |
|---|---|---|---|
| none | fp32, 4 B/dim | 0% | Small collections, max quality |
| scalar | 1 B/dim (4x smaller) | < 1% | Default for production |
| binary | 1 bit/dim (32x smaller) | 2-10% raw, recoverable with rescoring | Billion-scale |

For binary with rescoring, Atlas stores the full float vector alongside the binary; the binary stage shortlists, the full vector rescores the shortlist.

```json
{
  "type": "vector",
  "path": "embedding",
  "numDimensions": 1024,
  "similarity": "cosine",
  "quantization": "binary"
}
```

Enable `numCandidates` generously (5-10x final k) when using binary.

## Hybrid: Atlas Search ($search) + Vector ($vectorSearch) with $rankFusion

Atlas supports Reciprocal Rank Fusion natively since 8.1:

```python
results = coll.aggregate([
    {"$rankFusion": {
        "input": {
            "pipelines": {
                "vector": [
                    {"$vectorSearch": {
                        "index": "docs_vector_idx",
                        "path": "embedding",
                        "queryVector": q_vec.tolist(),
                        "numCandidates": 200,
                        "limit": 50,
                    }},
                ],
                "text": [
                    {"$search": {
                        "index": "docs_text_idx",
                        "text": {"query": "oauth refresh token",
                                 "path": ["text", "title"]},
                    }},
                    {"$limit": 50},
                ],
            },
        },
        "combination": {"weights": {"vector": 0.6, "text": 0.4}},
    }},
    {"$limit": 10},
    {"$project": {"text": 1, "source": 1,
                  "score": {"$meta": "scoreDetails"}}},
])
```

Requires both `docs_vector_idx` (Vector Search) and `docs_text_idx` (Atlas Search). `$rankFusion` is RRF under the hood — weighted by the provided weights.

Before 8.1, implement RRF in application code — see `rag/hybrid-search`.

## Dynamic Schema Benefit

Every document can carry arbitrary metadata. A single Vector Search index works across heterogeneous documents:

```python
coll.insert_many([
    {"_id": "d1", "embedding": [...], "tenant_id": "acme", "type": "article",
     "tags": ["oauth", "auth"], "created_at": datetime.utcnow()},
    {"_id": "d2", "embedding": [...], "tenant_id": "acme", "type": "pdf",
     "page": 12, "source_file": "manual.pdf"},
])
```

Queries filter on whichever fields exist:

```python
{"$vectorSearch": {
    "index": "docs_vector_idx",
    "queryVector": q_vec.tolist(),
    "numCandidates": 200, "limit": 10,
    "filter": {"tenant_id": "acme", "type": "pdf", "page": {"$lt": 50}},
}}
```

## Atlas Triggers for Auto-Embedding

A Trigger watches inserts/updates and embeds text server-side — so application code only writes text.

```javascript
// Atlas Trigger function (runs on MongoDB Atlas)
exports = async function(changeEvent) {
  const doc = changeEvent.fullDocument;
  if (!doc.text || doc.embedding) return;

  const resp = await context.http.post({
    url: "https://api.openai.com/v1/embeddings",
    headers: {
      "Authorization": [`Bearer ${context.values.get("openai_key")}`],
      "Content-Type": ["application/json"],
    },
    body: JSON.stringify({model: "text-embedding-3-small", input: doc.text}),
  });

  const embedding = JSON.parse(resp.body.text()).data[0].embedding;
  const coll = context.services.get("mongodb-atlas").db("app").collection("docs");
  await coll.updateOne({_id: doc._id}, {$set: {embedding}});
};
```

Atlas Triggers avoid the dual-write problem: there is no risk of the text being saved without the embedding.

## Sharding

```javascript
sh.shardCollection("app.docs", {tenant_id: "hashed"});
```

`$vectorSearch` is supported on sharded collections. Vector queries fan out across shards and merge — use a shard key that matches your common filter (tenant_id) to enable targeted queries.

Atlas dedicated tiers automate sharding and scaling; Serverless does not shard the same way — check current docs for limits.

## Batch Insert Pattern

```python
from pymongo import UpdateOne

ops = [
    UpdateOne(
        {"_id": d["id"]},
        {"$set": {"embedding": d["vec"], "text": d["text"], "tenant_id": d["tenant_id"]}},
        upsert=True,
    )
    for d in docs
]
coll.bulk_write(ops, ordered=False)
```

`ordered=False` lets MongoDB parallelize; target 1k-10k ops per batch.

## Latency Expectations

- `$vectorSearch` with scalar quant, 1M vectors, M2 cluster: ~30-80 ms p95.
- Add `numCandidates=200, limit=10` and expect 50-150 ms.
- Binary quant with rescoring: ~2-3x faster lookup, sub-50 ms at 10M.
- Sharded collection adds ~10-30 ms coordinator overhead.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Filtering after `$vectorSearch` stage | Put filters inside `filter` of `$vectorSearch` to pre-filter |
| `numCandidates` = `limit` | Set 10-20x the limit for recall |
| Writing embeddings from app code when a Trigger could | Atlas Trigger avoids dual-write drift |
| `similarity: euclidean` for OpenAI embeddings | OpenAI vectors are unit-normalized; use `cosine` or `dotProduct` |
| Indexing every metadata field as `filter` | Only add `filter` paths you actually filter on |
| Ignoring scalar quantization | Scalar is near-free quality; always use it |
| Running Vector Search on community MongoDB | Atlas-only feature; self-hosted needs a dedicated store |
| Sharding without aligning shard key with tenant filter | Use `tenant_id` (hashed) as shard key for multi-tenant |

## Production Checklist

- [ ] Vector Search index with `type: filter` entries for every filtered field
- [ ] `scalar` quantization enabled by default
- [ ] `numCandidates` calibrated (typically 10-20x `limit`)
- [ ] Atlas Trigger handles auto-embedding on insert/update
- [ ] Separate Atlas Search index (Lucene) if using `$rankFusion`
- [ ] `bulk_write(..., ordered=False)` for ingest
- [ ] Shard key aligns with common filter field
- [ ] Cluster tier sized (M30+) for vector search workloads
- [ ] Backup + point-in-time recovery enabled on Atlas
- [ ] Index rebuilds on model upgrades handled via blue-green (new index name, swap in code)
- [ ] Hybrid RRF weights tuned on a gold set
