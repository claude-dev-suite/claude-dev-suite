---
name: matryoshka-embeddings
description: |
  Matryoshka Representation Learning (MRL) for dimension truncation without
  retraining. Covers OpenAI text-embedding-3 MRL, Nomic, Jina v3, training with
  MatryoshkaLoss, binary quantization compatibility, and storage/quality tradeoffs.

  USE WHEN: user mentions "matryoshka", "MRL", "dimension truncation",
  "shorten embedding", "dimensions parameter", "variable-length embeddings"

  DO NOT USE FOR: product/scalar quantization - use `vector-stores/vector-quantization`;
  picking models - use `embedding-models`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Matryoshka Embeddings (MRL)

## What MRL Is

Matryoshka Representation Learning trains an embedding so that the FIRST N
dimensions are themselves a usable lower-dim embedding. Truncate the tail and
renormalize — no retraining, no loss of most of the quality.

Standard embedding (1536-d) truncated to 256-d: random quality loss (15-30%).
MRL embedding truncated to 256-d: near-baseline quality (often within 2-5%).

## Models With Official MRL Support

| Model | Native dims | Recommended truncations |
|---|---|---|
| OpenAI text-embedding-3-small | 1536 | 512, 768, 1024 |
| OpenAI text-embedding-3-large | 3072 | 256, 512, 1024, 2048 |
| nomic-embed-text-v1.5 | 768 | 64, 128, 256, 512 |
| jina-embeddings-v3 | 1024 | 32, 64, 128, 256, 512 |
| mxbai-embed-large-v1 | 1024 | 256, 512, 768 (trained Matryoshka) |
| snowflake-arctic-embed-l-v2.0 | 1024 | 256, 512 |

## Using OpenAI MRL

```python
from openai import OpenAI
import numpy as np

client = OpenAI()

def embed(texts: list[str], dim: int = 1536) -> np.ndarray:
    resp = client.embeddings.create(
        model="text-embedding-3-large",
        input=texts,
        dimensions=dim,  # server-side truncation + renormalization
    )
    return np.array([d.embedding for d in resp.data], dtype=np.float32)

full   = embed(docs, dim=3072)  # 12 KB per vector (float32)
medium = embed(docs, dim=1024)  # 4 KB
small  = embed(docs, dim=256)   # 1 KB  (12x smaller than full)
```

Server-side truncation already renormalizes — the result is a unit vector.

## Manual Truncation (any MRL-trained model)

```python
import numpy as np

def truncate(vec: np.ndarray, new_dim: int) -> np.ndarray:
    v = vec[:new_dim]
    return v / np.linalg.norm(v, axis=-1, keepdims=True)

full_vec = np.array([...], dtype=np.float32)  # 1024-d
compact  = truncate(full_vec, 256)            # 256-d, unit-normalized
```

This ONLY works on MRL-trained models. Truncating a non-MRL embedding (e.g.
`bge-base-en-v1.5`) hurts recall significantly.

## Nomic MRL

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("nomic-ai/nomic-embed-text-v1.5", trust_remote_code=True)
full = model.encode([f"search_document: {d}" for d in docs], normalize_embeddings=True)
# full.shape == (N, 768)

compact = full[:, :256]
compact /= np.linalg.norm(compact, axis=1, keepdims=True)
```

## Training Your Own MRL Model

Use `MatryoshkaLoss` as a wrapper around any retrieval loss.

```python
from sentence_transformers import SentenceTransformer, SentenceTransformerTrainer
from sentence_transformers.losses import MatryoshkaLoss, MultipleNegativesRankingLoss

model = SentenceTransformer("BAAI/bge-base-en-v1.5")
base  = MultipleNegativesRankingLoss(model)

loss = MatryoshkaLoss(
    model=model,
    loss=base,
    matryoshka_dims=[768, 512, 256, 128, 64],
    matryoshka_weights=[1, 1, 1, 1, 1],   # equal weighting
)
# Train with the standard SentenceTransformerTrainer — see embedding-fine-tuning skill.
```

## Quality vs Dimension Tradeoff

Run this benchmark on your own eval set before committing to a truncation level.

```python
from sentence_transformers.evaluation import InformationRetrievalEvaluator

def eval_at_dim(model, queries, corpus, relevant_docs, dim):
    q_vecs = model.encode(list(queries.values()), normalize_embeddings=True)[:, :dim]
    d_vecs = model.encode(list(corpus.values()),  normalize_embeddings=True)[:, :dim]
    q_vecs /= np.linalg.norm(q_vecs, axis=1, keepdims=True)
    d_vecs /= np.linalg.norm(d_vecs, axis=1, keepdims=True)
    # ... compute nDCG@10 manually or via evaluator
    return ndcg

for d in [64, 128, 256, 512, 768]:
    print(d, eval_at_dim(model, queries, corpus, relevant_docs, d))
```

Typical pattern on BEIR-style eval with a good MRL model:

| Dim | % of full quality | Storage (float32) |
|---|---|---|
| 64 | 85-92% | 256 B |
| 128 | 92-96% | 512 B |
| 256 | 96-98% | 1 KB |
| 512 | 99-100% | 2 KB |
| 1024 | 100% | 4 KB |

## Combining MRL with Quantization

MRL composes with int8 and binary quantization for massive storage wins.

```python
# 1024-d float32  = 4096 bytes per vector
# 256-d  float32  = 1024 bytes  (MRL truncation)
# 256-d  int8     = 256 bytes   (+ scalar quant)
# 256-d  binary   = 32 bytes    (+ binary quant, 128x reduction)

import numpy as np

def to_binary(vec: np.ndarray) -> np.ndarray:
    return np.packbits((vec > 0).astype(np.uint8))

compact = full[:, :256]
compact /= np.linalg.norm(compact, axis=1, keepdims=True)
binary  = np.apply_along_axis(to_binary, 1, compact)
# Search with Hamming distance, then rescore top-K with full float vectors.
```

See `vector-stores/vector-quantization` for the rescoring workflow.

## Rescoring Pattern (MRL + full-precision)

Store both truncated and full vectors; search fast on truncated, rerank with full.

```python
# Index: 256-d (fast ANN search)
# Side store: 1536-d full vectors keyed by doc id

top_k_candidates = vector_db.search(query_vec_256, top_k=100)
full_candidates = [full_store[c.id] for c in top_k_candidates]
rescored = sorted(
    zip(top_k_candidates, full_candidates),
    key=lambda x: -np.dot(query_vec_full, x[1]),
)[:10]
```

Cuts ANN latency 4-10x while recovering quality on the top-10 that matters.

## Storage Economics

For 10M documents at 1024-d:

| Strategy | Size | Monthly cost (Qdrant Cloud ~$0.20/GB-month) |
|---|---|---|
| Full float32 | 38 GB | $7.60 |
| MRL 256-d float32 | 9.5 GB | $1.90 |
| MRL 256-d int8 | 2.4 GB | $0.48 |
| MRL 256-d binary | 0.3 GB | $0.06 |

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Truncating a non-MRL model | Use an MRL-trained model or accept the quality loss |
| Forgetting to renormalize after truncation | Always `v / ||v||` after slicing |
| Using the same dim for indexing and rescoring | Index on compact dim, rescore with full vectors |
| Not measuring per-dim quality on your data | Benchmark at 64/128/256/512/768 before deploying |
| Mixing truncated and full vectors in same index | Keep them in separate fields or collections |
| Assuming storage savings apply to the vector DB index only | Count the raw-text side store; plan total footprint |

## Production Checklist

- [ ] Model chosen confirms official MRL support (docs / model card)
- [ ] Dimension chosen by eval nDCG, not by blog-post rules of thumb
- [ ] Renormalization after truncation verified (unit vectors)
- [ ] Storage cost computed for chosen dim (and quantization if any)
- [ ] Rescoring plan documented (which full vectors are kept, where)
- [ ] Monitoring: track recall vs a full-precision baseline
- [ ] Fallback dimension (larger) available if quality regresses
