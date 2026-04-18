---
name: splade-deep
description: |
  SPLADE / SPLADE++ learned sparse retrieval in depth. How SPLADE differs from BM25
  (learned term expansion), FLOPS regularization, indexing in Qdrant sparse vectors
  and Elasticsearch, hybrid with dense, efficiency tradeoffs, and when SPLADE beats
  BM25.

  USE WHEN: user mentions "SPLADE", "SPLADE++", "learned sparse", "neural sparse",
  "FLOPS regularization", "sparse vector retrieval", "naver/splade"

  DO NOT USE FOR: classical BM25 tuning - use `retrieval/bm25-tuning`; dense retrieval
  - use `vector-stores/*`; hybrid fusion math - use `rag/hybrid-search`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# SPLADE Deep Dive

## SPLADE vs BM25 in One Sentence

BM25 scores documents by raw term frequency weighted by IDF. SPLADE uses a masked-language-model head to predict a learned weight for every term in the vocabulary — including terms that never appeared in the document.

This is called learned term expansion: a document about "token refresh" gets non-zero weights for "oauth", "bearer", "jwt", "access" even if those words are absent in the surface text.

## The FLOPS Regularizer

Without constraint, SPLADE would fill the whole vocabulary with small non-zero weights, which is slow to index and search. SPLADE adds a FLOPS loss that penalizes the expected number of non-zero dot products at query time:

```
L = L_rank + lambda_q * FLOPS(q) + lambda_d * FLOPS(d)
```

`lambda_q > lambda_d` produces short, precise queries with slightly fatter documents — the right tradeoff for inverted-index serving. Published SPLADE++ (`splade-cocondenser-ensembledistil`) averages ~120 non-zero terms per document.

## When SPLADE Wins

| Corpus | BM25 | SPLADE | Dense only |
|---|---|---|---|
| In-domain with rich labels | Good | Best | Tied with SPLADE |
| Out-of-domain (BEIR avg) | OK | Strong | Varies per model |
| Jargon-heavy (medical, legal) | Strong for exact terms | Strongest (learned expansion) | Often weakest |
| Very short queries (1-2 terms) | Wins on exact match | Adds expansion | Often too fuzzy |
| Very long documents | Hurts | Holds up | Degrades more |

Rule of thumb: SPLADE replaces BM25 in a hybrid pipeline when you have a GPU at ingest. BM25 is still the right choice if you cannot afford GPU encoding.

## Encoding with Hugging Face Transformers

```python
# pip install transformers torch
from transformers import AutoTokenizer, AutoModelForMaskedLM
import torch

MODEL_ID = "naver/splade-cocondenser-ensembledistil"  # SPLADE++; MIT license
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
model = AutoModelForMaskedLM.from_pretrained(MODEL_ID).eval()

if torch.cuda.is_available():
    model = model.to("cuda").half()

@torch.inference_mode()
def splade_encode(text: str, max_length: int = 256) -> dict[int, float]:
    tok = tokenizer(text, return_tensors="pt", truncation=True, max_length=max_length)
    if torch.cuda.is_available():
        tok = {k: v.to("cuda") for k, v in tok.items()}
    logits = model(**tok).logits  # (1, seq_len, vocab)
    attn = tok["attention_mask"].unsqueeze(-1)
    weights = torch.max(
        torch.log1p(torch.relu(logits)) * attn, dim=1
    ).values.squeeze(0)  # (vocab,)
    idx = torch.nonzero(weights).squeeze(-1)
    return {int(i): float(weights[i]) for i in idx.tolist()}
```

For batching (ingest-time), replace with a real DataLoader; one-at-a-time will bottleneck on GPU launch overhead.

## Efficient Batching for Ingest

```python
from torch.utils.data import DataLoader

def collate(batch):
    return tokenizer(batch, padding=True, truncation=True, max_length=256,
                     return_tensors="pt")

@torch.inference_mode()
def batch_splade(texts: list[str], batch_size: int = 32) -> list[dict[int, float]]:
    loader = DataLoader(texts, batch_size=batch_size, collate_fn=collate)
    out = []
    for tok in loader:
        tok = {k: v.to("cuda") for k, v in tok.items()}
        logits = model(**tok).logits
        attn = tok["attention_mask"].unsqueeze(-1)
        w = torch.max(torch.log1p(torch.relu(logits)) * attn, dim=1).values
        for row in w:
            idx = torch.nonzero(row).squeeze(-1)
            out.append({int(i): float(row[i]) for i in idx.tolist()})
    return out
```

At 32-batch on an A10G, SPLADE++ encodes ~400-800 docs/sec depending on length.

## Indexing in Qdrant (native sparse vectors)

```python
from qdrant_client import QdrantClient, models

client = QdrantClient(url="http://localhost:6333", prefer_grpc=True)
client.create_collection(
    "splade-kb",
    vectors_config={},  # no dense needed if pure SPLADE
    sparse_vectors_config={
        "splade": models.SparseVectorParams(
            index=models.SparseIndexParams(on_disk=False, full_scan_threshold=5000),
        ),
    },
)

def to_sparse(weights: dict[int, float]) -> models.SparseVector:
    items = sorted(weights.items())
    return models.SparseVector(indices=[i for i, _ in items],
                               values=[v for _, v in items])

client.upsert(
    "splade-kb",
    points=[models.PointStruct(id=i, vector={"splade": to_sparse(w)}, payload={"text": t})
            for i, (w, t) in enumerate(zip(doc_weights, docs))],
)

# Query
q_weights = splade_encode("token refresh 403")
result = client.query_points(
    "splade-kb",
    query=to_sparse(q_weights),
    using="splade",
    limit=10,
)
```

## Indexing in Elasticsearch (rank_features)

Elasticsearch's `rank_features` field accepts a map of token-string -> weight; SPLADE terms map to BERT WordPiece tokens. Use the tokenizer's `convert_ids_to_tokens` to stringify.

```python
from elasticsearch import Elasticsearch, helpers

es = Elasticsearch("http://localhost:9200")
es.indices.create(
    index="splade",
    mappings={"properties": {"splade_weights": {"type": "rank_features"}}},
)

def stringify(weights: dict[int, float]) -> dict[str, float]:
    return {tokenizer.convert_ids_to_tokens(i): float(v) for i, v in weights.items()}

def actions(docs, weights):
    for i, (d, w) in enumerate(zip(docs, weights)):
        yield {"_index": "splade", "_id": i,
               "_source": {"text": d, "splade_weights": stringify(w)}}

helpers.bulk(es, actions(docs, doc_weights))

# Query: each non-zero term becomes a rank_feature query
def splade_query(q_weights: dict[int, float]):
    return {
        "query": {
            "bool": {
                "should": [
                    {"rank_feature": {"field": f"splade_weights.{tokenizer.convert_ids_to_tokens(i)}",
                                      "saturation": {}, "boost": float(v)}}
                    for i, v in q_weights.items()
                ],
            },
        },
    }
```

Elasticsearch 8.11+ also has `sparse_vector` field type which is faster — use it if available.

## Hybrid SPLADE + Dense (RRF)

SPLADE replaces BM25 in the hybrid pattern. Rerun with RRF or alpha fusion.

```python
from qdrant_client.models import Prefetch, FusionQuery, Fusion

client.query_points(
    "hybrid-kb",
    prefetch=[
        Prefetch(query=dense_q.tolist(), using="dense", limit=50),
        Prefetch(query=to_sparse(q_weights), using="splade", limit=50),
    ],
    query=FusionQuery(fusion=Fusion.RRF),
    limit=10,
)
```

See `rag/hybrid-search` for fusion algorithms.

## Efficiency Tradeoffs

| Metric | BM25 | SPLADE++ (GPU ingest) | Dense 1024-d |
|---|---|---|---|
| Ingest throughput (docs/sec) | 10k+ CPU | 400-800 GPU | 1k-2k GPU |
| Index size (100 tokens/doc) | ~80 B | ~1.2 KB | ~4 KB |
| Query latency (1M docs) | 5-15 ms | 15-40 ms | 5-20 ms (HNSW) |
| Out-of-domain NDCG@10 | baseline | +10-20% | varies |
| GPU required at query time | No | No (inverted index) | No (HNSW) |

SPLADE's killer feature is zero-GPU-at-query-time while staying within ~2x of BM25 latency.

## Document vs Query Models

Some SPLADE releases provide a separate lighter query encoder. Use it at query time when latency matters.

```python
QUERY_MODEL = "naver/efficient-splade-V-large-query"
DOC_MODEL = "naver/efficient-splade-V-large-doc"
```

Encode queries with the query model, documents with the doc model — they share the same vocabulary space.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Encoding single docs one at a time | Batch with DataLoader; GPU launch overhead dominates |
| Storing SPLADE as a dense vector | Use native sparse vector support (Qdrant, Elasticsearch, OpenSearch) |
| Using BM25 tokenizer for SPLADE | Must use the model's WordPiece tokenizer |
| Serving SPLADE without a query-side encoder on GPU | Query encoding is cheap but not free; keep a warm pool or a distilled query encoder |
| Forgetting to normalize activations before storing | Already handled by `log1p(relu(...))`; do not re-normalize |
| SPLADE + dense with equal weights | Alpha tune on a gold set — SPLADE often deserves 0.4-0.6 |
| Ignoring FLOPS drift after domain fine-tune | Retune `lambda_q` / `lambda_d` or nonzero count explodes |

## Production Checklist

- [ ] Query encoder runs on GPU with warm pool (or distilled query model)
- [ ] Document encoder batched at ingest; throughput measured
- [ ] Sparse index uses native sparse-vector type, not dense-with-zeros
- [ ] Nonzero-term distribution monitored (median, p95) for drift
- [ ] Hybrid fusion tuned on a labeled set (see `rag/hybrid-search`)
- [ ] Tokenizer version pinned alongside model weights
- [ ] Fallback to BM25 if SPLADE encoder pool is unhealthy
- [ ] Ingest reprocessing plan when swapping SPLADE checkpoints
- [ ] Evaluation against BM25 baseline documented
