---
name: ann-algorithms
description: |
  Approximate Nearest Neighbor algorithm theory and selection. HNSW, IVF, IVF+PQ,
  ScaNN, DiskANN, LSH. Covers parameter effects (m, ef, nlist, nprobe),
  recall/latency/memory tradeoffs, exhaustive vs approximate, and when to pick
  which index.

  USE WHEN: user mentions "ANN", "HNSW", "IVF", "nearest neighbor", "ScaNN",
  "DiskANN", "LSH", "recall vs latency", "index type choice", "FAISS index"

  DO NOT USE FOR: specific DB configuration - use the respective
  `vector-stores/*-advanced` skill; quantization details - use `vector-quantization`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# ANN Algorithms

## Exhaustive vs Approximate

Exhaustive (brute-force) search compares the query against every stored vector —
100% recall, O(N) per query. Approximate Nearest Neighbor (ANN) trades a few
percent recall for 10-1000x speedup.

Break-even heuristic:
- Under ~100k vectors: brute-force is fine (use `flat` in FAISS / `flat` in ES).
- 100k-10M: HNSW is the go-to.
- 10M-1B+: HNSW with quantization, IVF+PQ, DiskANN, or a sharded combo.

## HNSW (Hierarchical Navigable Small World)

Multi-layer graph where upper layers are sparse long-range links and lower layers are dense local links. Search starts at the top, greedy-descends to the bottom.

### Parameters

| Param | Meaning | Typical | Effect of raising |
|---|---|---|---|
| `M` | max neighbors per node per layer | 16-32 | More memory, better recall, slower build |
| `ef_construction` | neighbors considered at build | 100-400 | Slower build, higher-quality graph |
| `ef_search` | neighbors considered at query | 40-200 | Slower queries, higher recall |

Memory footprint per vector: `4*d + 8*M + 4*M` bytes (vector + neighbor IDs + neighbor distances per layer).

### When HNSW is the right call

- Dataset fits in RAM.
- Mixed read/write workload.
- Recall target >95%.
- Latency target <50ms at moderate QPS.

### When HNSW hurts

- Insert-heavy workloads where graph churn degrades quality.
- Vectors >> RAM: graph edges are random-access heavy, slow on SSD.

### FAISS HNSW

```python
import faiss, numpy as np

d = 1024
index = faiss.IndexHNSWFlat(d, 32)          # M=32
index.hnsw.efConstruction = 200
index.add(corpus)                            # corpus: (N, d) float32

index.hnsw.efSearch = 100
D, I = index.search(queries, k=10)
```

## IVF (Inverted File / Cell Probes)

Cluster vectors into `nlist` Voronoi cells. At query time, search only the `nprobe` nearest cells.

| Param | Meaning | Typical |
|---|---|---|
| `nlist` | # clusters | `sqrt(N)` to `N/1000` |
| `nprobe` | clusters scanned at query | 1-256 |

```python
quantizer = faiss.IndexFlatL2(d)
index = faiss.IndexIVFFlat(quantizer, d, nlist=4096, faiss.METRIC_L2)
index.train(sample)     # needs a representative training set (~256*nlist points)
index.add(corpus)
index.nprobe = 32
D, I = index.search(queries, 10)
```

IVF alone (IVFFlat) is memory-efficient (no graph) but less accurate than HNSW at equal memory. Its real strength is combining with PQ.

## IVF + PQ (IVFPQ)

Product Quantization splits each vector into `m` subvectors and quantizes each to one of `ksub` centroids. Combines with IVF for massive compression.

```python
m = 64       # subvector count (must divide d)
nbits = 8    # bits per code per subvector -> 256 centroids
quantizer = faiss.IndexFlatL2(d)
index = faiss.IndexIVFPQ(quantizer, d, nlist=8192, m, nbits)
index.train(sample)
index.add(corpus)
index.nprobe = 64
```

Memory: `m` bytes per vector (e.g. 64 bytes vs 4096 bytes for d=1024). Enables
100M+ vector indexes on a single machine. Pair with reranking on full vectors
for top-K.

## ScaNN (Google)

Uses anisotropic vector quantization tuned for maximum inner product search. Typically 2-4x faster than HNSW at equal recall on dense embeddings, especially with quantization.

```python
import scann
import numpy as np

searcher = (
    scann.scann_ops_pybind.builder(corpus, 10, "dot_product")
    .tree(num_leaves=2000, num_leaves_to_search=100, training_sample_size=250_000)
    .score_ah(dimensions_per_block=2, anisotropic_quantization_threshold=0.2)
    .reorder(100)
    .build()
)
neighbors, distances = searcher.search_batched(queries)
```

Best for: read-heavy, inference-server-style workloads with rebuild windows. Updates require a retrain.

## DiskANN (Microsoft)

Graph-based index designed for SSDs. Stores the graph + full vectors on disk, loads only what a query needs.

Strengths:
- Handles billions of vectors on a single SSD-equipped box.
- Good recall with low per-query memory.

Costs:
- Higher p99 latency (SSD I/O).
- Complex build / ingest pipelines.

Used under the hood by Vespa, Milvus (disk variant), and some managed offerings.

## LSH (Locality Sensitive Hashing)

Hash-based; projects vectors into buckets via random hyperplanes. Fast insert, fast query, but recall is mediocre on modern embeddings.

```python
index = faiss.IndexLSH(d, nbits=1024)   # nbits = number of hash bits
index.add(corpus)
D, I = index.search(queries, 10)
```

Modern use cases: dedup / near-duplicate detection on huge, low-dim, sparse-ish data, or as a prefilter before reranking. NOT the first choice for neural embeddings.

## Decision Matrix

| Scenario | Best choice |
|---|---|
| <100k vectors, needs 100% recall | Brute-force (`flat`) |
| 100k-10M, fits in RAM, <50ms latency | HNSW |
| 10M-100M, fits in RAM but tight | HNSW + scalar/binary quantization |
| 100M-1B, limited RAM | IVF+PQ or DiskANN |
| Read-only, top-recall at low latency | ScaNN |
| Insert-heavy stream | HNSW with periodic rebuild, or IVF with re-train |
| SSD-only / data residency per-box | DiskANN |
| Near-duplicate detection | LSH or MinHash |

## Recall / Latency / Memory Tradeoff

```
Memory   Latency  Recall
-----    -------  ------
Flat     worst    best recall, slowest, full vectors only
HNSW     high     low latency, near-perfect recall
IVFFlat  low      moderate latency, good recall
IVFPQ    lowest   fast, lower recall (rescore to recover)
DiskANN  disk     moderate latency, good recall on disk
ScaNN    low      lowest latency, high recall (static data)
LSH      low      fastest, poor recall on dense
```

Rule: tune for a target recall (say 95% or 98%), then compare QPS and RAM per provider.

## Benchmarking

```python
import numpy as np, time

def recall_at_k(gt: np.ndarray, pred: np.ndarray, k: int) -> float:
    # gt, pred: (Q, k) arrays of doc IDs
    return np.mean([
        len(set(pred[i, :k]) & set(gt[i, :k])) / k
        for i in range(len(gt))
    ])

# Compute ground truth with brute force on a sample
flat = faiss.IndexFlatL2(d)
flat.add(corpus)
_, gt = flat.search(queries, 10)

for ef in [32, 64, 128, 256, 512]:
    index.hnsw.efSearch = ef
    t = time.perf_counter()
    _, pred = index.search(queries, 10)
    ms = (time.perf_counter() - t) / len(queries) * 1000
    print(f"ef={ef:3d}  recall@10={recall_at_k(gt, pred, 10):.3f}  {ms:.2f} ms/q")
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Picking HNSW for a 500M-vector dataset with 64 GB RAM | Use IVF+PQ or DiskANN |
| LSH for dense neural embeddings | Use HNSW/IVF; LSH is for sparse/minhash-style data |
| Not retraining IVF centroids after distribution shift | Retrain on fresh sample periodically |
| Ignoring `num_candidates` / `ef_search` tuning | Sweep per index, report recall@k curve |
| Trusting library defaults | Every workload is different; benchmark |
| Benchmarking recall without a ground-truth flat baseline | Build `IndexFlat` on a sample for truth |
| Re-adding all vectors to HNSW after every update | Use incremental updates; rebuild on a schedule |

## Production Checklist

- [ ] Index type chosen by dataset size + latency budget + RAM
- [ ] Recall@k benchmarked on a held-out query set vs brute-force ground truth
- [ ] Parameters (m, ef, nlist, nprobe) documented in config
- [ ] Training set size for IVF/PQ verified (at least 256 * nlist)
- [ ] Update strategy defined (append, rebuild cadence)
- [ ] Memory / disk footprint budgeted
- [ ] Rescoring with full-precision vectors for quantized indexes
- [ ] Fallback brute-force path for tiny tenants or eval
