---
name: hybrid-search
description: |
  Combining sparse (BM25, SPLADE) and dense vector retrieval. Reciprocal rank fusion
  with formula and code, weighted score fusion, alpha tuning, and native hybrid
  indexes in Pinecone, Qdrant, Weaviate.

  USE WHEN: user mentions "hybrid search", "BM25", "sparse dense", "RRF", "reciprocal
  rank fusion", "SPLADE", "learned sparse", "alpha tuning", "sparse dense hybrid"

  DO NOT USE FOR: rewriting queries before retrieval - use `query-transformations`;
  reranking after retrieval - use `reranking`; vector DB setup - use `vector-databases`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Hybrid Search

## Why Hybrid

Dense vectors capture meaning but miss exact terms (product SKUs, error codes, proper nouns, code tokens). BM25 nails lexical matches but misses synonyms and paraphrases. Fusion consistently beats either alone on real-world corpora — typically +10-20% recall@10.

## Fusion Algorithms

| Algorithm | Needs score calibration | Robust to list-size mismatch | Tunable |
|---|---|---|---|
| RRF (Reciprocal Rank Fusion) | No | Yes | k_constant |
| Weighted linear (alpha) | Yes (min-max normalize) | No | alpha |
| CombSUM / CombMNZ | Yes | Partial | No |
| Learned fusion (LTR) | Yes | Yes | Model |

Default to RRF unless you have a labeled dataset for alpha tuning.

## RRF: Formula and Code

```
score(d) = sum over rankings r of  1 / (k + rank_r(d))
```

`k` (the RRF constant) is typically 60 in the original TREC paper. Larger `k` = more uniform contribution from low ranks.

```python
from collections import defaultdict

def rrf(rankings: list[list[str]], k: int = 60) -> list[tuple[str, float]]:
    """Each ranking is a list of doc IDs ordered by score desc."""
    scores = defaultdict(float)
    for ranking in rankings:
        for rank, doc_id in enumerate(ranking):
            scores[doc_id] += 1.0 / (k + rank + 1)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)
```

Works across any number of rankers. No score calibration needed.

## BM25 + Dense with RRF (Python, from scratch)

```python
from rank_bm25 import BM25Okapi
from langchain_openai import OpenAIEmbeddings
import numpy as np

class HybridIndex:
    def __init__(self, docs: list[str], emb_model="text-embedding-3-small"):
        self.docs = docs
        self.bm25 = BM25Okapi([d.lower().split() for d in docs])
        self.embeddings = OpenAIEmbeddings(model=emb_model)
        self.vecs = np.array(self.embeddings.embed_documents(docs))

    def bm25_rank(self, q: str, k: int) -> list[int]:
        scores = self.bm25.get_scores(q.lower().split())
        return list(np.argsort(scores)[::-1][:k])

    def dense_rank(self, q: str, k: int) -> list[int]:
        qv = np.array(self.embeddings.embed_query(q))
        sims = self.vecs @ qv / (np.linalg.norm(self.vecs, axis=1) * np.linalg.norm(qv))
        return list(np.argsort(sims)[::-1][:k])

    def search(self, q: str, k_each: int = 50, top_k: int = 10, rrf_k: int = 60):
        bm = self.bm25_rank(q, k_each)
        dn = self.dense_rank(q, k_each)
        fused = rrf([[str(i) for i in bm], [str(i) for i in dn]], k=rrf_k)[:top_k]
        return [(int(doc_id), score) for doc_id, score in fused]
```

Retrieve 50 from each side, fuse, keep top 10. Both searches can run in parallel (`asyncio.gather`).

## LangChain EnsembleRetriever (RRF under the hood)

```python
from langchain_community.retrievers import BM25Retriever
from langchain.retrievers import EnsembleRetriever
from langchain_qdrant import QdrantVectorStore
from langchain_openai import OpenAIEmbeddings

bm25 = BM25Retriever.from_documents(docs); bm25.k = 50
dense = QdrantVectorStore.from_documents(
    docs, OpenAIEmbeddings(model="text-embedding-3-small"), collection_name="kb"
).as_retriever(search_kwargs={"k": 50})

hybrid = EnsembleRetriever(retrievers=[bm25, dense], weights=[0.4, 0.6], c=60)
results = hybrid.invoke("oauth token refresh 403 error")
```

`weights` feed into RRF as multiplicative weights: `w_i / (k + rank)`. Equal weights = vanilla RRF.

## Weighted Linear Fusion (Alpha)

Useful when you have labeled pairs to tune alpha.

```python
def normalize(scores: np.ndarray) -> np.ndarray:
    lo, hi = scores.min(), scores.max()
    return (scores - lo) / (hi - lo + 1e-9)

def alpha_fuse(bm25_scores: dict[str, float], dense_scores: dict[str, float],
               alpha: float = 0.5) -> list[tuple[str, float]]:
    ids = set(bm25_scores) | set(dense_scores)
    bm = normalize(np.array([bm25_scores.get(i, 0.0) for i in ids]))
    dn = normalize(np.array([dense_scores.get(i, 0.0) for i in ids]))
    fused = alpha * dn + (1 - alpha) * bm
    return sorted(zip(ids, fused.tolist()), key=lambda x: x[1], reverse=True)
```

### Tuning Alpha with a Gold Set

```python
def recall_at_k(retrieved: list[str], relevant: set[str], k: int) -> float:
    return len(set(retrieved[:k]) & relevant) / max(len(relevant), 1)

def tune_alpha(eval_set, retriever_bm25, retriever_dense, k: int = 5):
    best_alpha, best_score = 0.5, 0.0
    for alpha in np.arange(0.0, 1.01, 0.1):
        scores = []
        for q, relevant_ids in eval_set:
            bm = retriever_bm25.scored(q, k=50)
            dn = retriever_dense.scored(q, k=50)
            fused_ids = [i for i, _ in alpha_fuse(dict(bm), dict(dn), alpha)][:k]
            scores.append(recall_at_k(fused_ids, set(relevant_ids), k))
        mean = np.mean(scores)
        if mean > best_score:
            best_score, best_alpha = mean, alpha
    return best_alpha, best_score
```

Typical sweet spot: alpha 0.5-0.75 in English docs. Code/technical corpora skew lower (more lexical).

## Learned Sparse: SPLADE

SPLADE produces sparse vectors with learned term weights (not raw counts). Outperforms BM25 on out-of-domain benchmarks but requires a GPU for indexing.

```python
from transformers import AutoTokenizer, AutoModelForMaskedLM
import torch

tokenizer = AutoTokenizer.from_pretrained("naver/splade-v3")
model = AutoModelForMaskedLM.from_pretrained("naver/splade-v3").eval()

def splade_encode(text: str) -> dict[int, float]:
    toks = tokenizer(text, return_tensors="pt", truncation=True, max_length=256)
    with torch.no_grad():
        logits = model(**toks).logits  # (1, seq, vocab)
    weights = torch.max(
        torch.log(1 + torch.relu(logits)) * toks.attention_mask.unsqueeze(-1),
        dim=1,
    ).values.squeeze(0)  # (vocab,)
    nonzero = torch.nonzero(weights).squeeze(-1)
    return {int(i): float(weights[i]) for i in nonzero}
```

Index the sparse dict in a sparse-capable store (Pinecone, Qdrant, Vespa, Elasticsearch).

## Native Hybrid in Managed Vector DBs

### Pinecone (sparse-dense hybrid)

```python
from pinecone import Pinecone

pc = Pinecone()
index = pc.index("hybrid-kb")

index.upsert([{
    "id": "doc1",
    "values": dense_vec,            # dense
    "sparse_values": {              # sparse (BM25 or SPLADE)
        "indices": [3, 17, 42],
        "values": [0.9, 0.6, 0.3],
    },
    "metadata": {"source": "manual"},
}])

# Alpha weights dense vs sparse
def hybrid_scale(dense, sparse, alpha):
    return (
        [v * alpha for v in dense],
        {"indices": sparse["indices"], "values": [v * (1 - alpha) for v in sparse["values"]]},
    )

d, s = hybrid_scale(query_dense, query_sparse, alpha=0.7)
results = index.query(vector=d, sparse_vector=s, top_k=10)
```

### Qdrant (named vectors + sparse)

```python
from qdrant_client import QdrantClient
from qdrant_client.models import (
    VectorParams, SparseVectorParams, Distance, SparseVector,
    Prefetch, FusionQuery, Fusion,
)

client = QdrantClient(url="http://localhost:6333")
client.create_collection(
    "kb",
    vectors_config={"dense": VectorParams(size=1536, distance=Distance.COSINE)},
    sparse_vectors_config={"sparse": SparseVectorParams()},
)

# Query API v1.10+ with native RRF fusion
result = client.query_points(
    collection_name="kb",
    prefetch=[
        Prefetch(query=query_dense, using="dense", limit=50),
        Prefetch(query=SparseVector(indices=idx, values=vals), using="sparse", limit=50),
    ],
    query=FusionQuery(fusion=Fusion.RRF),
    limit=10,
)
```

### Weaviate (alpha parameter)

```python
import weaviate
client = weaviate.connect_to_local()
coll = client.collections.get("KB")

result = coll.query.hybrid(
    query="oauth token refresh",
    alpha=0.75,        # 0 = pure BM25, 1 = pure vector
    fusion_type=weaviate.classes.query.HybridFusion.RELATIVE_SCORE,  # or RANKED (RRF)
    limit=10,
)
```

## Parallel Execution Pattern

```python
import asyncio

async def hybrid_async(bm25_ret, dense_ret, q: str, k: int = 50):
    bm_task = asyncio.create_task(bm25_ret.ainvoke(q))
    dn_task = asyncio.create_task(dense_ret.ainvoke(q))
    bm, dn = await asyncio.gather(bm_task, dn_task)
    return rrf([[d.id for d in bm[:k]], [d.id for d in dn[:k]]])
```

Both legs run in parallel — latency equals the slower side, not the sum.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Pure dense on domain-specific jargon | Always add BM25 or SPLADE |
| Weighted fusion without normalization | Min-max normalize, then weight |
| Retrieving k=10 from each side | Retrieve k=50-100 each, fuse, take 10 |
| RRF with k_constant=0 | Use 60; small k over-rewards rank 1 |
| Running legs serially | `asyncio.gather` — parallelize |
| Tuning alpha on train set only | Hold out a test set; watch overfitting |
| Ignoring doc IDs in fusion | Fuse on stable IDs, not string equality |
| SPLADE on CPU in production | GPU encode at ingest; BM25 is the CPU-friendly sparse |

## Production Checklist

- [ ] RRF implemented with `k=60` as baseline
- [ ] Both retrievers return stable doc IDs (not content hashes that flap)
- [ ] Retrieve 50+ per leg before fusion
- [ ] Parallel async execution for both legs
- [ ] Alpha tuned against a gold set when using weighted fusion
- [ ] Sparse vectors versioned (BM25 idf changes with corpus updates)
- [ ] SPLADE (if used) warmed in GPU pool; fallback to BM25
- [ ] Fusion strategy selectable per query type
- [ ] Metrics: recall@k per leg and fused, compared monthly
- [ ] Reranker layered on top (see `reranking`)
