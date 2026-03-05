# pgvector

## Overview

pgvector is a PostgreSQL extension that adds vector similarity search directly to your existing Postgres database. It supports exact and approximate nearest neighbor search, multiple distance functions, and integrates natively with SQL. This eliminates the need for a separate vector database when you already use PostgreSQL.

## Installation

### PostgreSQL Extension

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### System Installation

```bash
# Ubuntu/Debian
sudo apt install postgresql-16-pgvector

# macOS (Homebrew)
brew install pgvector

# From source
cd /tmp && git clone --branch v0.8.0 https://github.com/pgvector/pgvector.git
cd pgvector && make && sudo make install
```

### Docker

```yaml
# docker-compose.yml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_PASSWORD: secret
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

## Data Types

```sql
-- vector: fixed-dimension float32, max 16,000 dimensions
CREATE TABLE documents (
    id BIGSERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}'
);

-- halfvec: float16, half the storage with minor precision loss
ALTER TABLE documents ADD COLUMN embedding_half halfvec(1536);

-- sparsevec: high-dimensional data with mostly zero values
ALTER TABLE documents ADD COLUMN sparse_embedding sparsevec(30000);
INSERT INTO documents (sparse_embedding) VALUES ('{1:0.5, 100:0.3, 999:0.8}/30000');
```

## Distance Functions

| Function        | Operator | Use Case                        |
| --------------- | -------- | ------------------------------- |
| L2 (Euclidean)  | `<->`    | Default, general purpose        |
| Cosine distance | `<=>`    | Normalized embeddings (common)  |
| Inner product   | `<#>`    | Pre-normalized, max similarity  |
| L1 (Manhattan)  | `<+>`    | Sparse data                     |

```sql
-- Cosine similarity search (most common for text embeddings)
SELECT id, content, 1 - (embedding <=> $1::vector) AS similarity
FROM documents
ORDER BY embedding <=> $1::vector
LIMIT 10;
```

## Index Types

### IVFFlat

Clusters vectors into lists, searches subset at query time. Faster to build than HNSW but lower recall.

```sql
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
SET ivfflat.probes = 10;  -- sqrt(lists) for good recall
```

### HNSW (Recommended)

Graph-based index with better recall. Slower to build but superior query performance.

```sql
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
SET hnsw.ef_search = 100;  -- Must be >= top_k
```

| Factor      | IVFFlat                     | HNSW                        |
| ----------- | --------------------------- | --------------------------- |
| Build speed | Fast                        | Slow (2-10x slower)         |
| Recall      | Good (with enough probes)   | Excellent                   |
| Memory      | Lower                       | Higher (graph overhead)     |
| Inserts     | Needs reindex after bulk    | Handles incremental inserts |

**Important:** IVFFlat requires data before index creation. HNSW can be created on an empty table.

## Query Patterns

### Filtered Similarity Search

```sql
SELECT id, content, 1 - (embedding <=> $1::vector) AS similarity
FROM documents
WHERE metadata->>'category' = 'engineering'
  AND created_at > NOW() - INTERVAL '30 days'
ORDER BY embedding <=> $1::vector
LIMIT 10;
```

### Hybrid Search (Vector + Full-Text)

```sql
ALTER TABLE documents ADD COLUMN content_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX ON documents USING gin(content_tsv);

WITH semantic AS (
    SELECT id, 1 - (embedding <=> $1::vector) AS vec_score
    FROM documents ORDER BY embedding <=> $1::vector LIMIT 50
),
fulltext AS (
    SELECT id, ts_rank(content_tsv, plainto_tsquery('english', $2)) AS text_score
    FROM documents WHERE content_tsv @@ plainto_tsquery('english', $2) LIMIT 50
)
SELECT COALESCE(s.id, f.id) AS id, d.content,
    COALESCE(s.vec_score, 0) * 0.7 + COALESCE(f.text_score, 0) * 0.3 AS combined_score
FROM semantic s FULL OUTER JOIN fulltext f ON s.id = f.id
JOIN documents d ON d.id = COALESCE(s.id, f.id)
ORDER BY combined_score DESC LIMIT 10;
```

## ORM Integration

### SQLAlchemy (Python)

```python
from sqlalchemy import create_engine, Column, Integer, Text
from sqlalchemy.orm import declarative_base, Session
from pgvector.sqlalchemy import Vector

Base = declarative_base()

class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(1536))

engine = create_engine("postgresql://user:pass@localhost/mydb")

with Session(engine) as session:
    results = (session.query(Document)
        .order_by(Document.embedding.cosine_distance(query_vec))
        .limit(10).all())
```

### Prisma (Node.js / TypeScript)

```prisma
model Document {
  id        Int     @id @default(autoincrement())
  content   String
  embedding Unsupported("vector(1536)")?
}
```

```typescript
// Raw SQL required for vector operations
const results = await prisma.$queryRaw`
  SELECT id, content, 1 - (embedding <=> ${queryVec}::vector) AS similarity
  FROM "Document" ORDER BY embedding <=> ${queryVec}::vector LIMIT 10`;
```

### Spring Data JPA (Java)

```java
@Query(value = """
    SELECT d.*, 1 - (d.embedding <=> cast(:queryVec as vector)) AS similarity
    FROM documents d ORDER BY d.embedding <=> cast(:queryVec as vector) LIMIT :limit
    """, nativeQuery = true)
List<Document> findSimilar(@Param("queryVec") String queryVec, @Param("limit") int limit);
```

## Query Optimization

```sql
-- Verify index is used
EXPLAIN ANALYZE SELECT id FROM documents
ORDER BY embedding <=> '[0.1, 0.2, ...]'::vector LIMIT 10;

-- Performance tuning
SET work_mem = '256MB';
SET maintenance_work_mem = '2GB';
SET max_parallel_maintenance_workers = 4;

-- Partial index (reduces index size)
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
WHERE is_active = true;
```

## Anti-Patterns

- **Creating IVFFlat index on empty table**: IVFFlat needs data to compute cluster centroids.
- **Using L2 with unnormalized embeddings for cosine tasks**: Use cosine distance (`<=>`) for unnormalized vectors.
- **Not tuning `ef_search` / `probes`**: Defaults prioritize speed over recall.
- **Storing embeddings as arrays or JSON**: Use the `vector` type for indexing support.
- **Ignoring `EXPLAIN ANALYZE`**: Always verify queries use the vector index.

## Production Checklist

- [ ] `CREATE EXTENSION vector` executed
- [ ] Appropriate type selected (`vector` vs `halfvec`)
- [ ] HNSW index created with tuned `m` and `ef_construction`
- [ ] Distance function matches embedding model output
- [ ] `ef_search` or `probes` tuned for recall/latency requirements
- [ ] `work_mem` and `maintenance_work_mem` increased for vector workloads
- [ ] `EXPLAIN ANALYZE` confirms index usage
- [ ] Hybrid search strategy implemented if needed
- [ ] Regular `VACUUM` and `REINDEX` scheduled
- [ ] Connection pooling in place (pgBouncer or application-level)
