---
name: chromadb-advanced
description: |
  ChromaDB 0.5+ advanced features. Persistent vs ephemeral clients, collection-level
  HNSW tuning (space, construction_ef, M), multi-tenancy via collections, metadata
  filtering, embedding function plugins (OpenAI, Cohere, Voyage, custom), Chroma Cloud,
  recall tuning, migration patterns to production stores.

  USE WHEN: user mentions "Chroma", "ChromaDB", "chromadb-client", "Chroma Cloud",
  "Chroma collection", "chroma embedding function"

  DO NOT USE FOR: production-scale vector stores - use `vector-stores/qdrant-advanced`,
  `vector-stores/milvus`, or `vector-stores/pinecone-advanced`; hybrid search theory -
  use `rag/hybrid-search`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# ChromaDB Advanced

## Where Chroma Fits

Chroma is the go-to local-first vector DB for prototypes, notebooks, and small production workloads. Strengths:

- Single `pip install chromadb`, runs in-process or as a server.
- Simple, consistent API across embeddings, storage, and querying.
- Good defaults, low ceremony.

Known limits:

- Single-node architecture (no sharding in OSS).
- Throughput and recall curves tail off past 10-20M vectors.
- Filter performance worse than purpose-built stores at high cardinality.

Plan a migration path to Qdrant / Pinecone / Milvus when approaching those limits — see the end of this skill.

## Persistent vs Ephemeral vs HTTP Client

```python
# pip install chromadb>=0.5
import chromadb

# In-memory, wiped on exit
client = chromadb.EphemeralClient()

# On-disk, survives restarts
client = chromadb.PersistentClient(path="./.chroma")

# HTTP client to a remote Chroma server
client = chromadb.HttpClient(host="chroma.internal", port=8000, ssl=False)

# Chroma Cloud
client = chromadb.CloudClient(
    tenant="your-tenant",
    database="default",
    api_key=os.environ["CHROMA_API_KEY"],
)
```

In production, run a dedicated Chroma server (`chroma run --path /data`) or use Chroma Cloud — never rely on the persistent client inside a web server that scales horizontally (file-level locking fights concurrent writers).

## Collection Creation with HNSW Tuning

```python
collection = client.create_collection(
    name="docs",
    metadata={
        "hnsw:space": "cosine",           # cosine | l2 | ip
        "hnsw:construction_ef": 200,      # build-time breadth
        "hnsw:M": 32,                     # connections per node
        "hnsw:search_ef": 100,            # query-time breadth (higher = better recall)
        "hnsw:num_threads": 4,
        "hnsw:batch_size": 100,           # cached writes before rebuilding HNSW
        "hnsw:sync_threshold": 1000,
    },
)
```

Defaults (`M=16`, `construction_ef=100`, `search_ef=10`) under-serve production recall. Raise `M` to 24-32, `construction_ef` to 200, and `search_ef` to 64-128 on any corpus > 100k vectors.

`hnsw:space` must be set at creation — cannot change later without rebuilding.

## Embedding Functions

Chroma can compute embeddings for you on insert and query.

```python
from chromadb.utils import embedding_functions

openai_ef = embedding_functions.OpenAIEmbeddingFunction(
    api_key=os.environ["OPENAI_API_KEY"],
    model_name="text-embedding-3-small",
    dimensions=1024,                   # Matryoshka truncation
)

cohere_ef = embedding_functions.CohereEmbeddingFunction(
    api_key=os.environ["COHERE_API_KEY"],
    model_name="embed-multilingual-v3.0",
)

voyage_ef = embedding_functions.VoyageAIEmbeddingFunction(
    api_key=os.environ["VOYAGE_API_KEY"],
    model_name="voyage-3",
)

st_ef = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="BAAI/bge-base-en-v1.5",
)

collection = client.create_collection(
    name="docs",
    embedding_function=openai_ef,
    metadata={"hnsw:space": "cosine", "hnsw:M": 32},
)
```

Text in, vectors stored automatically. For large ingests, batch via the embedding function directly and feed precomputed vectors to avoid redundant API calls.

### Custom Embedding Function

```python
from chromadb import EmbeddingFunction, Documents, Embeddings

class MyEmbedder(EmbeddingFunction[Documents]):
    def __init__(self, model): self.model = model
    def __call__(self, input: Documents) -> Embeddings:
        return self.model.encode(input).tolist()

collection = client.create_collection(
    name="docs",
    embedding_function=MyEmbedder(my_st_model),
)
```

Chroma stores the embedding function's `name()` so reads can reattach the same function automatically.

## Insert / Upsert

```python
collection.add(
    ids=["d1", "d2", "d3"],
    documents=["OAuth uses refresh tokens.", "PKCE protects public clients.", "..."],
    metadatas=[{"source": "kb", "tenant_id": "acme"}] * 3,
)

# Upsert: insert or update
collection.upsert(
    ids=["d1"],
    documents=["Updated text."],
    metadatas=[{"source": "kb", "tenant_id": "acme", "rev": 2}],
)
```

Batch size: keep batches under 5000 IDs to avoid memory spikes during HNSW merge.

## Query

```python
result = collection.query(
    query_texts=["how do I refresh a token"],   # embedded by the collection's ef
    n_results=10,
    where={
        "$and": [
            {"tenant_id": {"$eq": "acme"}},
            {"source": {"$in": ["kb", "faq"]}},
            {"created_at": {"$gte": 1700000000}},
        ],
    },
    where_document={"$contains": "refresh"},
    include=["documents", "metadatas", "distances"],
)
```

Two filter kinds:
- `where`: metadata filters (typed operators `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$and`, `$or`).
- `where_document`: substring/regex on document text (`$contains`, `$not_contains`).

Chroma applies both before the ANN search (pre-filter) when the filter is selective enough.

## Multi-Tenancy Patterns

| Pattern | When | Notes |
|---|---|---|
| Collection per tenant | Few (< 1000) tenants, strong isolation | Each collection gets its own HNSW index |
| Single collection + tenant_id metadata | Many tenants, shared schema | Must rely on metadata filters |
| Chroma Cloud tenants/databases | Multi-customer SaaS | Hard isolation at the API layer |

Collections are cheap — you can create hundreds without issue. Don't push to tens of thousands; open collection overhead starts to bite.

## Recall Tuning

Run a labeled eval and sweep HNSW parameters.

```python
import itertools, time

def measure(recall_set, collection, search_ef):
    collection.modify(metadata={"hnsw:search_ef": search_ef})
    recalls, latencies = [], []
    for q, gold in recall_set:
        t = time.perf_counter()
        res = collection.query(query_texts=[q], n_results=10)
        latencies.append(time.perf_counter() - t)
        got = set(res["ids"][0])
        recalls.append(len(got & gold) / max(len(gold), 1))
    return sum(recalls) / len(recalls), sum(latencies) / len(latencies)

for ef in [10, 40, 80, 160, 320]:
    r, lat = measure(eval_set, collection, ef)
    print(f"search_ef={ef:4d}  recall@10={r:.3f}  p50={lat*1000:.1f}ms")
```

Choose the smallest `search_ef` that hits your recall target.

## Chroma Cloud

Managed Chroma with horizontal scale. Fundamental differences vs OSS:

- Multi-writer safe (OSS persistent client is single-writer).
- Tenant / database isolation at the API layer.
- Regional endpoints.

```python
client = chromadb.CloudClient(
    tenant="my-tenant",
    database="production",
    api_key=os.environ["CHROMA_API_KEY"],
)
```

Good fit when your team wants the Chroma API but cannot self-host.

## Chroma Server in Production

```yaml
# docker-compose.yml
services:
  chroma:
    image: chromadb/chroma:0.5.20
    volumes: ["./chroma-data:/chroma/chroma"]
    ports: ["8000:8000"]
    environment:
      IS_PERSISTENT: "TRUE"
      PERSIST_DIRECTORY: /chroma/chroma
      CHROMA_SERVER_AUTHN_PROVIDER: "chromadb.auth.token_authn.TokenAuthenticationServerProvider"
      CHROMA_SERVER_AUTHN_CREDENTIALS: "${CHROMA_API_KEY}"
      CHROMA_AUTH_TOKEN_TRANSPORT_HEADER: "X-Chroma-Token"
```

Run behind a reverse proxy with TLS. Monitor `/api/v1/heartbeat`.

## Migration to Production Stores

When you outgrow Chroma:

```python
# Export from Chroma
batch = collection.get(include=["embeddings", "documents", "metadatas"], limit=10000)

# Import into Qdrant
from qdrant_client import QdrantClient, models
qc = QdrantClient(url=os.environ["QDRANT_URL"], api_key=os.environ["QDRANT_KEY"])
qc.upsert("docs", points=[
    models.PointStruct(id=i, vector=v, payload={"text": t, **m})
    for i, (v, t, m) in enumerate(zip(batch["embeddings"],
                                      batch["documents"],
                                      batch["metadatas"]))
])
```

Page with `limit` + `offset` for large collections. Verify a sample of query parity before cutting traffic over.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Persistent client inside a scaled web server | Run Chroma server or use Chroma Cloud |
| Default HNSW params on production corpus | Raise `M`, `construction_ef`, `search_ef` |
| Changing `hnsw:space` after creation | Recreate collection with target space |
| One huge collection for 10k+ tenants | Collection-per-tenant or move to a scalable store |
| `where_document` with large regex scans | Filter on metadata first; substring is slow |
| Re-embedding data on every ingest | Precompute vectors for bulk loads; feed via `embeddings=` param |
| Running Chroma on a tiny VM for a 5M corpus | HNSW is RAM-heavy; size the VM or migrate |
| Ignoring the `collection.count()` growth curve | Monitor size; plan migration at 5-10M |

## Production Checklist

- [ ] Dedicated Chroma server or Chroma Cloud (not persistent client behind a web tier)
- [ ] HNSW params tuned (`M`, `construction_ef`, `search_ef`)
- [ ] `hnsw:space` set correctly at creation
- [ ] Embedding function pinned with model name + version
- [ ] Authentication enabled on server
- [ ] Backups of the persistent directory
- [ ] Metadata filters indexed by intent (pre-filter capable)
- [ ] Recall eval harness tracks search_ef tuning
- [ ] Migration runbook ready for when scale exceeds Chroma
- [ ] `collection.count()` and query latency dashboards
- [ ] Periodic compaction / restart during maintenance window
