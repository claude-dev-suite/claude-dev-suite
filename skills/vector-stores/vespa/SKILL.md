---
name: vespa
description: |
  Vespa hybrid retrieval and ranking. BM25 + ANN + ColBERT late interaction in one
  query, ranking phases (match-phase, first-phase, second-phase, global-phase), tensor
  expressions, cloud vs self-hosted, schema definition (.sd files), embedding in-cluster,
  scale to billions.

  USE WHEN: user mentions "Vespa", "Vespa schema", "Vespa ranking", "vespa.ai", "tensor
  ranking", "Vespa hybrid", "Vespa cloud"

  DO NOT USE FOR: other vector stores - use `vector-stores/*` siblings; ColBERT without
  Vespa - use `retrieval/colbert-retrieval`; classical reranking - use `rag/reranking`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Vespa

## Why Vespa

Vespa was built at Yahoo for search+recommendation at web scale. Its vector search is a side-effect of a broader ranking engine — which is also its advantage.

- Hybrid retrieval (BM25 + ANN + ColBERT) composed in one query.
- Ranking phases let you run cheap scoring over millions, expensive scoring over tens.
- Tensor math (sum, reduce, matmul) in the ranking language — you can express almost any scoring function.
- In-cluster embedding inference: encode at write and query time without an external service.
- Proven at billions of documents (Yahoo, Spotify, Perplexity).

Cost: steeper learning curve than purpose-built vector DBs. Use Vespa when ranking control is the requirement, not an afterthought.

## Vespa Cloud vs Self-Hosted

| Option | Best for |
|---|---|
| Vespa Cloud | Managed multi-tenant, zero ops, serverless billing |
| Docker standalone | Dev/local; small single-node deployments |
| Self-hosted multi-node | Air-gapped, custom tuning, cost control at very large scale |

```bash
# Install Vespa CLI
brew install vespa-cli
vespa config set target cloud
vespa config set application my-tenant.my-app
vespa auth login
```

## Application Package Layout

```
my-app/
  services.xml                 # cluster topology
  schemas/
    doc.sd                     # schema + rank profiles (the main thing)
  search/
    query-profiles/            # reusable query templates
  components/
    ...
```

Deploy with `vespa deploy --wait 300`.

## Schema (.sd) with Dense, Sparse, ColBERT

```
schema doc {
    document doc {
        field id type string { indexing: summary | attribute }
        field text type string {
            indexing: summary | index
            index: enable-bm25
        }
        field tenant_id type string {
            indexing: summary | attribute
            attribute: fast-search
        }
        field created_at type long { indexing: summary | attribute }

        # Dense embedding
        field embedding type tensor<float>(x[1024]) {
            indexing: attribute | index
            attribute {
                distance-metric: angular
            }
            index {
                hnsw {
                    max-links-per-node: 24
                    neighbors-to-explore-at-insert: 200
                }
            }
        }

        # ColBERT token-level embeddings
        field colbert_tokens type tensor<bfloat16>(t{}, x[128]) {
            indexing: attribute | summary
        }
    }

    # Rank profile: BM25 + dense + ColBERT in three phases
    rank-profile hybrid inherits default {
        inputs {
            query(q_dense) tensor<float>(x[1024])
            query(q_tokens) tensor<float>(qt{}, x[128])
        }

        first-phase {
            expression: bm25(text) + closeness(field, embedding)
        }

        second-phase {
            rerank-count: 100
            expression {
                sum(
                    reduce(
                        sum(query(q_tokens) * attribute(colbert_tokens), x),
                        max, t
                    ),
                    qt
                )
            }
        }

        match-features: bm25(text) closeness(field, embedding)
    }
}
```

Key moves:

- `bm25(text)` — classical lexical.
- `closeness(field, embedding)` — 1 / (1 + distance) after HNSW retrieval.
- ColBERT MaxSim is a tensor expression over token-level attributes.
- Three-phase: cheap `first-phase` on 100k candidates, expensive `second-phase` on top 100.

## Services.xml (Topology)

```xml
<services version="1.0">
  <container id="default" version="1.0">
    <search/>
    <document-api/>
    <nodes>
      <node hostalias="node0"/>
    </nodes>
  </container>
  <content id="docs" version="1.0">
    <redundancy>2</redundancy>
    <documents>
      <document type="doc" mode="index"/>
    </documents>
    <nodes>
      <node hostalias="node0" distribution-key="0"/>
      <node hostalias="node1" distribution-key="1"/>
    </nodes>
    <engine>
      <proton>
        <tuning><searchnode><requestthreads><persearch>4</persearch></requestthreads></searchnode></tuning>
      </proton>
    </engine>
  </content>
</services>
```

`redundancy=2` gives HA; more nodes shard the index.

## Feed Documents

```python
# pip install pyvespa
from vespa.application import Vespa

app = Vespa(url="https://my-app.my-tenant.vespa-app.cloud")

app.feed_data_point(
    schema="doc",
    data_id="d1",
    fields={
        "id": "d1",
        "text": "OAuth uses refresh tokens.",
        "tenant_id": "acme",
        "created_at": 1700000000,
        "embedding": {"values": dense_vec.tolist()},
        "colbert_tokens": {
            "cells": [
                {"address": {"t": str(i), "x": str(j)}, "value": float(v)}
                for i, row in enumerate(colbert_vecs)
                for j, v in enumerate(row)
            ],
        },
    },
)
```

For bulk, use `app.feed_iterable()` or the Vespa Feeder CLI (`vespa feed`), which streams JSON files at high throughput.

## Query: Hybrid in a Single Request

```python
from vespa.io import VespaQueryResponse

resp: VespaQueryResponse = app.query(
    yql=(
        "select * from doc where "
        "({targetHits:100}nearestNeighbor(embedding, q_dense)) "
        "or userQuery() "
        "and tenant_id contains 'acme';"
    ),
    query="oauth refresh token 403",
    ranking="hybrid",
    hits=10,
    body={
        "input.query(q_dense)": {"values": q_dense.tolist()},
        "input.query(q_tokens)": {
            "cells": [
                {"address": {"qt": str(i), "x": str(j)}, "value": float(v)}
                for i, row in enumerate(q_colbert_vecs)
                for j, v in enumerate(row)
            ],
        },
    },
)

for hit in resp.hits:
    print(hit["relevance"], hit["fields"]["text"][:80])
```

Anatomy:

- `nearestNeighbor(embedding, q_dense)` — HNSW ANN with `targetHits=100`.
- `userQuery()` — BM25 match on `text`.
- `or` — either matches advance to ranking.
- Tenant filter via YQL `contains`.
- Rank profile `hybrid` computes the three-phase score.

## Ranking Phases

| Phase | Runs over | Typical use |
|---|---|---|
| match-phase | All matching candidates | Filter by predicate or attribute |
| first-phase | Millions | Cheap expression: BM25 + dot product |
| second-phase | rerank-count (e.g., 100) | Expensive: ColBERT MaxSim, learned-to-rank |
| global-phase | After merging across shards | Cross-node reranking, diversification |

This is Vespa's killer feature. Expensive ranking runs only on the smallest tier.

## In-Cluster Embedding

Vespa can run transformer models at write and query time — no external embedding service.

```
schema doc {
    field text type string { indexing: summary | index }
    field embedding type tensor<float>(x[384]) {
        indexing: input text | embed e5 | attribute | index
        attribute { distance-metric: angular }
        index { hnsw { ... } }
    }
}
```

Then in `services.xml`:

```xml
<component id="e5" type="hugging-face-embedder">
  <transformer-model url="https://huggingface.co/intfloat/e5-small-v2/resolve/main/onnx/model.onnx"/>
  <tokenizer-model url="https://huggingface.co/intfloat/e5-small-v2/resolve/main/tokenizer.json"/>
</component>
```

Query-side embedding works the same way via `embed()` in YQL.

## ColBERT Inside Vespa

Vespa is the reference production home for ColBERT. MaxSim is a tensor expression, not a special index — so you can combine it freely with BM25 and dense vectors.

```
sum(
    reduce(
        sum(query(q_tokens) * attribute(colbert_tokens), x),
        max, t
    ),
    qt
)
```

- Inner `sum(... , x)`: dot product on last dim (the embedding dim).
- `reduce(..., max, t)`: max over document tokens for each query token.
- Outer `sum(..., qt)`: sum the MaxSim scores across query tokens.

See `retrieval/colbert-retrieval` for the algorithm.

## Scaling to Billions

- Shard by `distribution-key` across content nodes.
- Use tiered storage (some data on SSD, cold on object storage via streaming search).
- Streaming mode sidesteps HNSW for rarely-queried tenants (compute per request, no pre-built graph).
- Attribute-only ranking avoids random disk I/O at query time.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Running expensive expressions in `first-phase` | Push heavy work to `second-phase` with `rerank-count` |
| Forgetting `fast-search` on filtered attributes | Add `attribute: fast-search` for pre-filter perf |
| HNSW for single-tenant queries on rare tenants | Use streaming mode for small per-tenant corpora |
| Using Vespa like a simple vector DB | If you only want k-NN, Qdrant/Pinecone is simpler |
| Shipping ColBERT without bfloat16/int8 on tokens | Use `tensor<bfloat16>` to cut token storage in half |
| Skipping match-phase filters | Use attribute predicates to reduce the first-phase pool |
| Deploying schema changes without `vespa status` check | Deploy with `--wait`; schema migrations can be long |

## Production Checklist

- [ ] Rank profiles phased (first / second / global) with matching `rerank-count`
- [ ] `distance-metric` matches your embedding model (angular / innerproduct)
- [ ] HNSW `max-links-per-node` and `neighbors-to-explore-at-insert` tuned
- [ ] `fast-search` attribute on all filtered fields
- [ ] Bulk feed via Vespa Feeder CLI (not one-at-a-time API)
- [ ] Schema changes deployed with `vespa deploy --wait`
- [ ] Redundancy >= 2 for HA
- [ ] In-cluster embedding pinned to a model version
- [ ] Tensor storage types chosen (bfloat16 / int8) at scale
- [ ] Grafana dashboards for first-phase / second-phase latency
- [ ] Streaming mode considered for long-tail tenants
- [ ] A/B harness compares rank profiles on a gold set
