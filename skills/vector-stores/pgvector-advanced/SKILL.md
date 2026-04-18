---
name: pgvector-advanced
description: |
  Advanced pgvector 0.7+ on PostgreSQL. HNSW vs IVFFlat tuning, halfvec /
  bit / sparsevec types, binary quantization, hybrid search with pg_trgm +
  tsvector, parallel index builds, partitioning for multi-tenancy, replication
  caveats, and Supabase-specific patterns.

  USE WHEN: user mentions "pgvector", "postgres vector", "HNSW in postgres",
  "IVFFlat", "halfvec", "supabase vector", "pgvector hybrid search",
  "pgvector tuning"

  DO NOT USE FOR: non-Postgres vector DBs - use other `vector-stores/*` skills;
  embedding model choice - use `embedding-models`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# pgvector Advanced

## Extension Setup

Requires pgvector 0.7+ for halfvec, binary quantization, and sparsevec.

```sql
CREATE EXTENSION IF NOT EXISTS vector;
SELECT extversion FROM pg_extension WHERE extname = 'vector';  -- expect >= 0.7.0

CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- tsvector / tsquery are built-in
```

## Data Types (pgvector 0.7+)

| Type | Bytes/dim | Use |
|---|---|---|
| `vector(d)` | 4 | Standard float32 |
| `halfvec(d)` | 2 | Half precision, 2x storage win, minor recall loss |
| `bit(d)` | 1/8 | Binary quantized, Hamming search |
| `sparsevec(d)` | variable | Sparse (SPLADE, BM25-style) |

```sql
CREATE TABLE chunks (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  content text NOT NULL,
  -- Full precision for reranking
  embedding vector(1536),
  -- Half precision for fast ANN
  embedding_half halfvec(1536),
  -- Binary for ultra-fast filter
  embedding_bit bit(1536),
  content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
```

## HNSW vs IVFFlat

| Aspect | HNSW | IVFFlat |
|---|---|---|
| Build time | Slow | Fast |
| Query speed | Fast | Fast when tuned |
| Recall | Higher | Good |
| Memory | High (graph in RAM) | Lower |
| Inserts after build | Fine | Ok but recall drifts |
| Default choice | Yes | Only for very large, write-heavy |

### HNSW Tuning

```sql
-- m: max connections per layer (default 16). Higher = better recall, more memory.
-- ef_construction: build-time search width (default 64). Higher = better index, slower build.
CREATE INDEX chunks_hnsw_idx
ON chunks USING hnsw (embedding_half halfvec_cosine_ops)
WITH (m = 16, ef_construction = 200);

-- ef_search: query-time search width (default 40). Higher = better recall, slower query.
SET hnsw.ef_search = 100;

-- Parallel builds (pgvector 0.6+)
SET max_parallel_maintenance_workers = 7;
SET maintenance_work_mem = '8GB';
CREATE INDEX CONCURRENTLY ...;
```

### IVFFlat Tuning

```sql
-- lists: number of partitions. Rule of thumb: rows/1000 up to 1M, then sqrt(rows).
CREATE INDEX chunks_ivf_idx
ON chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 1000);

-- probes: partitions scanned at query time. Higher = better recall, slower.
SET ivfflat.probes = 10;
```

Build IVFFlat AFTER inserting representative data — centroids are computed once.

## Binary Quantization

Use bit columns with Hamming distance for ultra-fast prefilter, then rescore
with full-precision vectors.

```sql
-- Populate bit column at insert
INSERT INTO chunks (content, embedding, embedding_half, embedding_bit)
VALUES (
  $1,
  $2::vector,
  $2::vector::halfvec(1536),
  binary_quantize($2::vector)::bit(1536)
);

CREATE INDEX chunks_bit_idx
ON chunks USING hnsw (embedding_bit bit_hamming_ops)
WITH (m = 16, ef_construction = 100);
```

### Rescoring Query Pattern

```sql
WITH candidates AS (
  SELECT id, content, embedding
  FROM chunks
  WHERE tenant_id = $1
  ORDER BY embedding_bit <~> binary_quantize($2::vector)::bit(1536)
  LIMIT 100
)
SELECT id, content, 1 - (embedding <=> $2::vector) AS score
FROM candidates
ORDER BY embedding <=> $2::vector
LIMIT 10;
```

Latency drop: often 5-10x vs full float32 HNSW, with recall@10 recovered by rescoring.

## Hybrid Search (vector + BM25-like + trigram)

```sql
-- tsvector (BM25-ish via ts_rank_cd)
CREATE INDEX chunks_tsv_idx ON chunks USING gin (content_tsv);
-- trigram (fuzzy keyword)
CREATE INDEX chunks_trgm_idx ON chunks USING gin (content gin_trgm_ops);

WITH
  vec AS (
    SELECT id, 1 - (embedding <=> $1::vector) AS vec_score
    FROM chunks
    WHERE tenant_id = $2
    ORDER BY embedding <=> $1::vector
    LIMIT 50
  ),
  lex AS (
    SELECT id, ts_rank_cd(content_tsv, plainto_tsquery('english', $3)) AS lex_score
    FROM chunks
    WHERE tenant_id = $2
      AND content_tsv @@ plainto_tsquery('english', $3)
    LIMIT 50
  )
SELECT c.id, c.content,
       COALESCE(vec.vec_score, 0) * 0.6 + COALESCE(lex.lex_score, 0) * 0.4 AS score
FROM chunks c
LEFT JOIN vec ON vec.id = c.id
LEFT JOIN lex ON lex.id = c.id
WHERE (vec.id IS NOT NULL OR lex.id IS NOT NULL)
ORDER BY score DESC
LIMIT 10;
```

### Reciprocal Rank Fusion (RRF)

```sql
WITH
  vec AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> $1::vector) AS rnk
    FROM chunks WHERE tenant_id = $2
    ORDER BY embedding <=> $1::vector LIMIT 50
  ),
  lex AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(content_tsv,
             plainto_tsquery('english', $3)) DESC) AS rnk
    FROM chunks WHERE tenant_id = $2
      AND content_tsv @@ plainto_tsquery('english', $3)
    LIMIT 50
  )
SELECT id, SUM(1.0 / (60 + rnk)) AS rrf
FROM (
  SELECT id, rnk FROM vec
  UNION ALL
  SELECT id, rnk FROM lex
) x
GROUP BY id
ORDER BY rrf DESC
LIMIT 10;
```

## Multi-Tenant Patterns

### Partitioning by tenant_id (best for large SaaS)

```sql
CREATE TABLE chunks (
  id bigserial,
  tenant_id uuid NOT NULL,
  embedding halfvec(1536),
  content text,
  PRIMARY KEY (tenant_id, id)
) PARTITION BY HASH (tenant_id);

CREATE TABLE chunks_p0 PARTITION OF chunks FOR VALUES WITH (MODULUS 16, REMAINDER 0);
-- ... p1..p15
```

Build HNSW index per partition — smaller indexes, better cache locality.

### Row-level security (RLS)

```sql
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chunks
USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

## Index Build at Scale

```sql
-- Before bulk load
SET maintenance_work_mem = '16GB';
SET max_parallel_maintenance_workers = 7;

-- Load data first, THEN create index (10-50x faster than inserting into indexed table)
TRUNCATE chunks;
COPY chunks(tenant_id, content, embedding) FROM '/tmp/embeddings.csv' CSV;
CREATE INDEX CONCURRENTLY chunks_hnsw_idx
  ON chunks USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 200);
ANALYZE chunks;
```

## Replication and HA

- pgvector indexes replicate via standard streaming/physical replication.
- `vector` types are BINARY — logical replication works but requires matching extension versions on both ends.
- Indexes on replicas rebuild on promotion; check WAL sender / receiver lag during bulk reindex.
- Read replicas: pin embedding model version in app; mismatched indexes cause silent recall loss.

## Supabase-Specific Patterns

```sql
-- Supabase exposes vector search via RPC. Typical pattern:
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding halfvec(1536),
  match_threshold float,
  match_count int,
  p_tenant_id uuid
)
RETURNS TABLE (id bigint, content text, similarity float)
LANGUAGE sql STABLE
AS $$
  SELECT c.id, c.content, 1 - (c.embedding_half <=> query_embedding) AS similarity
  FROM chunks c
  WHERE c.tenant_id = p_tenant_id
    AND 1 - (c.embedding_half <=> query_embedding) > match_threshold
  ORDER BY c.embedding_half <=> query_embedding
  LIMIT match_count;
$$;
```

Supabase HNSW gotchas:
- `ef_search` is per-session; set via `SET LOCAL hnsw.ef_search` inside the RPC.
- `SECURITY DEFINER` functions lose RLS; keep `SECURITY INVOKER` and pass `tenant_id`.

## Node.js Client

```typescript
import pg from 'pg';
import pgvector from 'pgvector/pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pgvector.registerTypes(pool);

export async function search(tenantId: string, qVec: number[], k = 10) {
  const { rows } = await pool.query(
    `SET LOCAL hnsw.ef_search = 100;
     SELECT id, content, 1 - (embedding_half <=> $1::halfvec) AS score
     FROM chunks
     WHERE tenant_id = $2
     ORDER BY embedding_half <=> $1::halfvec
     LIMIT $3`,
    [pgvector.toSql(qVec), tenantId, k]
  );
  return rows;
}
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| IVFFlat index built on empty table | Load data first, index after |
| HNSW on full float32 1536-d for large tables | Use `halfvec` for 2x storage win |
| No `tenant_id` in WHERE before ORDER BY vector | Always filter first; use partitioned indexes |
| `ef_search` not raised from default 40 | Tune per query latency budget |
| Mixing distance operators (`<->` vs `<=>`) | Normalize: use cosine (`<=>`) if vectors normalized |
| Inserting one row at a time | Use `COPY` or batched INSERT for initial load |
| Ignoring `maintenance_work_mem` during build | Raise to GBs; otherwise index quality suffers |

## Production Checklist

- [ ] pgvector version >= 0.7 confirmed
- [ ] `halfvec` used for index column, full `vector` for rescoring
- [ ] HNSW params (m, ef_construction) tuned and recorded
- [ ] `ef_search` set per query for target recall
- [ ] Tenant filter present in every query (RLS or explicit)
- [ ] Hybrid search with tsvector + pg_trgm + vector
- [ ] `maintenance_work_mem` and parallel workers sized for build
- [ ] Monitoring: query latency p95, index bloat, replica lag
- [ ] Backup/restore tested with vector columns
