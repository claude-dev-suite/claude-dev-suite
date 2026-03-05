# Vector Indexing Algorithms

## Overview

Vector indexing determines how similarity search is performed at scale. The choice of index algorithm, its parameters, and the embedding model directly affect query speed, recall (accuracy), memory usage, and build time. This guide covers the major indexing strategies, their tradeoffs, and how to tune them for production workloads.

## Index Algorithm Comparison

| Algorithm | Type        | Build Speed | Query Speed | Recall  | Memory    | Incremental Insert |
| --------- | ----------- | ----------- | ----------- | ------- | --------- | ------------------ |
| Flat      | Exact       | Instant     | Slow (O(n)) | 100%    | Low       | Yes                |
| IVFFlat   | Approximate | Fast        | Fast        | Good    | Low       | Requires retrain   |
| HNSW      | Approximate | Slow        | Very fast   | High    | High      | Yes                |
| PQ        | Approximate | Medium      | Fast        | Lower   | Very low  | Requires retrain   |
| IVF-PQ    | Approximate | Medium      | Very fast   | Good    | Very low  | Requires retrain   |

## Flat Index (Exact Search)

Flat indexes store vectors without any transformation. Every query compares against every stored vector (brute-force). This guarantees 100% recall but does not scale.

```python
# pgvector: no index = flat search
# Just query without creating any index
SELECT id, embedding <=> query_vec AS distance
FROM documents
ORDER BY embedding <=> query_vec
LIMIT 10;
```

**When to use:**
- Dataset under 10,000-50,000 vectors
- Ground truth benchmarking (compare ANN results against exact results)
- Queries are infrequent and latency is not critical

**When NOT to use:**
- Anything above 100K vectors at interactive query speeds

## IVFFlat (Inverted File Index)

IVFFlat partitions the vector space into `nlist` clusters using k-means. At query time, it searches only the `nprobe` nearest clusters instead of the full dataset.

### How It Works

1. **Build**: Run k-means on the dataset to find `nlist` centroids
2. **Assign**: Each vector is assigned to its nearest centroid's list
3. **Query**: Find the `nprobe` nearest centroids to the query, then search only those lists

### Parameters

| Parameter | Description | Guideline |
| --------- | ----------- | --------- |
| `nlist`   | Number of clusters | `sqrt(n)` for n < 1M; `4 * sqrt(n)` for larger |
| `nprobe`  | Clusters searched per query | Start at `sqrt(nlist)`, increase for better recall |

### Tuning Example

```sql
-- pgvector: 1M vectors
CREATE INDEX ON documents
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 1000);         -- sqrt(1,000,000) = 1000

-- Query with tuned probes
SET ivfflat.probes = 32;     -- sqrt(1000) ~ 32
```

```python
# Qdrant: IVFFlat is not directly exposed; Qdrant uses HNSW by default
# FAISS (for custom pipelines):
import faiss
import numpy as np

dimension = 1536
nlist = 1000

quantizer = faiss.IndexFlatIP(dimension)
index = faiss.IndexIVFFlat(quantizer, dimension, nlist)

# Must train before adding vectors
vectors = np.random.rand(100000, dimension).astype("float32")
index.train(vectors)
index.add(vectors)

# Set nprobe at query time
index.nprobe = 32
distances, ids = index.search(query_vec, k=10)
```

### Tradeoffs

- **Pros**: Fast build, low memory overhead, simple to understand
- **Cons**: Requires training data upfront, poor recall at low nprobe, no incremental insert without retraining

## HNSW (Hierarchical Navigable Small World)

HNSW builds a multi-layer graph where each layer is a navigable small-world graph with decreasing density. Search starts at the top layer (sparse) and navigates down to the bottom layer (dense), converging on the nearest neighbors.

### How It Works

1. **Build**: Insert vectors one-by-one, connecting each to its `M` nearest neighbors at each layer
2. **Layers**: Each vector has a random layer assignment (exponential distribution). Top layers are sparse for fast navigation; the bottom layer contains all vectors.
3. **Query**: Start from an entry point at the top layer, greedily navigate to the nearest node, drop to the next layer, repeat until the bottom layer, then expand search to `ef_search` candidates

### Parameters

| Parameter          | Description                          | Guideline |
| ------------------ | ------------------------------------ | --------- |
| `M`                | Connections per node per layer       | 16 (default), 32-64 for high recall |
| `ef_construction`  | Build-time search width              | 100-200 (higher = better graph, slower build) |
| `ef_search`        | Query-time search width              | 50-200 (higher = better recall, slower query) |

### Tuning Example

```sql
-- pgvector: HNSW index
CREATE INDEX ON documents
USING hnsw (embedding vector_cosine_ops)
WITH (m = 32, ef_construction = 200);

SET hnsw.ef_search = 100;
```

```python
# Qdrant: HNSW is the default index
from qdrant_client.models import HnswConfigDiff

client.update_collection(
    collection_name="documents",
    hnsw_config=HnswConfigDiff(
        m=32,
        ef_construct=200
    )
)
# ef at query time is set per search request or collection-wide
```

```python
# FAISS HNSW
index = faiss.IndexHNSWFlat(1536, 32)   # dimension, M
index.hnsw.efConstruction = 200
index.add(vectors)
index.hnsw.efSearch = 100
distances, ids = index.search(query_vec, k=10)
```

### Parameter Impact

```
M=16, ef_construction=64:   Recall@10 ~92%, Build: 1x,   Memory: 1x
M=32, ef_construction=128:  Recall@10 ~97%, Build: 2.5x, Memory: 1.8x
M=64, ef_construction=256:  Recall@10 ~99%, Build: 6x,   Memory: 3.2x
```

### Tradeoffs

- **Pros**: Excellent recall, supports incremental inserts, fast queries at scale
- **Cons**: High memory (stores graph edges), slow build time, memory grows with `M`

## Product Quantization (PQ)

PQ compresses vectors by dividing them into subvectors and encoding each subvector with a codebook learned via k-means. This dramatically reduces memory at the cost of recall.

### How It Works

1. **Divide**: Split each vector into `m` subvectors
2. **Train**: Learn `k` centroids per subvector space (typically k=256, stored in 1 byte)
3. **Encode**: Replace each subvector with its nearest centroid ID
4. **Query**: Use asymmetric distance computation (original query vs compressed database)

### Parameters

| Parameter    | Description                  | Guideline |
| ------------ | ---------------------------- | --------- |
| `m`          | Number of subquantizers      | Dimension must be divisible by m. Typical: 8, 16, 32 |
| `nbits`      | Bits per code (default 8)    | 8 gives 256 centroids per subvector |

```python
# FAISS PQ
dimension = 1536
m = 48           # 1536 / 48 = 32 dimensions per subquantizer
nbits = 8

index = faiss.IndexPQ(dimension, m, nbits)
index.train(vectors)     # Must train on representative data
index.add(vectors)

distances, ids = index.search(query_vec, k=10)
# Memory: 48 bytes per vector (vs 6144 bytes for float32 flat)
```

### IVF + PQ (Combined)

Combines IVF clustering with PQ compression for both fast search and low memory.

```python
# FAISS IVF-PQ
nlist = 1000
m = 48
nbits = 8

quantizer = faiss.IndexFlatL2(dimension)
index = faiss.IndexIVFPQ(quantizer, dimension, nlist, m, nbits)
index.train(vectors)
index.add(vectors)
index.nprobe = 32

distances, ids = index.search(query_vec, k=10)
```

## ANN vs Exact Search Tradeoffs

| Factor           | Exact (Flat)        | ANN (HNSW/IVF)         |
| ---------------- | ------------------- | ----------------------- |
| Recall           | 100%                | 90-99.9% (tunable)     |
| Query latency    | O(n)                | O(log n) to O(sqrt(n)) |
| Memory           | n * d * 4 bytes     | Varies by algorithm     |
| Build time       | None                | Minutes to hours        |
| Insert           | Instant             | HNSW: instant, IVF: retrain |
| Dataset size     | Up to ~50K          | Millions to billions    |

### Measuring Recall

Always benchmark ANN recall against exact search on your actual data:

```python
import numpy as np

def recall_at_k(exact_ids, ann_ids, k):
    """Calculate recall@k: fraction of true top-k found by ANN."""
    recalls = []
    for exact, ann in zip(exact_ids, ann_ids):
        true_set = set(exact[:k])
        found_set = set(ann[:k])
        recalls.append(len(true_set & found_set) / k)
    return np.mean(recalls)

# Example: compare HNSW vs flat
flat_index = faiss.IndexFlatL2(dimension)
flat_index.add(vectors)
exact_D, exact_I = flat_index.search(queries, k=10)

hnsw_index = faiss.IndexHNSWFlat(dimension, 32)
hnsw_index.add(vectors)
hnsw_D, hnsw_I = hnsw_index.search(queries, k=10)

print(f"Recall@10: {recall_at_k(exact_I, hnsw_I, 10):.4f}")
```

## Dimensionality Considerations

| Dimensions | Memory per 1M vectors (float32) | Typical Source |
| ---------- | ------------------------------- | -------------- |
| 384        | 1.5 GB                         | MiniLM, BGE-small |
| 768        | 3.0 GB                         | BGE-base, E5-base |
| 1024       | 4.0 GB                         | Cohere embed-v3 |
| 1536       | 6.0 GB                         | OpenAI text-embedding-3-small |
| 3072       | 12.0 GB                        | OpenAI text-embedding-3-large |

### Dimensionality Reduction

Some models support native dimension reduction via Matryoshka Representation Learning:

```python
# OpenAI text-embedding-3-small supports dimension reduction
response = openai.embeddings.create(
    input="Hello world",
    model="text-embedding-3-small",
    dimensions=512              # Reduce from 1536 to 512
)
# ~5% quality loss, 3x less storage
```

For other models, use PCA or random projection:

```python
from sklearn.decomposition import PCA

pca = PCA(n_components=512)
reduced_vectors = pca.fit_transform(original_vectors)
# Normalize after PCA if using cosine distance
reduced_vectors = reduced_vectors / np.linalg.norm(reduced_vectors, axis=1, keepdims=True)
```

## Embedding Model Selection

| Model | Dimensions | Context | Strengths |
| ----- | ---------- | ------- | --------- |
| OpenAI text-embedding-3-small | 1536 (adjustable) | 8191 tokens | Best quality/cost ratio, Matryoshka dims |
| OpenAI text-embedding-3-large | 3072 (adjustable) | 8191 tokens | Highest quality, adjustable dims |
| Cohere embed-v3 | 1024 | 512 tokens | Strong multilingual, search/classification modes |
| BGE-large-en-v1.5 | 1024 | 512 tokens | Open-source, excellent English benchmarks |
| all-MiniLM-L6-v2 | 384 | 256 tokens | Lightweight, fast, good for prototyping |
| E5-mistral-7b-instruct | 4096 | 32768 tokens | Long context, instruction-tuned |
| nomic-embed-text-v1.5 | 768 | 8192 tokens | Open-source, Matryoshka, long context |

### Choosing an Embedding Model

1. **Start with OpenAI text-embedding-3-small at 1536 dims** for general-purpose RAG and search.
2. **Use all-MiniLM-L6-v2** for prototyping, local development, and when you cannot call external APIs.
3. **Use Cohere embed-v3** when you need multilingual support or have short documents.
4. **Use BGE or E5 models** when you need open-source, self-hosted embeddings.
5. **Reduce dimensions** (Matryoshka or PCA) when storage cost exceeds quality requirements.

## Benchmark Framework

```python
import time
import numpy as np
import faiss

def benchmark_index(index, queries, ground_truth_ids, k=10):
    """Benchmark an index for latency and recall."""
    start = time.perf_counter()
    _, result_ids = index.search(queries, k)
    elapsed = time.perf_counter() - start

    recall = recall_at_k(ground_truth_ids, result_ids, k)
    qps = len(queries) / elapsed

    return {
        "recall@k": recall,
        "qps": qps,
        "latency_ms": (elapsed / len(queries)) * 1000,
        "memory_mb": index.sa_code_size() * index.ntotal / (1024 * 1024)
            if hasattr(index, "sa_code_size") else "N/A"
    }

# Compare multiple configurations
configs = [
    ("Flat", faiss.IndexFlatL2(dim)),
    ("IVF1000", build_ivf(dim, 1000, vectors)),
    ("HNSW-M16", build_hnsw(dim, 16, vectors)),
    ("HNSW-M32", build_hnsw(dim, 32, vectors)),
    ("IVF-PQ", build_ivfpq(dim, 1000, 48, vectors)),
]

for name, index in configs:
    result = benchmark_index(index, test_queries, ground_truth, k=10)
    print(f"{name}: Recall={result['recall@k']:.4f}, QPS={result['qps']:.0f}")
```

## Index Parameter Tuning Guide

### Step-by-Step Tuning Process

1. **Establish baseline**: Run exact search on a sample (1000-10000 queries) to get ground truth
2. **Start with defaults**: HNSW M=16, ef_construction=64, ef_search=40
3. **Increase ef_search**: Double it until recall@10 meets your target (usually > 95%)
4. **If recall is still low**: Increase M (try 32, then 64) and ef_construction (128, 200)
5. **Measure latency**: If queries are too slow, reduce ef_search until latency is acceptable
6. **Trade memory**: If memory is the constraint, consider PQ or scalar quantization

### Target Recall Guidelines

| Use Case | Target Recall@10 | Suggested Config |
| -------- | ----------------- | ---------------- |
| Prototyping | > 90% | HNSW M=16, ef=40 |
| Production search | > 95% | HNSW M=32, ef=100 |
| Critical retrieval (RAG) | > 98% | HNSW M=48, ef=200 |
| Compliance/legal | 100% | Flat (exact) or HNSW M=64, ef=500 |

## Anti-Patterns

- **Using flat index for datasets over 100K vectors**: Query time scales linearly. Switch to ANN.
- **Training IVF on a small sample**: k-means needs representative data. Train on at least 30 * nlist vectors.
- **Setting ef_search lower than k**: HNSW cannot return k results if ef_search < k. Always ensure ef_search >= k.
- **Ignoring recall measurement**: ANN indexes sacrifice recall for speed. Always measure recall on your data; do not assume default parameters are sufficient.
- **Over-dimensioning embeddings**: Higher dimensions are not always better. Measure quality at reduced dimensions before paying the storage cost.
- **Mixing distance metrics**: Using cosine-trained embeddings with L2 distance (or vice versa) produces incorrect rankings. Match the metric to your embedding model.

## Production Checklist

- [ ] Embedding model selected based on use case (quality, latency, cost)
- [ ] Vector dimensions optimized (Matryoshka reduction if available)
- [ ] Index algorithm selected (HNSW for most production workloads)
- [ ] Index parameters tuned against ground-truth recall benchmarks
- [ ] Recall@k measured and documented (target > 95% for production)
- [ ] Memory budget calculated (vectors + index overhead)
- [ ] Query latency benchmarked under expected load
- [ ] Distance metric matches embedding normalization
- [ ] Incremental insert strategy defined (HNSW supports it; IVF needs periodic retrain)
- [ ] Monitoring in place for recall degradation over time as data distribution shifts
