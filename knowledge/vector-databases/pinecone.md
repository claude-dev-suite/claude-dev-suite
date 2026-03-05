# Pinecone

## Overview

Pinecone is a fully managed vector database designed for production-scale similarity search. It handles infrastructure, scaling, and index optimization automatically, letting you focus on building applications. Pinecone supports two deployment models: **pod-based** (dedicated infrastructure) and **serverless** (pay-per-query, recommended for most workloads).

## Setup

### Python SDK

```bash
pip install pinecone-client
```

```python
from pinecone import Pinecone, ServerlessSpec, PodSpec

pc = Pinecone(api_key="YOUR_API_KEY")
```

### Node.js SDK

```bash
npm install @pinecone-database/pinecone
```

```typescript
import { Pinecone } from "@pinecone-database/pinecone";

const pc = new Pinecone({ apiKey: "YOUR_API_KEY" });
```

## Index Creation

### Serverless Index (Recommended)

Serverless indexes scale automatically and charge per query. Best for most workloads, especially variable traffic.

```python
pc.create_index(
    name="product-catalog",
    dimension=1536,          # Must match your embedding model output
    metric="cosine",         # "cosine" | "euclidean" | "dotproduct"
    spec=ServerlessSpec(
        cloud="aws",         # "aws" | "gcp" | "azure"
        region="us-east-1"
    )
)
```

```typescript
await pc.createIndex({
  name: "product-catalog",
  dimension: 1536,
  metric: "cosine",
  spec: {
    serverless: {
      cloud: "aws",
      region: "us-east-1",
    },
  },
});
```

### Pod-Based Index

Pod indexes provide dedicated infrastructure. Use when you need consistent low-latency or have predictable, high-throughput workloads.

```python
pc.create_index(
    name="product-catalog",
    dimension=1536,
    metric="cosine",
    spec=PodSpec(
        environment="us-east-1-aws",
        pod_type="p1.x1",    # p1 (storage), s1 (performance), p2 (lowest latency)
        pods=1,
        replicas=1
    )
)
```

### Pod vs Serverless Decision Matrix

| Factor               | Serverless                     | Pod-Based                       |
| -------------------- | ------------------------------ | ------------------------------- |
| Scaling              | Automatic                      | Manual (add pods/replicas)      |
| Pricing              | Per read/write unit            | Per pod-hour                    |
| Cold starts          | Possible on infrequent queries | None                            |
| Best for             | Variable traffic, prototyping  | Steady high-throughput          |
| Metadata filtering   | Included                       | Included                        |
| Max vector dimension | 20,000                         | 20,000                          |

## Core Operations

### Upsert Vectors

```python
index = pc.Index("product-catalog")

# Single upsert
index.upsert(vectors=[
    {
        "id": "prod-001",
        "values": [0.1, 0.2, ...],   # 1536-dim float list
        "metadata": {
            "category": "electronics",
            "price": 299.99,
            "in_stock": True,
            "tags": ["laptop", "portable"]
        }
    }
])

# Batch upsert (recommended for bulk ingestion)
def chunked_upsert(index, vectors, batch_size=100):
    for i in range(0, len(vectors), batch_size):
        batch = vectors[i : i + batch_size]
        index.upsert(vectors=batch)
```

```typescript
const index = pc.index("product-catalog");

await index.upsert([
  {
    id: "prod-001",
    values: [0.1, 0.2 /* ... */],
    metadata: {
      category: "electronics",
      price: 299.99,
      in_stock: true,
    },
  },
]);
```

### Query Vectors

```python
results = index.query(
    vector=[0.1, 0.2, ...],   # Query embedding
    top_k=10,                  # Number of results
    include_metadata=True,
    include_values=False       # Set True only if you need raw vectors back
)

for match in results["matches"]:
    print(f"ID: {match['id']}, Score: {match['score']}")
    print(f"Metadata: {match['metadata']}")
```

```typescript
const results = await index.query({
  vector: [0.1, 0.2 /* ... */],
  topK: 10,
  includeMetadata: true,
});

for (const match of results.matches) {
  console.log(`${match.id}: ${match.score}`);
}
```

### Metadata Filtering

Pinecone supports filtering on metadata fields during queries, reducing the search space before vector comparison.

```python
# Equality
results = index.query(
    vector=query_embedding,
    top_k=10,
    filter={"category": {"$eq": "electronics"}}
)

# Numeric range
results = index.query(
    vector=query_embedding,
    top_k=10,
    filter={
        "price": {"$gte": 100, "$lte": 500},
        "in_stock": {"$eq": True}
    }
)

# IN operator (match any value in list)
results = index.query(
    vector=query_embedding,
    top_k=10,
    filter={"category": {"$in": ["electronics", "accessories"]}}
)

# AND / OR combinations
results = index.query(
    vector=query_embedding,
    top_k=10,
    filter={
        "$and": [
            {"price": {"$lte": 500}},
            {"$or": [
                {"category": {"$eq": "electronics"}},
                {"category": {"$eq": "accessories"}}
            ]}
        ]
    }
)
```

Supported filter operators: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$exists`, `$and`, `$or`.

### Delete Vectors

```python
# Delete by ID
index.delete(ids=["prod-001", "prod-002"])

# Delete by metadata filter
index.delete(filter={"category": {"$eq": "discontinued"}})

# Delete all vectors in a namespace
index.delete(delete_all=True, namespace="staging")
```

```typescript
await index.deleteMany(["prod-001", "prod-002"]);

// Delete all in namespace
const ns = index.namespace("staging");
await ns.deleteAll();
```

### Fetch by ID

```python
# Fetch specific vectors by ID (no similarity search)
result = index.fetch(ids=["prod-001", "prod-002"])

for id, vector in result["vectors"].items():
    print(f"{id}: metadata={vector['metadata']}")
```

### Update Metadata

```python
index.update(
    id="prod-001",
    set_metadata={"price": 249.99, "on_sale": True}
)
```

## Namespaces

Namespaces partition vectors within a single index. Queries only search within the specified namespace. Use namespaces to separate tenants, environments, or data categories without creating multiple indexes.

```python
# Upsert into a namespace
index.upsert(
    vectors=[{"id": "doc-1", "values": [...], "metadata": {"source": "wiki"}}],
    namespace="tenant-abc"
)

# Query within a namespace
results = index.query(
    vector=query_embedding,
    top_k=5,
    namespace="tenant-abc"
)

# List all vectors in a namespace (paginated)
for ids in index.list(namespace="tenant-abc"):
    print(ids)
```

## Batch Operations for Bulk Ingestion

```python
import itertools

def batch_upsert_with_progress(index, vectors, namespace="", batch_size=100):
    """Upsert vectors in batches with progress tracking."""
    total = len(vectors)
    for i in range(0, total, batch_size):
        batch = vectors[i : i + batch_size]
        index.upsert(vectors=batch, namespace=namespace)
        print(f"Upserted {min(i + batch_size, total)}/{total}")

# Generate embeddings and upsert in a streaming fashion
def stream_upsert(index, documents, embed_fn, batch_size=100):
    """Process documents in batches: embed then upsert."""
    batch = []
    for doc in documents:
        embedding = embed_fn(doc["text"])
        batch.append({
            "id": doc["id"],
            "values": embedding,
            "metadata": doc.get("metadata", {})
        })
        if len(batch) >= batch_size:
            index.upsert(vectors=batch)
            batch = []
    if batch:
        index.upsert(vectors=batch)
```

## Integration with Embedding Models

```python
import openai
from pinecone import Pinecone

# Generate embeddings with OpenAI
def get_embedding(text: str, model="text-embedding-3-small") -> list[float]:
    response = openai.embeddings.create(input=text, model=model)
    return response.data[0].embedding

# RAG query pattern
def semantic_search(query: str, index, top_k=5, namespace=""):
    query_embedding = get_embedding(query)
    results = index.query(
        vector=query_embedding,
        top_k=top_k,
        include_metadata=True,
        namespace=namespace
    )
    return [
        {"text": m["metadata"]["text"], "score": m["score"]}
        for m in results["matches"]
    ]
```

## Cost Optimization

1. **Use serverless indexes** for development and variable workloads. You only pay for what you use.
2. **Reduce dimensions** when possible. `text-embedding-3-small` at 512 dims is significantly cheaper to store and query than 1536 dims, with minimal quality loss for many tasks.
3. **Use namespaces** instead of multiple indexes. Each index has a base cost; namespaces within one index are free.
4. **Batch upserts** at 100 vectors per call. Each API call has overhead; batching amortizes it.
5. **Avoid `include_values=True`** in queries unless you need raw vectors. Returning vectors increases response size and latency.
6. **Use metadata filtering** to narrow search scope. Filtering before vector comparison reduces compute.
7. **Delete stale data**. You pay for stored vectors. Clean up unused namespaces and outdated records.
8. **Choose the right metric**. Cosine similarity is the default and works for most normalized embeddings. Use dotproduct only with pre-normalized vectors.

## Anti-Patterns

- **Storing raw text in metadata**: Pinecone metadata has a 40KB limit per vector. Store text in your own database and reference it by ID.
- **Creating one index per user**: Indexes have base costs. Use namespaces for multi-tenancy.
- **Querying without metadata filters when applicable**: If you know the category, filter first to reduce search space.
- **Using pod-based indexes for prototyping**: Serverless is cheaper for low-traffic development.
- **Ignoring dimension mismatch**: The index dimension must exactly match your embedding model output. Mismatches cause silent errors or API rejections.

## Production Checklist

- [ ] API key stored in environment variable or secrets manager, never in code
- [ ] Index dimension matches embedding model output exactly
- [ ] Batch size set to 100 for upserts (Pinecone recommended max)
- [ ] Metadata fields indexed only for fields you filter on
- [ ] Namespaces used for multi-tenancy instead of separate indexes
- [ ] Error handling and retries implemented for API calls
- [ ] Monitoring set up for query latency and error rates via Pinecone console
- [ ] Backup strategy: export vectors periodically (Pinecone has no built-in backup)
- [ ] Rate limits understood: check your plan's QPS limits
- [ ] `include_values=False` in queries unless vectors are explicitly needed
