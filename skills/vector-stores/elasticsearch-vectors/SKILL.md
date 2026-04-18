---
name: elasticsearch-vectors
description: |
  Elasticsearch 8.15+ vector search. dense_vector with HNSW, kNN search,
  hybrid BM25 + kNN with RRF, reranker integration, ELSER learned-sparse,
  sparse_vector, int8 scalar quantization, and index performance tuning.

  USE WHEN: user mentions "elasticsearch vector", "dense_vector", "kNN search",
  "ELSER", "sparse_vector elastic", "elasticsearch RRF", "elasticsearch hybrid
  search"

  DO NOT USE FOR: classic full-text only - use Elasticsearch search skills;
  other vector DBs - use other `vector-stores/*`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Elasticsearch Vector Search

Requires Elasticsearch 8.15+ (for default int8 quantization and native RRF).
Versions 8.8-8.14 support kNN but lack some features below.

## Index Mapping

```json
PUT /chunks
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "index.knn": true
  },
  "mappings": {
    "properties": {
      "tenant_id":  { "type": "keyword" },
      "content":    { "type": "text", "analyzer": "english" },
      "embedding": {
        "type": "dense_vector",
        "dims": 1024,
        "index": true,
        "similarity": "cosine",
        "index_options": {
          "type": "int8_hnsw",
          "m": 16,
          "ef_construction": 100
        }
      },
      "sparse_embedding": { "type": "sparse_vector" },
      "created_at": { "type": "date" }
    }
  }
}
```

`int8_hnsw` is the default in 8.15+ — 4x memory reduction with almost no recall loss.

Alternatives:
- `hnsw` — full float32
- `int4_hnsw` — 8x reduction, slightly more recall loss
- `bbq_hnsw` — binary (8.15+ tech preview), 32x reduction
- `flat` — exhaustive, small datasets only

## Ingest

```python
from elasticsearch import Elasticsearch, helpers

es = Elasticsearch("https://localhost:9200", api_key="...")

def doc_actions(rows):
    for r in rows:
        yield {
            "_index": "chunks",
            "_id": r["id"],
            "_source": {
                "tenant_id": r["tenant_id"],
                "content": r["text"],
                "embedding": r["vector"],
                "created_at": r["created_at"],
            },
        }

helpers.bulk(es, doc_actions(rows), chunk_size=500, request_timeout=120)
```

## kNN Search (pure vector)

```python
es.search(
    index="chunks",
    knn={
        "field": "embedding",
        "query_vector": qvec,
        "k": 10,
        "num_candidates": 100,
        "filter": {
            "bool": {
                "must": [{"term": {"tenant_id": "acme"}}],
                "must_not": [{"term": {"archived": True}}],
            }
        },
    },
    _source=["content", "created_at"],
)
```

`num_candidates` is the per-shard shortlist. Rule: start at 10x `k` and raise
until recall@k plateaus.

## Hybrid Search with RRF (8.15+)

Native server-side Reciprocal Rank Fusion of BM25 + kNN.

```python
es.search(
    index="chunks",
    retriever={
        "rrf": {
            "retrievers": [
                {
                    "standard": {
                        "query": {
                            "bool": {
                                "must": [{"match": {"content": "revoke OAuth token"}}],
                                "filter": [{"term": {"tenant_id": "acme"}}],
                            }
                        }
                    }
                },
                {
                    "knn": {
                        "field": "embedding",
                        "query_vector": qvec,
                        "k": 50,
                        "num_candidates": 200,
                        "filter": [{"term": {"tenant_id": "acme"}}],
                    }
                },
            ],
            "rank_constant": 60,
            "rank_window_size": 50,
        }
    },
    size=10,
)
```

## ELSER (learned sparse retrieval)

ELSER v2 is Elastic's learned sparse model — BM25-quality with semantic generalization,
no dense embedding needed.

```python
# One-time: deploy the model
es.ml.put_trained_model(model_id=".elser_model_2", input={"field_names": ["text_field"]})
es.ml.start_trained_model_deployment(model_id=".elser_model_2")

# Index pipeline inference
es.ingest.put_pipeline(
    id="elser-pipeline",
    body={
        "processors": [{
            "inference": {
                "model_id": ".elser_model_2",
                "input_output": [{
                    "input_field": "content",
                    "output_field": "sparse_embedding",
                }],
            },
        }],
    },
)

# Mapping: sparse_embedding as sparse_vector (already in schema above)

# Query: text_expansion (or sparse_vector query in 8.15+)
es.search(
    index="chunks",
    query={
        "sparse_vector": {
            "field": "sparse_embedding",
            "inference_id": ".elser_model_2",
            "query": "how do I revoke an OAuth token",
        }
    },
    size=10,
)
```

## Combining ELSER + dense + BM25 in one RRF

```python
es.search(
    index="chunks",
    retriever={
        "rrf": {
            "retrievers": [
                {"standard": {"query": {"match": {"content": "revoke OAuth"}}}},
                {"knn": {
                    "field": "embedding", "query_vector": qvec,
                    "k": 50, "num_candidates": 200,
                }},
                {"standard": {"query": {
                    "sparse_vector": {
                        "field": "sparse_embedding",
                        "inference_id": ".elser_model_2",
                        "query": "revoke OAuth token",
                    }
                }}},
            ],
            "rank_constant": 60,
            "rank_window_size": 100,
        }
    },
    size=10,
)
```

## Reranker Integration (text_similarity_reranker, 8.14+)

```python
es.search(
    index="chunks",
    retriever={
        "text_similarity_reranker": {
            "retriever": {
                "knn": {
                    "field": "embedding", "query_vector": qvec,
                    "k": 50, "num_candidates": 200,
                }
            },
            "field": "content",
            "inference_id": "my-cohere-rerank-inference",
            "inference_text": "how do I revoke an OAuth token",
            "rank_window_size": 50,
            "min_score": 0.3,
        }
    },
    size=10,
)
```

The `inference_id` points to a registered inference endpoint (Cohere, OpenAI, ELSER, or custom).

## Scalar Quantization (int8 / int4)

```json
"embedding": {
  "type": "dense_vector",
  "dims": 1024,
  "index": true,
  "similarity": "cosine",
  "index_options": {
    "type": "int8_hnsw",
    "m": 16,
    "ef_construction": 100,
    "confidence_interval": 0.95
  }
}
```

Switching from `hnsw` to `int8_hnsw` on an existing index requires a reindex.

## Performance Tuning

| Knob | Default | When to raise |
|---|---|---|
| `m` | 16 | Accept more memory for better recall |
| `ef_construction` | 100 | Slow builds but higher-quality index |
| `num_candidates` | 10*k | Raise until recall@k plateaus |
| `index.refresh_interval` | 1s | Set to 30s or -1 during bulk load |
| `indices.memory.index_buffer_size` | 10% | Bulk loads benefit from 30%+ |

### Bulk load pattern

```python
# Before load
es.indices.put_settings(index="chunks", settings={
    "index": {"refresh_interval": "-1", "number_of_replicas": 0},
})

helpers.bulk(es, doc_actions(rows), chunk_size=1000)

# After load
es.indices.put_settings(index="chunks", settings={
    "index": {"refresh_interval": "1s", "number_of_replicas": 1},
})
es.indices.forcemerge(index="chunks", max_num_segments=1)
```

## Multi-Tenancy

Preferred: single index, `tenant_id` keyword + filter on every query.

For very uneven tenant sizes, alias-per-tenant on top of multiple underlying indices
or data streams. Never create a separate index per tenant if you have >100 tenants.

## Filtering Strategy

kNN filters in Elasticsearch are pre-filters — they constrain the HNSW traversal.
If the filter is very selective (<1% of docs), Elasticsearch falls back to
brute-force on the filtered subset. For large indices with highly selective
filters, consider using `filter` inside kNN plus a `num_candidates` bump.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| `hnsw` (full float32) when 8.15+ available | Use `int8_hnsw` — 4x memory, near-zero recall loss |
| `num_candidates` left at `k` | Set to 10-20x `k` minimum |
| Client-side RRF | Use native `retriever: rrf` (8.15+) |
| Refresh on every bulk doc | `refresh_interval: -1` during bulk, restore after |
| Index per tenant when tenant count large | Single index + `tenant_id` filter |
| ELSER at index time without model deployed | Deploy + start model before ingest pipeline runs |
| Cold reranker call on every query | Use `rank_window_size` to cap reranker cost |

## Production Checklist

- [ ] Elasticsearch >= 8.15 for native RRF and int8_hnsw
- [ ] `int8_hnsw` (or int4 / bbq) chosen for dense_vector
- [ ] `num_candidates` tuned against recall@k eval
- [ ] RRF retriever used for hybrid (no client-side fusion)
- [ ] ELSER deployed if sparse-semantic branch used
- [ ] Reranker inference endpoint registered (Cohere / custom)
- [ ] Refresh interval / replicas tuned for bulk loads
- [ ] Shard size in target range (10-50 GB per shard)
- [ ] Snapshot lifecycle management (SLM) policy configured
