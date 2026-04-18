---
name: opensearch-knn
description: |
  Amazon OpenSearch k-NN plugin. nmslib vs faiss vs lucene engine, HNSW vs IVF + PQ,
  radial search, neural search with remote embedding, hybrid search (BM25 + kNN with
  weighted sum), OpenSearch 2.13+ features, memory estimation, sizing. Full index
  mapping.

  USE WHEN: user mentions "OpenSearch", "OpenSearch k-NN", "knn_vector", "neural
  search", "nmslib", "faiss engine OpenSearch", "AWS vector search"

  DO NOT USE FOR: other vector stores - use `vector-stores/*` siblings; Elasticsearch
  (proprietary) - OpenSearch diverged from Elasticsearch 7.10; classical BM25 tuning -
  use `retrieval/bm25-tuning`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# OpenSearch k-NN

## What Changed at 2.13+

OpenSearch 2.13 through 2.17 made the k-NN plugin competitive with purpose-built stores:

- Lucene engine supports HNSW with filter-while-search (efficient filtering).
- Faiss engine added IVF + PQ + binary + int8 quantization.
- Neural search plugin: server-side embedding via external models (SageMaker, Bedrock).
- Radial search: return all neighbors within a max distance.
- Hybrid search plugin: BM25 + kNN with configurable score combiners.

## Engines: nmslib vs faiss vs lucene

| Engine | Algorithms | Pros | Cons |
|---|---|---|---|
| lucene | HNSW | Best filter-while-search, pure-Java | No quantization, no IVF |
| faiss | HNSW, IVF, IVF_PQ, binary | Quantization, scale, GPU path | Filters are post-filter by default |
| nmslib | HNSW | Legacy default | Being phased out; no new features |

Default picks:

- Small + heavily filtered workloads: `lucene`.
- Large, quantization-friendly: `faiss`.
- Existing `nmslib` indexes: migrate to `lucene` or `faiss`.

## Index Mapping

```json
PUT /docs
{
  "settings": {
    "index": {
      "knn": true,
      "knn.algo_param.ef_search": 100
    }
  },
  "mappings": {
    "properties": {
      "embedding": {
        "type": "knn_vector",
        "dimension": 1024,
        "data_type": "float",
        "space_type": "cosinesimil",
        "method": {
          "name": "hnsw",
          "engine": "lucene",
          "parameters": {
            "m": 24,
            "ef_construction": 200
          }
        }
      },
      "tenant_id": {"type": "keyword"},
      "source":    {"type": "keyword"},
      "created_at":{"type": "date"},
      "title":     {"type": "text"},
      "body":      {"type": "text"}
    }
  }
}
```

Rule of thumb: `m` 16-32, `ef_construction` 100-400, `ef_search` 50-200. Larger values trade recall for latency/memory.

### faiss with int8 Scalar Quantization

```json
"method": {
  "name": "hnsw",
  "engine": "faiss",
  "space_type": "l2",
  "parameters": {
    "m": 16,
    "ef_construction": 200,
    "encoder": {
      "name": "sq",
      "parameters": {"type": "fp16"}
    }
  }
}
```

`fp16` cuts memory 2x with negligible recall loss. Use `int8` for 4x reduction with small recall tradeoff.

### faiss with IVF + PQ (billion-scale)

```json
"method": {
  "name": "ivf",
  "engine": "faiss",
  "space_type": "l2",
  "parameters": {
    "nlist": 2048,         // ceil(4 * sqrt(num_vectors))
    "nprobes": 16,
    "encoder": {
      "name": "pq",
      "parameters": {"m": 32, "code_size": 8}
    }
  }
}
```

IVF_PQ compresses ~8-32x with 2-10% recall loss. Always pair with oversampling + rescoring if possible.

## Bulk Ingest

```python
# pip install opensearch-py
from opensearchpy import OpenSearch, helpers

client = OpenSearch(
    hosts=[{"host": "search-xxx.us-east-1.es.amazonaws.com", "port": 443}],
    http_auth=(user, pwd),
    use_ssl=True, verify_certs=True,
)

def gen():
    for d in docs:
        yield {
            "_index": "docs",
            "_id": d["id"],
            "_source": {
                "embedding": d["vec"],
                "tenant_id": d["tenant_id"],
                "source": d["source"],
                "title": d["title"],
                "body": d["body"],
                "created_at": d["created_at"],
            },
        }

helpers.bulk(client, gen(), chunk_size=500, max_retries=3)
```

Refresh off during ingest for throughput:

```python
client.indices.put_settings(index="docs", body={"index": {"refresh_interval": "-1"}})
# ... bulk load ...
client.indices.put_settings(index="docs", body={"index": {"refresh_interval": "1s"}})
client.indices.forcemerge(index="docs", max_num_segments=1)
```

`forcemerge` after bulk load builds a single HNSW segment — big query-time speedup.

## k-NN Query

```python
body = {
    "size": 10,
    "query": {
        "knn": {
            "embedding": {
                "vector": q_vec.tolist(),
                "k": 10,
                "filter": {
                    "bool": {
                        "must": [
                            {"term": {"tenant_id": "acme"}},
                            {"terms": {"source": ["kb", "faq"]}},
                        ],
                        "must_not": [
                            {"term": {"archived": True}},
                        ],
                    },
                },
            },
        },
    },
}
result = client.search(index="docs", body=body)
```

Lucene engine evaluates the filter during graph traversal (pre-filter). Faiss filters post by default — switch to `method_parameters: {ef_search: ...}` and accept post-filter trim, or use `filter_mode: "pre_filter"` if available.

## Radial Search (max distance)

```python
body = {
    "query": {
        "knn": {
            "embedding": {
                "vector": q_vec.tolist(),
                "max_distance": 0.3,     # cosine: 1 - similarity
                "filter": {"term": {"tenant_id": "acme"}},
            },
        },
    },
}
```

Returns all neighbors under the threshold. Useful for dedup, novelty detection, and "give me everything similar" semantics rather than top-k.

## Neural Search (Server-Side Embedding)

OpenSearch's neural plugin embeds queries and documents via external models. Register a model connector once, then queries carry text instead of vectors.

```json
POST /_plugins/_ml/models/_register
{
  "name": "cohere-embed-multilingual-v3",
  "function_name": "remote",
  "connector_id": "<your connector id>"
}

POST /_plugins/_ml/models/<model_id>/_deploy
```

Create an ingest pipeline that fills the `embedding` field from `body`:

```json
PUT /_ingest/pipeline/embed-pipeline
{
  "processors": [{
    "text_embedding": {
      "model_id": "<model_id>",
      "field_map": {"body": "embedding"}
    }
  }]
}
```

Attach pipeline to the index via `index.default_pipeline = embed-pipeline`. Inserts supply `body`; OpenSearch fills `embedding` automatically.

Query by text:

```json
GET /docs/_search
{
  "query": {
    "neural": {
      "embedding": {
        "query_text": "how to refresh an oauth token",
        "model_id": "<model_id>",
        "k": 10
      }
    }
  }
}
```

Neural search removes app-side embedding — one less service to run.

## Hybrid (BM25 + kNN) with Score Combiner

```json
POST /_search/pipeline/hybrid-pipeline
{
  "description": "Hybrid BM25 + kNN",
  "phase_results_processors": [{
    "normalization-processor": {
      "normalization": {"technique": "min_max"},
      "combination": {"technique": "arithmetic_mean", "parameters": {"weights": [0.4, 0.6]}}
    }
  }]
}

GET /docs/_search?search_pipeline=hybrid-pipeline
{
  "query": {
    "hybrid": {
      "queries": [
        {"match": {"body": "oauth refresh token"}},
        {"knn": {"embedding": {"vector": q_vec, "k": 50}}}
      ]
    }
  },
  "size": 10
}
```

Techniques include `min_max` and `l2` normalization, and `arithmetic_mean`, `geometric_mean`, `harmonic_mean` combiners. Tune weights on a gold set.

## Memory Estimation

HNSW memory (per shard):

```
bytes_per_vector = 4 * dim + 8 * M
total = num_vectors * bytes_per_vector * (1 + overhead)
```

Example: 10M vectors at 1024-d with M=16:
`10^7 * (4*1024 + 8*16) = 10^7 * 4224 = 42 GB per shard`

Plan `ram.percentage.knn` accordingly (the k-NN circuit breaker defaults to 50% of JVM heap). With quantization (fp16 or int8), halve or quarter the number.

## Sizing Guidelines

| Corpus size | Strategy |
|---|---|
| < 1M | Single node, lucene HNSW, no quantization |
| 1M - 50M | Multiple shards, lucene HNSW or faiss HNSW + fp16 |
| 50M - 1B | Multi-node, faiss HNSW + int8 or IVF + PQ |
| > 1B | Dedicated tier, IVF + PQ, rescore with fp32 sidecar if needed |

Replica shards double memory — factor in HA cost.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Using `nmslib` for new indexes | Prefer `lucene` (filters) or `faiss` (scale) |
| No quantization on large faiss indexes | Use fp16 or int8 |
| Post-filter on faiss with high-selectivity filters | Switch to lucene for those fields |
| Forgetting `forcemerge` after bulk load | Merge to 1 segment (or few) for fast queries |
| Shipping without circuit-breaker sizing | Configure `ram.percentage.knn` to match heap |
| Neural search with a single-AZ model endpoint | Deploy the model endpoint across AZs |
| Hybrid search without score normalization | Use min_max / l2 normalization before combine |
| Changing vector field mapping in place | Reindex into a new index; swap alias |

## Production Checklist

- [ ] Engine chosen per workload: lucene (filters) / faiss (scale)
- [ ] Quantization tuned (fp16 baseline; int8 / PQ at scale)
- [ ] `m`, `ef_construction`, `ef_search` benchmarked on gold set
- [ ] Bulk ingest with `refresh_interval=-1` + `forcemerge`
- [ ] Hybrid search pipeline with normalization + weights
- [ ] Neural search connector + pipeline configured (if used)
- [ ] Aliases fronting the index for zero-downtime reindex
- [ ] Circuit breaker (`knn.memory.circuit_breaker.limit`) sized
- [ ] Snapshot repository configured (S3) with rolling schedule
- [ ] Recall and p95 latency dashboards per shard
- [ ] Multi-AZ replica shards for HA
