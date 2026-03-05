# ChromaDB

## Overview

ChromaDB is an open-source embedding database designed for simplicity. It runs locally with zero configuration, supports a client/server model for production, and includes built-in embedding functions. ChromaDB is ideal for prototyping, local-first applications, and teams that want full control over their vector storage infrastructure.

## Setup

### Python

```bash
pip install chromadb
```

```python
import chromadb

# Ephemeral (in-memory, data lost on restart)
client = chromadb.Client()

# Persistent (data saved to disk)
client = chromadb.PersistentClient(path="/path/to/data")

# Client/server mode
client = chromadb.HttpClient(host="localhost", port=8000)
```

### JavaScript / TypeScript

```bash
npm install chromadb
```

```typescript
import { ChromaClient } from "chromadb";
const client = new ChromaClient({ path: "http://localhost:8000" });
```

### Docker Deployment

```yaml
# docker-compose.yml
services:
  chromadb:
    image: chromadb/chroma:latest
    ports:
      - "8000:8000"
    volumes:
      - chroma_data:/chroma/chroma
    environment:
      - ANONYMIZED_TELEMETRY=false
      - CHROMA_SERVER_AUTH_PROVIDER=chromadb.auth.token_authn.TokenAuthenticationServerProvider
      - CHROMA_SERVER_AUTH_TOKEN=your-secret-token
    restart: unless-stopped

volumes:
  chroma_data:
```

## Collections

Collections are the primary organizational unit. Each collection holds documents, embeddings, metadata, and IDs.

```python
collection = client.get_or_create_collection(
    name="articles",
    metadata={"hnsw:space": "cosine"}   # Distance: cosine, l2, ip
)

# List, get, delete
collections = client.list_collections()
client.delete_collection("articles")
```

```typescript
const collection = await client.getOrCreateCollection({
  name: "articles",
  metadata: { "hnsw:space": "cosine" },
});
```

## Embedding Functions

ChromaDB can automatically generate embeddings using pluggable embedding functions.

```python
# Default: all-MiniLM-L6-v2 (downloads on first use)
collection = client.get_or_create_collection("articles")
collection.add(
    documents=["ChromaDB is an embedding database"],
    ids=["doc1"]
)

# OpenAI embeddings
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
openai_ef = OpenAIEmbeddingFunction(api_key="sk-...", model_name="text-embedding-3-small")
collection = client.get_or_create_collection("articles", embedding_function=openai_ef)

# Custom embedding function
from chromadb import Documents, EmbeddingFunction, Embeddings

class MyEmbeddingFunction(EmbeddingFunction):
    def __call__(self, input: Documents) -> Embeddings:
        return [self._embed(doc) for doc in input]
    def _embed(self, text: str) -> list[float]:
        return [0.0] * 384  # Replace with real embeddings
```

## Core Operations

### Add Documents

```python
collection.add(
    documents=["First document", "Second document"],
    metadatas=[{"source": "wiki", "year": 2024}, {"source": "blog", "year": 2025}],
    ids=["doc1", "doc2"]
)

# Add with pre-computed embeddings (bypasses embedding function)
collection.add(
    embeddings=[[0.1, 0.2, ...], [0.3, 0.4, ...]],
    metadatas=[{"source": "wiki"}, {"source": "blog"}],
    ids=["doc1", "doc2"]
)
```

### Query

```python
results = collection.query(
    query_texts=["What is vector search?"],
    n_results=5,
    include=["documents", "metadatas", "distances"]
)
# results["ids"], results["documents"], results["distances"]
```

### Filtering with Where Clauses

```python
# Metadata filter
results = collection.query(
    query_texts=["machine learning"], n_results=10,
    where={"source": {"$eq": "wiki"}}
)

# Numeric range
results = collection.query(
    query_texts=["machine learning"], n_results=10,
    where={"year": {"$gte": 2024}}
)

# Logical operators
results = collection.query(
    query_texts=["machine learning"], n_results=10,
    where={"$and": [{"source": {"$eq": "wiki"}}, {"year": {"$gte": 2024}}]}
)

# Document content filter
results = collection.query(
    query_texts=["machine learning"], n_results=10,
    where_document={"$contains": "neural"}
)
```

Supported operators: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$and`, `$or`.

### Update and Delete

```python
# Update
collection.update(ids=["doc1"], documents=["Updated document"],
    metadatas=[{"source": "wiki", "year": 2025}])

# Upsert: update if exists, insert if not
collection.upsert(ids=["doc1", "doc3"],
    documents=["Updated doc", "Brand new doc"],
    metadatas=[{"source": "wiki"}, {"source": "manual"}])

# Delete by ID
collection.delete(ids=["doc1", "doc2"])

# Delete by filter
collection.delete(where={"source": {"$eq": "deprecated"}})
```

### Get Documents (Non-Similarity Fetch)

```python
results = collection.get(ids=["doc1", "doc2"], include=["documents", "metadatas"])

# Get with filters and pagination
results = collection.get(where={"source": {"$eq": "wiki"}}, limit=100, offset=0)

count = collection.count()
```

## Persistent Storage Configuration

```python
client = chromadb.PersistentClient(path="./chroma_data")

# HNSW index parameters (set at collection creation, cannot change later)
collection = client.get_or_create_collection(
    name="optimized",
    metadata={
        "hnsw:space": "cosine",
        "hnsw:construction_ef": 200,   # Higher = better recall, slower build
        "hnsw:search_ef": 100,         # Higher = better recall, slower query
        "hnsw:M": 32,                  # Connections per node (default 16)
    }
)
```

## Production Patterns

### RAG Pipeline

```python
def build_rag_collection(documents: list[dict]) -> chromadb.Collection:
    client = chromadb.PersistentClient(path="./rag_data")
    ef = OpenAIEmbeddingFunction(api_key="sk-...", model_name="text-embedding-3-small")
    collection = client.get_or_create_collection("knowledge", embedding_function=ef)
    batch_size = 100
    for i in range(0, len(documents), batch_size):
        batch = documents[i : i + batch_size]
        collection.upsert(
            ids=[doc["id"] for doc in batch],
            documents=[doc["text"] for doc in batch],
            metadatas=[doc.get("metadata", {}) for doc in batch]
        )
    return collection

def rag_query(collection, question: str, n_results: int = 5) -> list[str]:
    results = collection.query(query_texts=[question], n_results=n_results,
        include=["documents", "distances"])
    return results["documents"][0]
```

### Multi-Tenant Isolation

```python
# Separate collections per tenant
def get_tenant_collection(client, tenant_id: str):
    return client.get_or_create_collection(name=f"tenant_{tenant_id}")

# Or metadata filtering within a shared collection
def query_tenant(collection, tenant_id: str, query_text: str):
    return collection.query(query_texts=[query_text], n_results=10,
        where={"tenant_id": {"$eq": tenant_id}})
```

### Authentication (Client/Server Mode)

```python
# Server-side: set env vars CHROMA_SERVER_AUTH_PROVIDER and CHROMA_SERVER_AUTH_TOKEN
client = chromadb.HttpClient(host="localhost", port=8000,
    headers={"Authorization": "Bearer your-secret-token"})
```

## Anti-Patterns

- **Using ephemeral client for production**: Data is lost on restart. Always use `PersistentClient` or client/server mode.
- **Mixing embedding functions in one collection**: Adding with OpenAI embeddings and querying with the default function produces meaningless results. Use the same function consistently.
- **Not setting IDs**: Without meaningful IDs, you cannot update or delete specific documents.
- **Storing large documents without chunking**: Long documents produce poor embeddings. Chunk into 200-500 token segments.
- **Ignoring HNSW parameters for large collections**: Default parameters work for small datasets. Tune `construction_ef`, `search_ef`, and `M` for millions of vectors.

## Production Checklist

- [ ] Persistent storage configured with durable path (not `/tmp`)
- [ ] Embedding function explicitly set (not relying on default for production)
- [ ] HNSW parameters tuned for dataset size and recall requirements
- [ ] Authentication enabled for client/server deployments
- [ ] Docker volumes mounted for data persistence
- [ ] Backup strategy for the Chroma data directory
- [ ] Document chunking strategy implemented (200-500 tokens recommended)
- [ ] Consistent embedding function used across add and query operations
- [ ] Collection naming convention established for multi-tenant scenarios
- [ ] Monitoring for collection sizes and query latency
