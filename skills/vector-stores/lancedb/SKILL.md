---
name: lancedb
description: |
  LanceDB columnar vector database. Arrow-native storage, versioning and time-travel,
  merge-on-read, full-text + vector hybrid, pandas/polars integration, object-storage
  backing, Rust-based performance, embedding function registration, IVF_PQ and HNSW
  indexes.

  USE WHEN: user mentions "LanceDB", "Lance format", "Arrow vector store", "embedded
  vector DB", "pylance", "lance time travel"

  DO NOT USE FOR: managed vector DBs - use `vector-stores/pinecone-advanced`,
  `vector-stores/mongodb-atlas-vector`; distributed Milvus - use `vector-stores/milvus`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# LanceDB

## Why LanceDB

LanceDB is an embedded vector database (like SQLite for vectors):

- Single-file columnar Lance format on disk or S3/GCS.
- Arrow native — zero-copy read into pandas, polars, DuckDB.
- Versioned writes with time travel (checkout any past snapshot).
- No server process; your Python / TypeScript process opens the DB directly.
- Rust core, bindings for Python and JS/TS.

Pick LanceDB when:

- You want a vector store without standing up another service.
- Your corpus sits in S3 / GCS and you want to query it in place.
- Data analytics (pandas, polars, DuckDB) is part of your retrieval pipeline.

Skip it for:

- Multi-writer concurrency (it handles one writer at a time cleanly).
- Very high QPS serving — embed into a server or use LanceDB Cloud.

## Local vs Cloud vs S3

```python
# pip install lancedb
import lancedb

# Local directory
db = lancedb.connect("./.lancedb")

# S3-backed (no server)
db = lancedb.connect("s3://my-bucket/lancedb",
                     storage_options={"region": "us-east-1"})

# LanceDB Cloud (managed)
db = lancedb.connect("db://my-project", api_key=os.environ["LANCEDB_API_KEY"])
```

S3 backing is a killer feature: many readers, one writer, all reading the same immutable Lance files. No replication to configure.

## Creating a Table

```python
import pyarrow as pa
import numpy as np

schema = pa.schema([
    pa.field("id", pa.string()),
    pa.field("vector", pa.list_(pa.float32(), 1024)),
    pa.field("text", pa.string()),
    pa.field("tenant_id", pa.string()),
    pa.field("created_at", pa.timestamp("us")),
])

table = db.create_table("docs", schema=schema, mode="overwrite")
```

Or infer from data:

```python
data = [
    {"id": "d1", "vector": np.random.rand(1024).astype("float32"),
     "text": "OAuth uses refresh tokens.", "tenant_id": "acme"},
]
table = db.create_table("docs", data=data)
```

## Embedding Functions (Auto-Embed on Insert)

Register an embedder so the library computes vectors for you — store text, search text, never touch the vector column.

```python
from lancedb.pydantic import LanceModel, Vector
from lancedb.embeddings import get_registry

registry = get_registry()
embedder = registry.get("openai").create(name="text-embedding-3-small")

class Doc(LanceModel):
    id: str
    text: str = embedder.SourceField()
    vector: Vector(embedder.ndims()) = embedder.VectorField()
    tenant_id: str

table = db.create_table("docs", schema=Doc, mode="overwrite")
table.add([
    {"id": "d1", "text": "OAuth uses refresh tokens.", "tenant_id": "acme"},
    {"id": "d2", "text": "PKCE protects public clients.", "tenant_id": "acme"},
])

# Search by text
results = table.search("how to refresh a token").limit(5).to_pandas()
```

Registry includes OpenAI, Cohere, Voyage, HuggingFace Sentence Transformers, Ollama, and custom subclasses.

## Indexing (IVF_PQ + HNSW)

Default brute-force search is fine up to ~50k vectors. Beyond that, build an ANN index:

```python
# IVF_PQ — good for million+ scale with memory savings
table.create_index(
    metric="cosine",
    num_partitions=256,       # rule: sqrt(num_rows)
    num_sub_vectors=96,       # must divide dim; 1024/96 rounds, try 64 or 128
    index_type="IVF_PQ",
)

# HNSW — higher recall, more memory
table.create_index(
    metric="cosine",
    index_type="IVF_HNSW_SQ",  # IVF with HNSW inside each partition + scalar quantization
    num_partitions=256,
)
```

`IVF_HNSW_SQ` is LanceDB's current sweet spot for accuracy + memory.

### Scalar indexes

```python
table.create_scalar_index("tenant_id")     # bitmap; fast equality / IN filters
table.create_scalar_index("created_at")    # btree; range queries
```

## Full-Text Search (FTS) + Vector Hybrid

```python
table.create_fts_index("text", use_tantivy=True)

# Hybrid search
from lancedb.rerankers import RRFReranker

results = (
    table.search(query_type="hybrid")
    .vector(q_vec)
    .text("oauth refresh token")
    .rerank(reranker=RRFReranker())
    .where("tenant_id = 'acme'")
    .limit(10)
    .to_pandas()
)
```

`use_tantivy=True` enables the Rust Tantivy engine (BM25 + stemming + Unicode tokenization). FTS and vector query run in parallel, then merge via the reranker.

## Filters with SQL WHERE

LanceDB accepts DataFusion SQL in `.where()`:

```python
table.search(q_vec).where(
    "tenant_id = 'acme' AND created_at > TIMESTAMP '2025-01-01' AND archived = false",
    prefilter=True,
).limit(10).to_pandas()
```

`prefilter=True` applies the filter before ANN search (fewer candidates, possibly lower recall if the filter is very selective); `prefilter=False` (default) filters after.

## Versioning and Time Travel

Every write creates a new version of the dataset. Checkout any past version:

```python
# Inspect versions
table.list_versions()
# [{'version': 1, 'timestamp': ..., 'metadata': {...}}, ...]

# Time-travel read
old = table.checkout(version=3).to_pandas()

# Restore to a past version
table.restore(version=3)
```

Versions are cheap (copy-on-write). Use them to:

- Reproduce evals against a fixed corpus snapshot.
- Roll back accidental bulk deletes.
- Blue-green ingest: write new version, swap pointer.

## Merge-on-Read Upserts

```python
table.merge_insert("id").when_matched_update_all().when_not_matched_insert_all().execute([
    {"id": "d1", "text": "Updated text.", "tenant_id": "acme"},
    {"id": "d3", "text": "New doc.", "tenant_id": "acme"},
])
```

This is a proper UPSERT: match on `id`, update matching rows, insert the rest. Background compaction eventually rewrites files to remove tombstones.

## Compaction and Optimization

Frequent small writes leave many tiny fragments. Run compaction:

```python
table.optimize(cleanup_older_than=timedelta(days=7))
```

It rewrites fragments into larger files and purges unreachable versions. Schedule nightly in production.

## Polars / DuckDB Integration

LanceDB tables are Arrow; polars and DuckDB read them zero-copy.

```python
import polars as pl

df = table.to_polars()
df.filter(pl.col("tenant_id") == "acme").select(["id", "text"])

# DuckDB
import duckdb
duckdb.sql("SELECT id, text FROM lance_scan('./.lancedb/docs.lance') WHERE tenant_id = 'acme'")
```

Useful for offline eval, training set construction, bulk re-embedding.

## Multi-Tenancy

Pick one of:

1. Single table + `tenant_id` column + scalar index + filter per query.
2. Table per tenant (`db.create_table(f"docs_{tenant_id}", ...)`).

Pattern 1 scales for thousands of tenants. Pattern 2 is cleaner when tenants have radically different schemas or data volumes.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Brute-force search on 1M+ vectors | Build IVF_PQ or IVF_HNSW_SQ index |
| Many concurrent writers | Serialize writes; LanceDB is single-writer per table |
| Forgetting to optimize | Nightly `table.optimize()` with retention |
| Storing raw PDFs in a row | Store text only; PDFs go to object storage |
| No scalar index on filter columns | Add `create_scalar_index` for filtered fields |
| Re-running embedding on every read | Register embedder; vectors are stored once |
| Ignoring versioning | Use `checkout` for reproducible evals |
| Full-text search without `use_tantivy=True` | Tantivy is substantially better than the legacy tokenizer |

## Production Checklist

- [ ] S3/GCS storage for multi-reader deployments
- [ ] IVF_HNSW_SQ or IVF_PQ index on > 100k vectors
- [ ] Scalar indexes on filtered fields
- [ ] FTS with `use_tantivy=True` for hybrid
- [ ] Nightly `optimize` with retention policy
- [ ] Version pinned for eval reproducibility
- [ ] Embedding function versioned with model name
- [ ] Single-writer discipline enforced (queue or leader election)
- [ ] Storage size monitored (versions accumulate until cleaned)
- [ ] Backup strategy: S3 versioning + lifecycle to Glacier
