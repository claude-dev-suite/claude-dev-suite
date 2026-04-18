---
name: rag-architecture
description: |
  RAG system architecture and design decisions. Covers naive vs advanced vs agentic
  RAG, decision trees for RAG vs fine-tuning vs long context, production topology,
  latency budgets, and component sequencing.

  USE WHEN: user mentions "RAG architecture", "RAG design", "naive RAG", "advanced RAG",
  "agentic RAG", "RAG vs fine-tuning", "RAG vs long context", "production RAG"

  DO NOT USE FOR: chunking details - use `chunking-strategies`;
  query rewriting - use `query-transformations`; retrieval algorithms - use `advanced-retrieval`;
  evaluation - use `rag-evaluation`; agent loops - use `agentic-rag`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# RAG Architecture

## Three Architectural Tiers

| Tier | Components | Best For | Complexity |
|---|---|---|---|
| Naive RAG | Chunk + embed + top-K + stuff | Prototype, < 10k docs, homogeneous content | Low |
| Advanced RAG | + query rewriting, hybrid search, reranking, metadata filters | Production, heterogeneous content, > 10k docs | Medium |
| Agentic RAG | + self-reflection, retrieval-as-tool, multi-hop, corrective fallback | Complex research, multi-source synthesis, high-stakes answers | High |

## Naive RAG Pipeline

```
[Docs] -> [Splitter] -> [Embedder] -> [Vector DB]
                                          |
[Query] -> [Embedder] -> [Top-K Search] --+-> [Prompt Stuffer] -> [LLM] -> [Answer]
```

Single failure mode: bad retrieval = bad answer. No recovery path. Works for well-scoped FAQ bots on small corpora.

## Advanced RAG Pipeline

```
                          pre-retrieval         retrieval              post-retrieval
[Query] -> [Router] -> [Rewrite/HyDE/Multi-Q] -> [Hybrid Search] -> [Rerank] -> [Compress] -> [LLM]
                                                      |
                           [BM25] + [Dense Vector] + [Metadata Filter]
```

Each stage is independently replaceable and measurable. See `query-transformations`, `hybrid-search`, `reranking`.

## Agentic RAG Pipeline

```
[Query] -> [Planner Agent]
             |
             v
       +-----+-----+-------------------+
       |           |                   |
   [Retrieve]  [Web Search]      [Code Tool]
       |           |                   |
       +-----+-----+-------------------+
             |
        [Critic / Self-reflection]
             |
       +-----+-----+
       |           |
    [Answer]  [Replan / More retrieval]
```

Dynamic step count, dynamic tool selection, self-correction. See `agentic-rag`.

## Decision Tree: RAG vs Fine-Tuning vs Long Context

```
Is the knowledge dynamic (changes > monthly)?
  Yes -> RAG
  No  -> Continue
    |
    Is it style/format/persona (not facts)?
      Yes -> Fine-tuning (SFT or DPO)
      No  -> Continue
        |
        Does total corpus fit in 200k-1M tokens?
          Yes -> Long context with prompt caching (cheaper than RAG at small scale)
          No  -> RAG
            |
            Need factual grounding with citations?
              Yes -> RAG (mandatory for auditability)
              No  -> Hybrid: long context for recent + RAG for archive
```

Rules of thumb:
- Under 500 KB of content: long context with prompt caching beats RAG on latency and quality.
- Over 10 MB or changes weekly: RAG wins on cost and freshness.
- Between: measure both.

## Latency Budget (Production Target: < 3s P95)

| Stage | Budget | Optimization |
|---|---|---|
| Query embedding | 50-150ms | Batch + local model for simple queries |
| Query rewriting (optional) | 300-800ms | Skip for short factual queries |
| Vector search (top-50) | 20-100ms | HNSW with `ef_search` tuned |
| BM25 search | 10-50ms | Parallel with vector search |
| Fusion (RRF) | < 5ms | In-memory |
| Reranking (top-50 -> top-5) | 100-400ms | Cohere/Voyage API or local BGE |
| LLM generation | 1000-2000ms | Streaming, prompt caching |
| Total | 1500-3500ms | |

Parallelize embedding + BM25. Skip rewriting for short queries. Cache query embeddings for hot terms.

## Production Component Diagram

```
                    +------------------+
                    |   Ingestion API  |
                    +--------+---------+
                             |
                 +-----------v------------+
                 | Chunker + Embedder     |
                 | (batch worker, queue)  |
                 +-----------+------------+
                             |
         +-------------------+---------------------+
         |                                         |
  +------v------+                          +-------v-------+
  |  Vector DB  |                          | Document Store|
  |  (HNSW)     |                          | (Postgres/S3) |
  +------+------+                          +-------+-------+
         |                                         |
         |    +------------------+                 |
         +----> Retrieval Service <----------------+
              | (hybrid + rerank)|
              +--------+---------+
                       |
              +--------v---------+
              |  LLM Gateway     |
              | (Claude/GPT)     |
              +--------+---------+
                       |
              +--------v---------+
              |   API / UI       |
              +------------------+
```

Separate the ingestion path from the query path. Never block queries on indexing.

## Minimal Python Scaffold (Advanced RAG)

```python
from dataclasses import dataclass
from langchain_anthropic import ChatAnthropic
from langchain_openai import OpenAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from langchain_community.retrievers import BM25Retriever
from langchain.retrievers import EnsembleRetriever, ContextualCompressionRetriever
from langchain_cohere import CohereRerank

@dataclass
class RAGConfig:
    top_k_retrieve: int = 50
    top_n_rerank: int = 5
    alpha: float = 0.5  # dense weight in hybrid
    rerank_model: str = "rerank-english-v3.0"
    llm_model: str = "claude-sonnet-4-5-20250929"

def build_pipeline(docs, cfg: RAGConfig):
    emb = OpenAIEmbeddings(model="text-embedding-3-small")
    vstore = QdrantVectorStore.from_documents(docs, emb, collection_name="kb")
    dense = vstore.as_retriever(search_kwargs={"k": cfg.top_k_retrieve})
    sparse = BM25Retriever.from_documents(docs); sparse.k = cfg.top_k_retrieve
    hybrid = EnsembleRetriever(retrievers=[sparse, dense], weights=[1 - cfg.alpha, cfg.alpha])
    reranker = CohereRerank(model=cfg.rerank_model, top_n=cfg.top_n_rerank)
    retriever = ContextualCompressionRetriever(base_compressor=reranker, base_retriever=hybrid)
    llm = ChatAnthropic(model=cfg.llm_model, max_tokens=1024)
    return retriever, llm
```

## Scaling Patterns

| Regime | Index | Strategy |
|---|---|---|
| < 100k chunks | HNSW in-memory (FAISS, Chroma) | Single node |
| 100k-10M chunks | Managed HNSW (Qdrant, Pinecone, Weaviate) | Replicate reads |
| 10M-1B chunks | Sharded HNSW + IVF coarse filter | Partition by tenant/namespace |
| > 1B chunks | Disk-ANN / SPTAG / hierarchical | Custom; hire infra |

Namespace per tenant avoids noisy-neighbor retrieval in multi-tenant SaaS.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Starting with agentic RAG | Start naive, measure, add complexity only when recall < 70% |
| Treating RAG as a solved box | Every stage needs its own eval; see `rag-evaluation` |
| Single index for heterogeneous content | Separate indexes per content type with a router |
| Synchronous indexing in query path | Queue ingestion; queries never block on embedding |
| No reranking above 10k docs | Reranking recovers 10-30% recall@5 vs raw vector search |
| Hardcoded `top_k` everywhere | Parametrize; tune with eval set |
| Storing chunks only in vector DB | Keep source of truth in document DB; vector DB holds refs |

## Production Checklist

- [ ] Ingestion and query paths are separate services
- [ ] Document store is source of truth; vector DB holds IDs + embeddings only
- [ ] Latency budget allocated per stage and measured in traces
- [ ] Query router distinguishes factual, analytical, and conversational intents
- [ ] Hybrid search baseline before any advanced technique
- [ ] Reranker in place for corpora > 10k chunks
- [ ] Fallback path when retrieval returns nothing (admit ignorance, offer web search)
- [ ] Namespace isolation for multi-tenant deployments
- [ ] Graceful degradation: naive path if advanced stage fails
- [ ] Tracing across ingestion -> retrieval -> generation (LangSmith / OpenTelemetry)
