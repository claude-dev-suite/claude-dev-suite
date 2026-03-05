# Hybrid Search for RAG

## Overview

Hybrid search combines dense vector search (semantic similarity via embeddings) with sparse keyword search (lexical matching via BM25 or full-text search). Neither approach alone is optimal: vector search excels at understanding meaning but misses exact terms; keyword search excels at exact matches but misses synonyms and paraphrases. Combining them yields retrieval quality that consistently outperforms either approach alone, especially for technical content with domain-specific terminology.

---

## Why Hybrid Outperforms Pure Vector Search

Vector search struggles with:
- **Exact identifiers:** model names (`gpt-4o-mini`), error codes (`ERR_CONN_REFUSED`), version numbers
- **Rare domain terms:** words not well-represented in the embedding model's training data
- **Negation and specificity:** "authentication without OAuth" vs. "authentication with OAuth" embed similarly
- **Acronyms and abbreviations:** `RLS`, `MMR`, `RBAC` may not embed meaningfully

Keyword search (BM25) struggles with:
- **Synonyms:** "authentication" vs. "login" vs. "sign-in"
- **Conceptual queries:** "how to make my API secure" should match authorization docs
- **Paraphrasing:** different phrasings of the same question

Hybrid search addresses both by merging result lists with a score fusion strategy.

---

## Score Fusion: Reciprocal Rank Fusion (RRF)

RRF is the most common fusion strategy. It does not require score normalization across different search backends because it operates on ranks, not scores.

### Formula

```
RRF_score(d) = SUM(1 / (k + rank_i(d))) for each retrieval system i
```

Where `k` is a constant (typically 60) that dampens the influence of high ranks.

### Python Implementation

```python
def reciprocal_rank_fusion(
    result_lists: list[list[str]],  # Each list is document IDs in ranked order
    k: int = 60
) -> list[tuple[str, float]]:
    """Fuse multiple ranked result lists using Reciprocal Rank Fusion."""
    scores: dict[str, float] = {}

    for result_list in result_lists:
        for rank, doc_id in enumerate(result_list):
            scores[doc_id] = scores.get(doc_id, 0) + 1.0 / (k + rank + 1)

    # Sort by fused score descending
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)


# Example
vector_results = ["doc_3", "doc_1", "doc_7", "doc_5"]   # Ranked by embedding similarity
keyword_results = ["doc_1", "doc_3", "doc_9", "doc_5"]   # Ranked by BM25

fused = reciprocal_rank_fusion([vector_results, keyword_results])
# doc_1 and doc_3 appear in both lists -> higher fused scores
```

### Weighted Scoring

When you trust one source more than the other:

```python
def weighted_rrf(
    result_lists: list[list[str]],
    weights: list[float],
    k: int = 60
) -> list[tuple[str, float]]:
    """Weighted Reciprocal Rank Fusion."""
    scores: dict[str, float] = {}

    for result_list, weight in zip(result_lists, weights):
        for rank, doc_id in enumerate(result_list):
            scores[doc_id] = scores.get(doc_id, 0) + weight / (k + rank + 1)

    return sorted(scores.items(), key=lambda x: x[1], reverse=True)


# Weight vector search more heavily for conceptual queries
fused = weighted_rrf(
    [vector_results, keyword_results],
    weights=[0.7, 0.3],
)

# Weight keyword search more heavily for exact-match queries
fused = weighted_rrf(
    [vector_results, keyword_results],
    weights=[0.3, 0.7],
)
```

---

## Implementation: Pinecone Hybrid Search

Pinecone supports hybrid search natively by storing both dense and sparse vectors.

### Python

```python
from pinecone import Pinecone
from pinecone_text.sparse import BM25Encoder

# Initialize
pc = Pinecone(api_key="your-key")
index = pc.Index("my-index")

# Fit BM25 on your corpus
bm25 = BM25Encoder()
bm25.fit([doc.page_content for doc in documents])

# Upsert with both dense and sparse vectors
from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

for i, doc in enumerate(documents):
    dense_vector = embeddings.embed_query(doc.page_content)
    sparse_vector = bm25.encode_documents(doc.page_content)

    index.upsert(vectors=[{
        "id": f"doc_{i}",
        "values": dense_vector,
        "sparse_values": sparse_vector,
        "metadata": doc.metadata,
    }])

# Hybrid query
query = "How to configure RLS in PostgreSQL"
dense_query = embeddings.embed_query(query)
sparse_query = bm25.encode_queries(query)

results = index.query(
    vector=dense_query,
    sparse_vector=sparse_query,
    top_k=10,
    alpha=0.5,  # 0 = pure sparse, 1 = pure dense
    include_metadata=True,
)
```

### LangChain Integration

```python
from langchain_pinecone import PineconeVectorStore

vectorstore = PineconeVectorStore(
    index=index,
    embedding=embeddings,
    text_key="text",
)

# Use as a retriever with hybrid mode
retriever = vectorstore.as_retriever(
    search_type="hybrid",
    search_kwargs={
        "k": 10,
        "alpha": 0.5,
    }
)
```

---

## Implementation: Weaviate Hybrid Search

Weaviate has built-in hybrid search combining BM25 and vector search.

### Python

```python
import weaviate
from weaviate.classes.query import HybridFusion

client = weaviate.connect_to_local()

collection = client.collections.get("Documents")

# Hybrid search with automatic fusion
results = collection.query.hybrid(
    query="PostgreSQL row level security setup",
    alpha=0.5,          # 0 = pure BM25, 1 = pure vector
    limit=10,
    fusion_type=HybridFusion.RELATIVE_SCORE,  # or RANKED (RRF)
    return_metadata=["score", "explain_score"],
)

for obj in results.objects:
    print(f"Score: {obj.metadata.score:.4f} - {obj.properties['title']}")
```

### TypeScript

```typescript
import weaviate from 'weaviate-client';

const client = await weaviate.connectToLocal();
const collection = client.collections.get('Documents');

const results = await collection.query.hybrid('PostgreSQL RLS', {
  alpha: 0.5,
  limit: 10,
  returnMetadata: ['score'],
});

for (const obj of results.objects) {
  console.log(`${obj.metadata?.score?.toFixed(4)} - ${obj.properties.title}`);
}
```

---

## Implementation: pgvector + tsvector (PostgreSQL)

Combine pgvector for dense search with PostgreSQL's built-in full-text search (tsvector/tsquery) for keyword matching, all in one database.

### Schema Setup

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- Table with both vector and full-text search columns
CREATE TABLE documents (
    id          BIGSERIAL PRIMARY KEY,
    content     TEXT NOT NULL,
    embedding   vector(1536),                               -- Dense vector
    tsv         tsvector GENERATED ALWAYS AS               -- Sparse (full-text)
                    (to_tsvector('english', content)) STORED,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Indexes for both search types
CREATE INDEX idx_documents_embedding ON documents
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_documents_tsv ON documents USING gin(tsv);
```

### Hybrid Query Function

```sql
-- Hybrid search combining vector similarity and full-text ranking
CREATE OR REPLACE FUNCTION hybrid_search(
    query_embedding vector(1536),
    query_text TEXT,
    match_count INT DEFAULT 10,
    vector_weight FLOAT DEFAULT 0.5,
    keyword_weight FLOAT DEFAULT 0.5,
    rrf_k INT DEFAULT 60
)
RETURNS TABLE (
    id BIGINT,
    content TEXT,
    metadata JSONB,
    hybrid_score FLOAT
) AS $$
WITH vector_results AS (
    SELECT
        d.id,
        d.content,
        d.metadata,
        ROW_NUMBER() OVER (ORDER BY d.embedding <=> query_embedding) AS vector_rank
    FROM documents d
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count * 2
),
keyword_results AS (
    SELECT
        d.id,
        d.content,
        d.metadata,
        ROW_NUMBER() OVER (ORDER BY ts_rank_cd(d.tsv, websearch_to_tsquery('english', query_text)) DESC) AS keyword_rank
    FROM documents d
    WHERE d.tsv @@ websearch_to_tsquery('english', query_text)
    ORDER BY ts_rank_cd(d.tsv, websearch_to_tsquery('english', query_text)) DESC
    LIMIT match_count * 2
),
combined AS (
    SELECT
        COALESCE(v.id, k.id) AS id,
        COALESCE(v.content, k.content) AS content,
        COALESCE(v.metadata, k.metadata) AS metadata,
        COALESCE(vector_weight / (rrf_k + v.vector_rank), 0) +
        COALESCE(keyword_weight / (rrf_k + k.keyword_rank), 0) AS hybrid_score
    FROM vector_results v
    FULL OUTER JOIN keyword_results k ON v.id = k.id
)
SELECT id, content, metadata, hybrid_score
FROM combined
ORDER BY hybrid_score DESC
LIMIT match_count;
$$ LANGUAGE sql;
```

### Node.js Usage

```typescript
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function hybridSearch(
  queryEmbedding: number[],
  queryText: string,
  options: { k?: number; vectorWeight?: number; keywordWeight?: number } = {}
): Promise<SearchResult[]> {
  const { k = 10, vectorWeight = 0.5, keywordWeight = 0.5 } = options;

  const { rows } = await pool.query(
    `SELECT * FROM hybrid_search($1::vector, $2, $3, $4, $5)`,
    [
      JSON.stringify(queryEmbedding),
      queryText,
      k,
      vectorWeight,
      keywordWeight,
    ]
  );

  return rows.map(row => ({
    id: row.id,
    content: row.content,
    metadata: row.metadata,
    score: row.hybrid_score,
  }));
}

// Usage
const embedding = await embed("How to configure RLS in PostgreSQL");
const results = await hybridSearch(
  embedding,
  "configure RLS PostgreSQL row level security",
  { k: 10, vectorWeight: 0.6, keywordWeight: 0.4 }
);
```

### Python Usage

```python
import psycopg2
import numpy as np

def hybrid_search(conn, query_embedding: list[float], query_text: str, k: int = 10):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT * FROM hybrid_search(%s::vector, %s, %s)",
            [query_embedding, query_text, k]
        )
        return cur.fetchall()
```

---

## LangChain Ensemble Retriever

LangChain provides an EnsembleRetriever that combines any two retrievers with weighted fusion.

```python
from langchain.retrievers import EnsembleRetriever
from langchain_community.retrievers import BM25Retriever
from langchain_community.vectorstores import Chroma

# Vector retriever
vectorstore = Chroma.from_documents(documents, embeddings)
vector_retriever = vectorstore.as_retriever(search_kwargs={"k": 10})

# BM25 retriever (in-memory)
bm25_retriever = BM25Retriever.from_documents(documents, k=10)

# Ensemble with weights
ensemble_retriever = EnsembleRetriever(
    retrievers=[vector_retriever, bm25_retriever],
    weights=[0.5, 0.5],  # Equal weight
)

results = ensemble_retriever.invoke("How to configure row-level security?")
```

---

## Tuning the Alpha/Weight Parameter

The balance between vector and keyword search depends on your query type and corpus.

| Query Type | Recommended Vector Weight | Rationale |
|-----------|--------------------------|-----------|
| Conceptual ("how to secure my API") | 0.7 | Needs semantic understanding |
| Exact match ("ERR_CONN_REFUSED fix") | 0.2 | Specific terms must match |
| Mixed ("configure OAuth2 in Spring Boot") | 0.5 | Both meaning and terms matter |
| Code search ("useEffect cleanup function") | 0.4 | API names are literal, intent is semantic |

### Adaptive Weighting

```python
import re

def classify_query(query: str) -> float:
    """Return vector weight based on query characteristics."""
    # High keyword weight for queries with specific identifiers
    if re.search(r'[A-Z_]{3,}|v\d+\.\d+|error\s*code|status\s*\d{3}', query):
        return 0.3  # vector weight

    # High vector weight for conceptual queries
    if re.search(r'how (to|do|can|should)|what is|explain|best practice', query, re.I):
        return 0.7

    return 0.5  # balanced default


# Usage
alpha = classify_query(query)
results = hybrid_search(embedding, query, vector_weight=alpha, keyword_weight=1 - alpha)
```

---

## Anti-Patterns

1. **Using only vector search for technical documentation.** Technical docs contain exact identifiers (class names, error codes, config keys) that keyword search handles better.
2. **Normalizing scores across systems before fusion.** Score scales differ between vector similarity and BM25. Use rank-based fusion (RRF) instead of score-based fusion.
3. **Static alpha without query analysis.** Different queries benefit from different weights. At minimum, classify queries as conceptual vs. exact and adjust accordingly.
4. **Skipping full-text indexing on the vector database.** If your vector DB supports hybrid natively (Pinecone, Weaviate, Qdrant), use it rather than maintaining a separate BM25 index.
5. **Not tokenizing domain terms for BM25.** BM25 relies on token matching. If your corpus uses `row_level_security` but users query "row level security," tokenization must handle this.
6. **Ignoring the cost of maintaining two indexes.** Each index has storage and update costs. For small corpora (under 10K chunks), the overhead may not be justified.

---

## Production Checklist

- [ ] Hybrid search is implemented with RRF or weighted score fusion
- [ ] Vector weight (alpha) is tuned per query type or adaptively classified
- [ ] Full-text index uses an appropriate language analyzer (English stemming, stop words)
- [ ] Domain-specific terms are added to the full-text search dictionary or handled with synonyms
- [ ] Retrieval quality is benchmarked comparing pure vector, pure keyword, and hybrid
- [ ] pgvector IVFFlat or HNSW index is tuned (`lists`, `ef_construction`, `m` parameters)
- [ ] Full-text index is GIN (not GiST) for optimal performance on tsvector
- [ ] Query latency is monitored for both search paths
- [ ] Fallback to pure vector search when keyword search returns zero results
- [ ] Index maintenance (VACUUM, REINDEX) runs on a schedule for PostgreSQL
