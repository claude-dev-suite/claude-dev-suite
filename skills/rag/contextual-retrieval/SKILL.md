---
name: contextual-retrieval
description: |
  Anthropic's Contextual Retrieval technique in depth. Prepend LLM-generated
  chunk-specific context (Claude Haiku) to each chunk before indexing. Combines
  contextual BM25 + contextual embeddings + reranking for up to 67% retrieval
  failure reduction. Full production pipeline with prompt caching (90% cost cut),
  batch processing, and eval numbers.

  USE WHEN: user mentions "contextual retrieval", "contextual embeddings",
  "Anthropic contextual retrieval", "chunk context", "contextual BM25",
  "49% retrieval improvement"

  DO NOT USE FOR: generic chunking - use `chunking-strategies`;
  hybrid search fundamentals - use `hybrid-search`;
  reranking on its own - use `reranking`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Contextual Retrieval

## The Core Idea

A chunk lifted from a long document loses context. "The company reported 3% revenue growth" does not say which company or which period. Anthropic's Contextual Retrieval prepends a short LLM-generated context string to each chunk before embedding and BM25 indexing.

From Anthropic's 2024 research (Pro Research team):

| Technique | Retrieval failure rate | Reduction |
|---|---|---|
| Embeddings only (baseline) | 5.7% | — |
| + BM25 (hybrid) | 4.7% | 17.5% |
| + Contextual embeddings | 3.7% | 35% |
| + Contextual BM25 | 2.9% | 49% |
| + Reranking | 1.9% | 67% |

Measured as `failure@20` on a mixed corpus (codebases, scientific papers, fiction).

## The Pipeline

```
[Doc] -> [Chunk] -> per-chunk LLM context via prompt cache -> [context + chunk]
                                                                    |
                                   +--------------------------------+
                                   |                                |
                             [embedding]                      [BM25 tokens]
                                   |                                |
                              [vector DB]                       [BM25 index]
                                   |                                |
                                   +---------- query ---------------+
                                                    |
                                          [RRF fusion top 150]
                                                    |
                                             [reranker top 20]
```

## Context Generation Prompt

The prompt Anthropic published. Do not paraphrase — it is tuned.

```python
CONTEXT_PROMPT = """<document>
{whole_document}
</document>

Here is the chunk we want to situate within the whole document:
<chunk>
{chunk_content}
</chunk>

Please give a short succinct context to situate this chunk within the overall
document for the purposes of improving search retrieval of the chunk. Answer
only with the succinct context and nothing else."""
```

Output is typically 50-100 tokens. Prepend to the chunk with a newline before indexing.

## Full Python Implementation with Prompt Caching

Prompt caching is the reason this is affordable — the whole document sits in the cache, then every chunk reuses it.

```python
from anthropic import Anthropic
from dataclasses import dataclass
import time

client = Anthropic()

@dataclass
class ContextualChunk:
    doc_id: str
    chunk_index: int
    original: str
    context: str
    combined: str  # context + "\n\n" + original

def contextualize_document(doc_id: str, document: str, chunks: list[str]) -> list[ContextualChunk]:
    """
    Generate context for every chunk of a document, reusing the cached document prefix.
    """
    out: list[ContextualChunk] = []
    for i, chunk in enumerate(chunks):
        resp = client.messages.create(
            model="claude-haiku-4-5-20250929",
            max_tokens=200,
            system=[
                {
                    "type": "text",
                    "text": "<document>\n" + document + "\n</document>",
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Here is the chunk we want to situate within the whole document:\n"
                        f"<chunk>\n{chunk}\n</chunk>\n\n"
                        "Please give a short succinct context to situate this chunk within "
                        "the overall document for the purposes of improving search retrieval "
                        "of the chunk. Answer only with the succinct context and nothing else."
                    ),
                }
            ],
        )
        context = resp.content[0].text.strip()
        out.append(ContextualChunk(
            doc_id=doc_id,
            chunk_index=i,
            original=chunk,
            context=context,
            combined=f"{context}\n\n{chunk}",
        ))
    return out
```

The cache TTL is 5 minutes (ephemeral). Process all chunks of one document within that window so every call after the first is a cache hit.

### Cost Math

With claude-haiku-4-5 at (approximate 2025) pricing $0.80 / M input tokens, $4 / M output:

- Document: 100k tokens, 100 chunks.
- Without caching: `100 * 100k input = 10M input` -> $8 per document.
- With caching (write once + 99 reads): `100k base write (1.25x) + 99 * 100k * 0.1 read = 1.1M effective` -> ~$0.88.
- ~90% cost reduction.

Always enable prompt caching. It is the difference between a research demo and a production pipeline.

## Batch Processing via Message Batches API

For the first-time ingestion of a large corpus, use the Batches API (50% cheaper, async, 24h SLA).

```python
from anthropic import Anthropic
import json

client = Anthropic()

def build_batch_requests(doc_id: str, document: str, chunks: list[str]) -> list[dict]:
    system_cached = [{
        "type": "text",
        "text": "<document>\n" + document + "\n</document>",
        "cache_control": {"type": "ephemeral"},
    }]
    return [
        {
            "custom_id": f"{doc_id}::{i}",
            "params": {
                "model": "claude-haiku-4-5-20250929",
                "max_tokens": 200,
                "system": system_cached,
                "messages": [{
                    "role": "user",
                    "content": (
                        f"<chunk>\n{chunk}\n</chunk>\n\n"
                        "Please give a short succinct context to situate this chunk within "
                        "the overall document for the purposes of improving search retrieval "
                        "of the chunk. Answer only with the succinct context and nothing else."
                    ),
                }],
            },
        }
        for i, chunk in enumerate(chunks)
    ]

def submit_batch(requests: list[dict]) -> str:
    batch = client.messages.batches.create(requests=requests)
    return batch.id

def collect_batch(batch_id: str) -> dict[str, str]:
    batch = client.messages.batches.retrieve(batch_id)
    while batch.processing_status != "ended":
        time.sleep(30)
        batch = client.messages.batches.retrieve(batch_id)
    out = {}
    for result in client.messages.batches.results(batch_id):
        if result.result.type == "succeeded":
            text = result.result.message.content[0].text.strip()
            out[result.custom_id] = text
    return out
```

Combine with caching: batch jobs still honor `cache_control`. ~95% cost reduction on cold ingest.

## Indexing the Contextualized Chunks

Index `combined` text — not `original` — into both BM25 and the vector store. Keep `original` in the document store for final LLM context.

```python
from rank_bm25 import BM25Okapi
from langchain_qdrant import QdrantVectorStore
from langchain_openai import OpenAIEmbeddings
from langchain_core.documents import Document

def index(ctx_chunks: list[ContextualChunk]):
    docs = [
        Document(
            page_content=c.combined,
            metadata={
                "doc_id": c.doc_id,
                "chunk_index": c.chunk_index,
                "original": c.original,
                "context": c.context,
            },
        )
        for c in ctx_chunks
    ]

    vstore = QdrantVectorStore.from_documents(
        docs, OpenAIEmbeddings(model="text-embedding-3-large"),
        collection_name="kb_contextual"
    )

    tokenized = [d.page_content.lower().split() for d in docs]
    bm25 = BM25Okapi(tokenized)

    return vstore, bm25, docs
```

## Hybrid Search with RRF

```python
from collections import defaultdict

def reciprocal_rank_fusion(results_lists: list[list[str]], k: int = 60) -> list[tuple[str, float]]:
    scores = defaultdict(float)
    for results in results_lists:
        for rank, doc_id in enumerate(results):
            scores[doc_id] += 1.0 / (k + rank + 1)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)

def retrieve(query: str, vstore, bm25, docs, top_k: int = 150) -> list[Document]:
    dense_hits = vstore.similarity_search(query, k=top_k)
    dense_ids = [d.metadata["doc_id"] + "::" + str(d.metadata["chunk_index"]) for d in dense_hits]

    tokenized_q = query.lower().split()
    sparse_scores = bm25.get_scores(tokenized_q)
    top_sparse_idx = sorted(range(len(sparse_scores)), key=lambda i: sparse_scores[i], reverse=True)[:top_k]
    sparse_ids = [docs[i].metadata["doc_id"] + "::" + str(docs[i].metadata["chunk_index"])
                  for i in top_sparse_idx]

    fused = reciprocal_rank_fusion([dense_ids, sparse_ids])
    id_to_doc = {f"{d.metadata['doc_id']}::{d.metadata['chunk_index']}": d for d in docs}
    return [id_to_doc[fid] for fid, _ in fused[:top_k] if fid in id_to_doc]
```

## Add Reranking (biggest single lift at top-K)

```python
import cohere

co = cohere.Client()

def rerank(query: str, candidates: list[Document], top_n: int = 20) -> list[Document]:
    texts = [d.page_content for d in candidates]
    results = co.rerank(
        query=query, documents=texts, top_n=top_n, model="rerank-english-v3.0"
    )
    return [candidates[r.index] for r in results.results]
```

Anthropic's eval: reranking on top of contextual hybrid dropped failure from 2.9% to 1.9% — another 35% of remaining errors gone.

## Passing Original Text to the LLM

Index `combined`, but build the final prompt with `original` so the model does not see the synthetic context string (it was for retrieval, not generation).

```python
def build_answer_context(ranked: list[Document]) -> str:
    return "\n\n".join(
        f"[doc={d.metadata['doc_id']} chunk={d.metadata['chunk_index']}]\n{d.metadata['original']}"
        for d in ranked
    )
```

## When Contextual Retrieval Is Not Worth It

| Corpus size | Use contextual? |
|---|---|
| < 1k chunks | No — noise in retrieval already low |
| 1k-5k chunks | Measure with an eval set |
| 5k-100k chunks | Yes — this is the sweet spot |
| > 100k chunks | Yes, but combine with hierarchical retrieval |

Skip when docs are already self-contained (tweets, product descriptions, standalone FAQ entries).

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| No prompt caching on the document prefix | Enables 90% cost cut; never skip |
| Using Sonnet/Opus for context generation | Haiku is sufficient and 10x cheaper |
| Re-contextualizing on tiny edits | Content-hash per chunk; skip unchanged chunks |
| Indexing only the original text | Index `combined`; retrieval lift comes from the prepended context |
| Passing `combined` to the final LLM | Pass `original`; the context string is retrieval-only |
| Skipping reranking | Final 1% of failures live here; adds the last 35% improvement |
| Processing chunks across the 5-min cache window | Batch per-document within one window |
| No eval set | You cannot claim "67% better" without one |
| Regenerating on document append | Only new chunks need new contexts |

## Production Checklist

- [ ] Prompt caching enabled on the document prefix
- [ ] Claude Haiku selected as the context model
- [ ] Per-chunk content hash stored for idempotent re-ingestion
- [ ] Batch API for cold bulk ingest (> 10k chunks)
- [ ] Both BM25 and vector indexes use `combined` text
- [ ] Original chunk text preserved in metadata for LLM context
- [ ] RRF fusion over top-150 from each retriever
- [ ] Reranker on top-150 -> top-20
- [ ] Eval harness measures failure@5 / failure@20 before and after
- [ ] Cost dashboard per document ingested
- [ ] Cache-hit ratio monitored (expect > 95% after warmup)
- [ ] Rolling re-contextualization when the source document changes materially
