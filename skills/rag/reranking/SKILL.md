---
name: reranking
description: |
  Reranking retrieved documents with cross-encoders and LLM rerankers. Cohere Rerank
  v3, Voyage rerank-2, BGE reranker, ColBERT late interaction, Jina reranker. Cost
  and latency tradeoffs, top-K in / top-N out strategy.

  USE WHEN: user mentions "rerank", "reranker", "cross-encoder", "Cohere Rerank",
  "Voyage rerank", "BGE reranker", "ColBERT", "Jina reranker", "bi-encoder"

  DO NOT USE FOR: initial retrieval - use `advanced-retrieval` or `hybrid-search`;
  query rewriting - use `query-transformations`; agent decisions - use `agentic-rag`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Reranking

## Bi-Encoder vs Cross-Encoder

| Aspect | Bi-encoder (retrieval) | Cross-encoder (reranking) |
|---|---|---|
| Encoding | Query and doc encoded separately | Query + doc encoded jointly |
| Index time | Precompute doc vectors | No precompute possible |
| Query time | ANN search in ms | One forward pass per (query, doc) pair |
| Scaling | Millions of docs | Tens to hundreds of docs per query |
| Quality | Good recall | Great precision |

The standard production pattern: bi-encoder retrieves 50-200 candidates, cross-encoder scores each candidate against the query, keep top 3-10.

## When to Rerank vs Skip

Rerank when:
- Corpus > 10k chunks.
- Hybrid search or query rewriting returns redundant / near-duplicate results.
- Answer quality is mission-critical (legal, medical, support).
- You are willing to pay +100-400ms and $0.001-0.002/query.

Skip when:
- Corpus < 1k chunks and retrieval recall@5 is already > 90%.
- P95 latency budget is under 1s end-to-end.
- All candidates will fit in the LLM prompt anyway.

## Top-K In / Top-N Out

```
Retrieve top 50 -> Rerank -> Keep top 5 -> LLM
```

Rerank inputs should be 5-10x your final N. Too few inputs and reranker cannot find the best; too many and latency spikes.

## Cohere Rerank v3 (recommended default)

```python
import cohere
co = cohere.ClientV2()

def cohere_rerank(query: str, docs: list[str], top_n: int = 5):
    resp = co.rerank(
        model="rerank-v3.5",  # multilingual; use rerank-english-v3.0 for EN-only
        query=query,
        documents=docs,
        top_n=top_n,
    )
    return [(r.index, r.relevance_score) for r in resp.results]
```

LangChain wrapper:

```python
from langchain_cohere import CohereRerank
from langchain.retrievers import ContextualCompressionRetriever

reranker = CohereRerank(model="rerank-v3.5", top_n=5)
retriever = ContextualCompressionRetriever(
    base_compressor=reranker,
    base_retriever=hybrid_retriever,
)
```

Cost: ~$2 per 1k search units (1 search unit = 1 query + up to 100 docs, chunked). Latency: 100-300ms at top-n=5, top-k=50.

## Voyage rerank-2

```python
import voyageai
vo = voyageai.Client()

def voyage_rerank(query: str, docs: list[str], top_k: int = 5):
    resp = vo.rerank(query=query, documents=docs, model="rerank-2", top_k=top_k)
    return [(r.index, r.relevance_score) for r in resp.results]
```

Voyage's rerank-2 is competitive with Cohere on English and strong on code. `rerank-2-lite` is cheaper and faster for low-stakes.

## Jina Reranker v2

```python
import requests, os

def jina_rerank(query: str, docs: list[str], top_n: int = 5):
    r = requests.post(
        "https://api.jina.ai/v1/rerank",
        headers={"Authorization": f"Bearer {os.environ['JINA_API_KEY']}"},
        json={
            "model": "jina-reranker-v2-base-multilingual",
            "query": query,
            "documents": docs,
            "top_n": top_n,
        },
        timeout=10,
    )
    r.raise_for_status()
    return [(x["index"], x["relevance_score"]) for x in r.json()["results"]]
```

## BGE Reranker (self-hosted)

```python
from FlagEmbedding import FlagReranker

# bge-reranker-v2-m3: multilingual, 568M params; bge-reranker-base: EN-only, 278M
reranker = FlagReranker("BAAI/bge-reranker-v2-m3", use_fp16=True)

def bge_rerank(query: str, docs: list[str], top_n: int = 5):
    pairs = [[query, d] for d in docs]
    scores = reranker.compute_score(pairs, normalize=True)
    ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)[:top_n]
    return ranked  # list of (index, score)
```

Run on a T4 GPU: ~20ms for 50 pairs. Zero per-query cost after infra. Best choice when data cannot leave your network.

## ColBERT Late Interaction

ColBERT encodes each token of query and doc separately, scores via MaxSim between token vectors. Higher quality than single-vector bi-encoders, cheaper than full cross-encoders.

```python
from ragatouille import RAGPretrainedModel

rag = RAGPretrainedModel.from_pretrained("colbert-ir/colbertv2.0")
rag.index(collection=documents, index_name="kb")

# Used as retriever, not just reranker
results = rag.search(query="token refresh flow", k=10)

# Or as reranker over a candidate list
reranked = rag.rerank(query="token refresh flow", documents=candidates, k=5)
```

Storage cost ~4x single-vector indexes, but no separate reranker needed.

## LLM-as-Reranker (Claude / GPT)

Useful when the reranker needs reasoning or instructions. Slower and pricier.

```python
from anthropic import Anthropic
import json

client = Anthropic()

PROMPT = """You are ranking passages for relevance to a query.
Score each passage from 0 to 10 for how directly it answers the query.
Return a JSON array of objects: {{"index": int, "score": float}}.

Query: {q}

Passages:
{passages}"""

def llm_rerank(query: str, docs: list[str], top_n: int = 5):
    numbered = "\n\n".join(f"[{i}] {d}" for i, d in enumerate(docs))
    msg = client.messages.create(
        model="claude-haiku-4-5-20250929", max_tokens=2048,
        messages=[{"role": "user", "content": PROMPT.format(q=query, passages=numbered)}],
    )
    scored = json.loads(msg.content[0].text)
    ranked = sorted(scored, key=lambda x: x["score"], reverse=True)[:top_n]
    return [(s["index"], s["score"]) for s in ranked]
```

Use Haiku — Sonnet/Opus for reranking is almost always overkill.

## Cost and Latency Comparison (ballpark)

| Reranker | Latency (50 docs) | Cost / 1k queries | Quality (MTEB rerank) |
|---|---|---|---|
| Cohere rerank-v3.5 | 100-300ms | ~$2.00 | High |
| Voyage rerank-2 | 100-250ms | ~$1.50 | High |
| Jina v2 base | 150-300ms | ~$1.00 | Mid-High |
| BGE v2-m3 (self-host T4) | 20-80ms | Infra only | Mid-High |
| ColBERT v2 (self-host) | 10-40ms | Infra only | Mid-High (retrieval-grade) |
| LLM (Claude Haiku) | 300-800ms | ~$3-8 | High (instructable) |

All numbers are order-of-magnitude; measure in your environment.

## Production Pipeline Example

```python
async def retrieve_and_rerank(query: str, top_n: int = 5):
    candidates = await hybrid_retriever.ainvoke(query)  # 50 docs
    docs_text = [d.page_content for d in candidates]
    pairs = cohere_rerank(query, docs_text, top_n=top_n)
    return [candidates[i] for i, score in pairs if score > 0.2]  # drop low-conf
```

The score threshold (0.2 here) is corpus-specific; calibrate with a gold set.

## Stacking Rerankers

Two-stage rerank for very large candidate pools:

```
Retrieve 500 -> BGE (self-host) rerank to 50 -> Cohere rerank to 5 -> LLM
```

Only worth it when retrieval recall@50 is too low; usually better to fix retrieval.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Reranking only top 5 | Send 5-10x your final N (at least 25-50) |
| Reranking the full corpus | Reranking is quadratic in #docs; retrieve first |
| LLM reranking with Opus | Use Haiku — quality barely changes, cost 10x lower |
| No score threshold | Drop candidates below a calibrated score |
| Single model for all domains | Cohere/Voyage for English; BGE-m3 for multilingual self-host |
| Synchronous reranker call in user path | Set a hard timeout; fall back to raw retrieval |
| Re-encoding docs on every query | Cross-encoder does this by design; that is the cost |
| Ignoring reranker evaluation | Log score distributions; alert on drift |

## Production Checklist

- [ ] Retrieve at least 5x final_n before reranking
- [ ] Timeout on reranker call (300-500ms) with fallback to retrieval order
- [ ] Relevance score threshold calibrated on gold set
- [ ] Reranker model pinned by version (API or weights)
- [ ] Async batch reranking across concurrent queries if possible
- [ ] Cost per query dashboarded
- [ ] A/B harness compares reranker on vs off
- [ ] Score normalization documented (Cohere = 0-1, BGE = variable)
- [ ] Self-host fallback for vendor outage
- [ ] Latency budget allocated (typically 100-400ms)
