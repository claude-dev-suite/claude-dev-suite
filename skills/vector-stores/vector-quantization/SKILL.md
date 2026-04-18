---
name: vector-quantization
description: |
  Vector compression techniques: scalar quantization (int8, int4), binary
  quantization (bit vectors + Hamming), product quantization (PQ), optimized PQ,
  residual quantization. Covers rescoring workflow, storage math, accuracy
  tradeoffs, and Faiss/Qdrant/pgvector implementations.

  USE WHEN: user mentions "quantization", "int8 embeddings", "binary embeddings",
  "product quantization", "PQ", "OPQ", "residual quantization", "Hamming distance",
  "compress embeddings", "rescoring"

  DO NOT USE FOR: Matryoshka dimension truncation - use `matryoshka-embeddings`;
  ANN algorithm choice - use `ann-algorithms`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Vector Quantization

## Why Quantize

A float32 1024-dim embedding is 4 KB. 100M vectors = 400 GB. Quantization cuts this 4-128x with small recall cost — especially when paired with rescoring.

| Scheme | Bytes/vec (d=1024) | Reduction | Typical recall impact |
|---|---|---|---|
| Full float32 | 4096 | 1x | 0 |
| float16 / bfloat16 | 2048 | 2x | < -0.5% |
| int8 scalar | 1024 | 4x | -1 to -2% |
| int4 scalar | 512 | 8x | -2 to -5% |
| Binary (1 bit) | 128 | 32x | -5 to -15% (recover with rescore) |
| PQ (64 subvectors x 8 bits) | 64 | 64x | -2 to -10% |
| Binary + MRL (d=256) | 32 | 128x | -3 to -8% with rescore |

## Scalar Quantization (int8 / int4)

Linear mapping: each float32 dim scaled to an 8-bit or 4-bit integer with per-index or per-dim scale/zero-point.

```python
import numpy as np

def int8_quantize(x: np.ndarray):
    # Symmetric per-dim scale
    scale = np.max(np.abs(x), axis=0) / 127
    q = np.round(x / scale).clip(-128, 127).astype(np.int8)
    return q, scale

def int8_dot(q: np.ndarray, q_q: np.ndarray, s_a: np.ndarray, s_b: np.ndarray) -> np.ndarray:
    return (q.astype(np.int32) @ q_q.astype(np.int32).T) * (s_a * s_b).sum()
```

For production, use framework support (Faiss, pgvector `halfvec`/int8, Qdrant scalar quantizer, Elasticsearch `int8_hnsw`) — they handle numerical issues and SIMD.

### Faiss scalar quantization

```python
import faiss

quantizer = faiss.IndexFlatL2(d)
index = faiss.IndexIVFScalarQuantizer(
    quantizer, d, nlist=1024,
    qtype=faiss.ScalarQuantizer.QT_8bit, metric=faiss.METRIC_L2,
)
index.train(sample)
index.add(corpus)
index.nprobe = 32
```

## Binary Quantization

Each float becomes 1 bit: `bit = (value > 0)`. Distance becomes Hamming distance (XOR + popcount), which is 10-40x faster than cosine on modern CPUs.

```python
import numpy as np

def binary_quantize(vecs: np.ndarray) -> np.ndarray:
    return np.packbits((vecs > 0).astype(np.uint8), axis=1)   # (N, d/8)

def hamming_topk(qbits: np.ndarray, cbits: np.ndarray, k: int):
    # XOR + popcount via numpy
    xor = np.bitwise_xor(cbits, qbits)
    dists = np.unpackbits(xor, axis=1).sum(axis=1)
    topk = np.argpartition(dists, k)[:k]
    return topk[np.argsort(dists[topk])]
```

### Recovery via Rescoring

Binary alone loses 5-15% recall. Fix: oversample on binary, then rescore the shortlist with full float vectors.

```python
def search_binary_then_rescore(qvec: np.ndarray, corpus: np.ndarray,
                               cbits: np.ndarray, top_k: int, oversample: int = 20):
    qbits = binary_quantize(qvec[None])[0]
    shortlist = hamming_topk(qbits, cbits, top_k * oversample)
    # Rescore with full float32
    sub = corpus[shortlist]
    scores = sub @ qvec
    order = np.argsort(-scores)[:top_k]
    return shortlist[order], scores[order]
```

Typical result: ~99% of full-float recall at 5-10x lower search latency and 32x less stored vector data.

### Binary in pgvector

```sql
-- Column
embedding_bit bit(1024)

-- Populate
UPDATE chunks SET embedding_bit = binary_quantize(embedding::vector)::bit(1024);

-- Index (pgvector 0.7+)
CREATE INDEX ON chunks USING hnsw (embedding_bit bit_hamming_ops);

-- Search then rescore
WITH shortlist AS (
  SELECT id, embedding
  FROM chunks
  ORDER BY embedding_bit <~> binary_quantize($1::vector)::bit(1024)
  LIMIT 100
)
SELECT id, 1 - (embedding <=> $1::vector) AS score
FROM shortlist
ORDER BY embedding <=> $1::vector
LIMIT 10;
```

### Binary in Qdrant

```python
from qdrant_client import models

client.update_collection(
    "docs",
    quantization_config=models.BinaryQuantization(
        binary=models.BinaryQuantizationConfig(always_ram=True),
    ),
)
client.query_points(
    "docs",
    query=qvec.tolist(),
    using="dense",
    limit=10,
    search_params=models.SearchParams(
        quantization=models.QuantizationSearchParams(
            rescore=True, oversampling=3.0,
        ),
    ),
)
```

## Product Quantization (PQ)

Split each d-dim vector into `m` subvectors of size d/m. Quantize each subvector to one of `ksub = 2^nbits` centroids learned by k-means on a training sample. Stored code: `m * nbits` bits per vector.

### Faiss PQ

```python
import faiss

m, nbits = 64, 8                             # 64 bytes per vector
index = faiss.IndexPQ(d, m, nbits)
index.train(sample)                          # needs ~256 * 2^nbits points
index.add(corpus)
D, I = index.search(queries, 10)
```

### IVF + PQ (standard huge-scale combo)

```python
quantizer = faiss.IndexFlatL2(d)
index = faiss.IndexIVFPQ(quantizer, d, nlist=8192, m=64, nbits=8)
index.train(sample)
index.add(corpus)
index.nprobe = 64
```

Faiss computes query-to-centroid distances once per query (`m * 256` values) and
sums them per candidate, which is very SIMD-friendly.

## Optimized PQ (OPQ)

Apply a learned orthogonal rotation before PQ so subvectors are better balanced.
Gains ~1-3% recall at the same code size.

```python
import faiss
opq = faiss.OPQMatrix(d, m)
opq.train(sample)
rotated = opq.apply_py(corpus)
pq = faiss.IndexPQ(d, m, nbits)
pq.train(rotated)
pq.add(rotated)
# Or use the pre-built combo:
index = faiss.index_factory(d, f"OPQ{m}_64,IVF8192,PQ{m}x{nbits}")
```

## Residual Quantization (RQ)

Quantize the residual (original - first quantized approximation) with another codebook. Stack multiple stages for fine-grained quantization.

Use cases: where PQ at a given rate underfits — RQ gets closer to float32 at the
same bit budget. Implemented in Faiss as `IndexResidualQuantizer`, and underlies
ScaNN's anisotropic quantizer.

```python
index = faiss.IndexResidualQuantizer(d, nsplits=4, nbits=8)
index.train(sample)
index.add(corpus)
```

## Rescoring Workflow (Universal Pattern)

```
1. Store FULL precision vectors in cold storage (or in the same DB as a second column).
2. Index QUANTIZED vectors for ANN search.
3. Search quantized, retrieve `oversample * k` candidates.
4. Rescore candidates with full vectors (dot product / cosine).
5. Return true top-k.
```

This pattern recovers 99%+ of full-precision recall for binary/PQ and costs only
the oversample factor in extra candidates.

```python
def hybrid_search(qvec, k=10, oversample=20):
    candidates = quantized_index.search(qvec, k * oversample)  # fast
    full_vecs = full_store.get_many([c.id for c in candidates])
    scored = sorted(
        zip(candidates, full_vecs),
        key=lambda x: -np.dot(qvec, x[1]),
    )
    return scored[:k]
```

## Storage Math Reference

For N vectors of dimension d:

| Scheme | Bytes |
|---|---|
| float32 | N * d * 4 |
| float16 | N * d * 2 |
| int8 | N * d + N * 4 (per-vector scale) |
| binary | N * d / 8 |
| PQ(m, nbits) | N * m * nbits / 8 |
| IVFPQ(m, nbits, nlist) | N * m * nbits / 8 + nlist * d * 4 (centroids) |

Example: 100M x 1024-d

- float32: 400 GB
- float16: 200 GB
- int8: 102 GB
- binary: 12.5 GB
- PQ(64, 8): 6.4 GB
- IVFPQ(64, 8, 8192): 6.4 GB + 32 MB centroids

## Accuracy vs Memory Curve (rough)

- int8: keep 99%+ of float32 recall. Always safe default.
- PQ(d/16, 8): keep 95-98% with rescoring. Great for 10M+.
- Binary: keep 95-99% WITH rescoring, 85-92% without.
- PQ(d/64, 8): keep 85-92%, even with rescoring; use only at extreme scale.

Always measure on YOUR data. Quantization quality depends on embedding distribution.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Binary quantization without rescoring | Always oversample 2-5x and rescore with float |
| PQ with undersized training set | Train on at least `256 * 2^nbits` representative points |
| Mixing L2 and cosine across quantized / full vectors | Normalize everything; pick one metric |
| Quantizing without measuring recall on eval set | Sweep oversample + compare to brute-force baseline |
| Forgetting centroids need retraining on distribution shift | Retrain IVF / PQ centroids periodically |
| Int4 before int8 has been benchmarked | Try int8 first; only go lower if memory forces it |
| Storing full vectors only — no quantized mirror | Keep both: quantized for fast search, full for rescore |

## Production Checklist

- [ ] Recall@k measured against brute-force ground truth at chosen quantization
- [ ] Oversampling factor tuned (typically 2-10x)
- [ ] Rescoring pipeline implemented (full vectors retrievable by ID)
- [ ] Training sample size meets quantizer requirements
- [ ] Retraining schedule for IVF/PQ centroids documented
- [ ] Memory budget verified post-quantization
- [ ] Metric consistency (cosine vs L2) across quantized and full paths
- [ ] Fallback to float32 for critical queries if needed
