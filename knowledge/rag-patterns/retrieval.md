# RAG Retrieval Strategies

## Overview

Retrieval is the core of RAG: given a user query, find the most relevant chunks from your knowledge base to pass as context to the LLM. The quality of retrieved chunks directly determines answer quality. This document covers retrieval strategies from simple similarity search through advanced re-ranking, with implementations in LangChain and LlamaIndex.

---

## Strategy 1: Similarity Search (k-Nearest Neighbors)

The simplest retrieval strategy. Embed the query, find the k chunks with the highest cosine similarity (or lowest L2 distance).

### Python (LangChain)

```python
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
vectorstore = Chroma.from_documents(documents, embeddings, persist_directory="./chroma_db")

# Basic similarity search
results = vectorstore.similarity_search(query="How do I authenticate?", k=5)

# With relevance scores
results_with_scores = vectorstore.similarity_search_with_relevance_scores(
    query="How do I authenticate?",
    k=5,
    score_threshold=0.7,  # Filter out low-relevance results
)
```

### TypeScript (LangChain.js)

```typescript
import { OpenAIEmbeddings } from '@langchain/openai';
import { Chroma } from '@langchain/community/vectorstores/chroma';

const embeddings = new OpenAIEmbeddings({ modelName: 'text-embedding-3-small' });
const vectorstore = await Chroma.fromDocuments(documents, embeddings, {
  collectionName: 'my-docs',
});

const results = await vectorstore.similaritySearch('How do I authenticate?', 5);
```

**Limitation:** Returns the k most similar results, which may be near-duplicates of each other, missing diverse relevant content.

---

## Strategy 2: Maximum Marginal Relevance (MMR)

Balances relevance to the query with diversity among results. Each successive result is chosen to be both relevant and different from already-selected results.

### Python

```python
# LangChain MMR
results = vectorstore.max_marginal_relevance_search(
    query="authentication methods",
    k=5,
    fetch_k=20,            # Fetch 20 candidates, select 5 diverse ones
    lambda_mult=0.5,       # 0 = max diversity, 1 = max relevance
)
```

### How MMR Works

```python
import numpy as np

def mmr(query_embedding, candidate_embeddings, candidate_docs, k=5, lambda_mult=0.5):
    """
    Maximal Marginal Relevance selection.
    lambda_mult: trade-off between relevance (1.0) and diversity (0.0)
    """
    selected = []
    candidate_indices = list(range(len(candidate_embeddings)))

    # Similarity of each candidate to the query
    query_similarities = np.array([
        cosine_similarity(query_embedding, emb) for emb in candidate_embeddings
    ])

    for _ in range(k):
        if not candidate_indices:
            break

        mmr_scores = []
        for idx in candidate_indices:
            relevance = query_similarities[idx]

            # Max similarity to already-selected docs
            if selected:
                redundancy = max(
                    cosine_similarity(candidate_embeddings[idx], candidate_embeddings[s])
                    for s in selected
                )
            else:
                redundancy = 0

            mmr_score = lambda_mult * relevance - (1 - lambda_mult) * redundancy
            mmr_scores.append((idx, mmr_score))

        best_idx = max(mmr_scores, key=lambda x: x[1])[0]
        selected.append(best_idx)
        candidate_indices.remove(best_idx)

    return [candidate_docs[i] for i in selected]
```

**When to use:** When your knowledge base has many similar documents (e.g., multiple API versions, overlapping guides) and you need coverage of different aspects.

---

## Strategy 3: Self-Query Retrieval

The LLM parses the user's natural-language query into a structured filter + semantic query. Useful when metadata filtering is needed.

### Python

```python
from langchain.retrievers.self_query.base import SelfQueryRetriever
from langchain.chains.query_constructor.base import AttributeInfo
from langchain_openai import ChatOpenAI

metadata_field_info = [
    AttributeInfo(name="doc_type", description="Type of document: api-reference, guide, tutorial", type="string"),
    AttributeInfo(name="language", description="Programming language: python, typescript, java", type="string"),
    AttributeInfo(name="version", description="API version number", type="float"),
]

retriever = SelfQueryRetriever.from_llm(
    llm=ChatOpenAI(model="gpt-4o-mini", temperature=0),
    vectorstore=vectorstore,
    document_contents="Technical documentation for a SaaS API",
    metadata_field_info=metadata_field_info,
)

# The LLM automatically converts:
#   "Show me Python examples for authentication in v3"
# Into:
#   query: "authentication examples"
#   filter: {"language": "python", "version": {"$gte": 3.0}}
results = retriever.invoke("Show me Python examples for authentication in v3")
```

---

## Strategy 4: Multi-Query Retrieval

Generates multiple reformulations of the user's query, retrieves for each, and merges results. Addresses the problem of query phrasing sensitivity.

### Python

```python
from langchain.retrievers.multi_query import MultiQueryRetriever
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.3)

retriever = MultiQueryRetriever.from_llm(
    retriever=vectorstore.as_retriever(search_kwargs={"k": 5}),
    llm=llm,
)

# Internally generates variations like:
#   Original: "How do I handle rate limiting?"
#   Variation 1: "What is the rate limit policy for the API?"
#   Variation 2: "How to implement retry logic for 429 errors?"
#   Variation 3: "Rate limiting best practices"
results = retriever.invoke("How do I handle rate limiting?")
```

### Custom Multi-Query (TypeScript)

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { VectorStore } from '@langchain/core/vectorstores';

async function multiQueryRetrieve(
  query: string,
  vectorstore: VectorStore,
  llm: ChatOpenAI,
  k: number = 5
): Promise<Document[]> {
  // Generate query variations
  const response = await llm.invoke([
    {
      role: 'system',
      content: 'Generate 3 alternative search queries for the given question. Return one per line.',
    },
    { role: 'user', content: query },
  ]);

  const queries = [query, ...response.content.toString().split('\n').filter(Boolean)];

  // Retrieve for each query
  const allResults = await Promise.all(
    queries.map(q => vectorstore.similaritySearch(q, k))
  );

  // Deduplicate by content hash
  const seen = new Set<string>();
  const unique: Document[] = [];
  for (const doc of allResults.flat()) {
    const hash = createHash('md5').update(doc.pageContent).digest('hex');
    if (!seen.has(hash)) {
      seen.add(hash);
      unique.push(doc);
    }
  }

  return unique.slice(0, k);
}
```

---

## Strategy 5: Contextual Compression

After initial retrieval, compress each chunk to extract only the portion relevant to the query. Reduces noise in the context window.

### Python

```python
from langchain.retrievers import ContextualCompressionRetriever
from langchain.retrievers.document_compressors import LLMChainExtractor
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
compressor = LLMChainExtractor.from_llm(llm)

compression_retriever = ContextualCompressionRetriever(
    base_compressor=compressor,
    base_retriever=vectorstore.as_retriever(search_kwargs={"k": 10}),
)

# Retrieves 10 chunks, then extracts only relevant portions
results = compression_retriever.invoke("What are the rate limits for the API?")
# Each result's page_content now contains only the relevant extract
```

---

## Embedding Models Comparison

| Model | Dimensions | Max Tokens | Strengths | Cost |
|-------|-----------|------------|-----------|------|
| OpenAI text-embedding-3-small | 1536 | 8191 | Best cost/quality ratio | $0.02/1M tokens |
| OpenAI text-embedding-3-large | 3072 | 8191 | Highest quality (OpenAI) | $0.13/1M tokens |
| Cohere embed-v3 | 1024 | 512 | Strong multilingual | $0.10/1M tokens |
| Voyage voyage-3 | 1024 | 32000 | Long-context embedding | $0.06/1M tokens |
| BGE-M3 (local) | 1024 | 8192 | Free, multilingual | Compute only |
| Nomic embed-text-v1.5 (local) | 768 | 8192 | Free, Matryoshka dims | Compute only |

### Choosing an Embedding Model

```python
# Matryoshka embeddings: use fewer dimensions for speed, more for quality
from langchain_openai import OpenAIEmbeddings

# Full quality
embeddings_full = OpenAIEmbeddings(model="text-embedding-3-large", dimensions=3072)

# Reduced dimensions for faster search with minimal quality loss
embeddings_fast = OpenAIEmbeddings(model="text-embedding-3-large", dimensions=256)
```

---

## Re-Ranking with Cross-Encoders

Cross-encoders process the query and document together (not separately like bi-encoders), producing more accurate relevance scores at the cost of speed. Use them to re-rank a candidate set.

### Python (Cohere Reranker)

```python
from langchain.retrievers import ContextualCompressionRetriever
from langchain_cohere import CohereRerank

reranker = CohereRerank(model="rerank-v3.5", top_n=5)

reranking_retriever = ContextualCompressionRetriever(
    base_compressor=reranker,
    base_retriever=vectorstore.as_retriever(search_kwargs={"k": 20}),
)

# Fetch 20 candidates, re-rank, return top 5
results = reranking_retriever.invoke("How do I set up webhooks?")
```

### Local Cross-Encoder (sentence-transformers)

```python
from sentence_transformers import CrossEncoder

cross_encoder = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

def rerank(query: str, documents: list[str], top_k: int = 5) -> list[tuple[str, float]]:
    pairs = [(query, doc) for doc in documents]
    scores = cross_encoder.predict(pairs)

    ranked = sorted(zip(documents, scores), key=lambda x: x[1], reverse=True)
    return ranked[:top_k]

# Usage
candidates = [chunk.page_content for chunk in initial_results]
reranked = rerank("webhook configuration", candidates, top_k=5)
```

### Two-Stage Retrieval Pipeline

```python
from langchain_core.runnables import RunnablePassthrough

# Stage 1: Fast bi-encoder retrieval (broad recall)
# Stage 2: Slow cross-encoder re-ranking (precision)

def build_two_stage_retriever(vectorstore, reranker, initial_k=20, final_k=5):
    base_retriever = vectorstore.as_retriever(search_kwargs={"k": initial_k})

    return ContextualCompressionRetriever(
        base_compressor=reranker,
        base_retriever=base_retriever,
    )
```

---

## LlamaIndex Retriever Implementations

```python
from llama_index.core import VectorStoreIndex, Settings
from llama_index.core.retrievers import VectorIndexRetriever
from llama_index.core.postprocessor import SimilarityPostprocessor, SentenceTransformerRerank

# Build index
index = VectorStoreIndex.from_documents(documents)

# Basic retriever
retriever = VectorIndexRetriever(
    index=index,
    similarity_top_k=10,
)

# With post-processing pipeline
from llama_index.core.query_engine import RetrieverQueryEngine

reranker = SentenceTransformerRerank(
    model="cross-encoder/ms-marco-MiniLM-L-6-v2",
    top_n=5,
)

similarity_filter = SimilarityPostprocessor(similarity_cutoff=0.7)

query_engine = RetrieverQueryEngine(
    retriever=retriever,
    node_postprocessors=[similarity_filter, reranker],
)

response = query_engine.query("How do I configure webhooks?")
```

---

## Retrieval with Metadata Filtering

```python
# Pinecone with metadata filters
from langchain_pinecone import PineconeVectorStore

vectorstore = PineconeVectorStore(index=pinecone_index, embedding=embeddings)

results = vectorstore.similarity_search(
    query="authentication",
    k=5,
    filter={
        "doc_type": {"$eq": "api-reference"},
        "version": {"$gte": 2.0},
    }
)

# pgvector with metadata filters
from langchain_postgres import PGVector

results = pgvector_store.similarity_search(
    query="authentication",
    k=5,
    filter={"doc_type": "api-reference"},
)
```

---

## Anti-Patterns

1. **Using only similarity search without re-ranking.** The initial retrieval is a rough filter; re-ranking with a cross-encoder significantly improves precision for the top results.
2. **Retrieving too few candidates (k=3).** Start with k=10-20 for the initial retrieval, then re-rank down to 3-5 for the LLM context.
3. **Ignoring metadata filters.** When you know the document type, language, or version, filtering before vector search reduces noise and improves speed.
4. **Same embedding model for queries and documents.** Some models (e.g., BGE, E5) use different prefixes for queries vs. passages. Using the wrong prefix degrades quality.
5. **Not evaluating retrieval independently from generation.** Measure context precision and recall separately from answer quality to isolate retrieval problems.
6. **Embedding long queries verbatim.** Long, conversational queries embed poorly. Extract the core intent or use multi-query to generate focused search terms.

---

## Production Checklist

- [ ] Embedding model is chosen based on benchmarks for your domain (MTEB leaderboard)
- [ ] Retrieval uses a two-stage pipeline: fast vector search + cross-encoder re-ranking
- [ ] Metadata filters are applied when query intent implies a document subset
- [ ] MMR or diversity-aware selection is used when the corpus has near-duplicate content
- [ ] Retrieval quality is measured with context precision/recall on an eval dataset
- [ ] Embedding dimensions are tuned (Matryoshka) for the cost/quality trade-off
- [ ] Query preprocessing handles conversational context (chat history summarization)
- [ ] Score thresholds filter out irrelevant results rather than always returning k
- [ ] Retrieval latency is monitored (p50, p95, p99) with alerts
- [ ] Fallback strategy exists when retrieval returns no results above threshold
