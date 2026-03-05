---
name: vector-databases
description: |
  Vector database integration for embeddings and similarity search. Pinecone,
  Weaviate, Qdrant, ChromaDB, pgvector. Index management, metadata filtering,
  hybrid search, and production optimization.

  USE WHEN: user mentions "vector database", "embeddings", "similarity search",
  "Pinecone", "Weaviate", "Qdrant", "ChromaDB", "pgvector", "HNSW", "ANN"

  DO NOT USE FOR: LangChain integration - use `langchain`;
  RAG architecture - use `rag-patterns`; traditional databases - use database skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Vector Databases

## Pinecone

```typescript
import { Pinecone } from '@pinecone-database/pinecone';

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pc.index('my-index');

// Upsert
await index.namespace('docs').upsert([
  { id: 'doc-1', values: embedding, metadata: { source: 'manual', topic: 'auth' } },
]);

// Query with metadata filter
const results = await index.namespace('docs').query({
  vector: queryEmbedding,
  topK: 5,
  filter: { topic: { $eq: 'auth' } },
  includeMetadata: true,
});
```

## ChromaDB (local/self-hosted)

```python
import chromadb

client = chromadb.PersistentClient(path="./chroma_db")
collection = client.get_or_create_collection(
    name="documents",
    metadata={"hnsw:space": "cosine"},
)

# Add documents (auto-embeds with default model)
collection.add(
    ids=["doc1", "doc2"],
    documents=["Auth guide content", "API reference content"],
    metadatas=[{"source": "manual"}, {"source": "api"}],
)

# Query
results = collection.query(query_texts=["how does login work?"], n_results=5)
```

## pgvector (PostgreSQL extension)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops);

-- Similarity search
SELECT id, content, 1 - (embedding <=> $1::vector) AS similarity
FROM documents
WHERE metadata->>'source' = 'manual'
ORDER BY embedding <=> $1::vector
LIMIT 5;
```

### Node.js with pgvector

```typescript
import pgvector from 'pgvector';

await pgvector.registerTypes(pool);

await pool.query(
  'INSERT INTO documents (content, embedding) VALUES ($1, $2)',
  [text, pgvector.toSql(embedding)]
);

const { rows } = await pool.query(
  'SELECT *, 1 - (embedding <=> $1) AS similarity FROM documents ORDER BY embedding <=> $1 LIMIT $2',
  [pgvector.toSql(queryEmbedding), 5]
);
```

## Qdrant

```typescript
import { QdrantClient } from '@qdrant/js-client-rest';

const client = new QdrantClient({ url: 'http://localhost:6333' });

// Create collection
await client.createCollection('documents', {
  vectors: { size: 1536, distance: 'Cosine' },
});

// Upsert
await client.upsert('documents', {
  points: [{ id: 1, vector: embedding, payload: { source: 'manual' } }],
});

// Search with filter
const results = await client.search('documents', {
  vector: queryEmbedding,
  limit: 5,
  filter: { must: [{ key: 'source', match: { value: 'manual' } }] },
});
```

## Embedding Generation

```typescript
import OpenAI from 'openai';

const openai = new OpenAI();

async function embed(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small', // 1536 dims, cheapest
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| No metadata filtering | Always store filterable metadata with vectors |
| Wrong distance metric | Match metric to embedding model (cosine for OpenAI) |
| Embedding model mismatch | Same model for indexing and querying |
| No batching on upsert | Batch upserts (100-1000 vectors per call) |
| Storing raw text in vector DB | Store text in primary DB, only IDs + vectors in vector DB |

## Production Checklist

- [ ] Embedding model locked (changing requires full re-index)
- [ ] Batch upserts with error handling
- [ ] Metadata schema documented
- [ ] Index type configured (HNSW for most cases)
- [ ] Backup strategy for vector data
- [ ] Monitoring: query latency, index size, recall metrics
