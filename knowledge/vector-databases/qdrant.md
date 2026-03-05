# Qdrant

## Overview

Qdrant is an open-source vector similarity search engine written in Rust. It provides a production-ready service with a convenient API, supports rich payload filtering, and is optimized for high performance. Qdrant can be self-hosted via Docker or used as a managed cloud service.

## Setup

### Docker (Self-Hosted)

```yaml
# docker-compose.yml
services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"    # REST API
      - "6334:6334"    # gRPC API
    volumes:
      - qdrant_data:/qdrant/storage
    environment:
      - QDRANT__SERVICE__API_KEY=your-secret-key
    restart: unless-stopped
volumes:
  qdrant_data:
```

### Python Client

```bash
pip install qdrant-client
```

```python
from qdrant_client import QdrantClient

client = QdrantClient(host="localhost", port=6333)           # Local Docker
client = QdrantClient(":memory:")                            # In-memory (testing)
client = QdrantClient(url="https://cluster.cloud.qdrant.io", api_key="key")  # Cloud
```

### JavaScript / TypeScript Client

```bash
npm install @qdrant/js-client-rest
```

```typescript
import { QdrantClient } from "@qdrant/js-client-rest";
const client = new QdrantClient({ url: "http://localhost:6333", apiKey: "your-key" });
```

## Collections and Points

```python
from qdrant_client.models import Distance, VectorParams, PointStruct

# Create collection
client.create_collection(
    collection_name="documents",
    vectors_config=VectorParams(size=1536, distance=Distance.COSINE)
)

# Named vectors (multiple vector types per point)
client.create_collection(
    collection_name="multimodal",
    vectors_config={
        "text": VectorParams(size=1536, distance=Distance.COSINE),
        "image": VectorParams(size=512, distance=Distance.COSINE),
    }
)

# Upsert points
client.upsert(
    collection_name="documents",
    points=[
        PointStruct(id=1, vector=[0.1, 0.2, ...], payload={
            "title": "Introduction to Qdrant",
            "category": "database",
            "year": 2024,
            "tags": ["vector", "search"],
            "author": {"name": "Alice", "org": "Acme"}
        }),
        PointStruct(id=2, vector=[0.4, 0.5, ...], payload={
            "title": "Advanced Filtering", "category": "tutorial", "year": 2025
        })
    ]
)

# Batch upsert for large datasets
def batch_upsert(client, collection, points, batch_size=100):
    for i in range(0, len(points), batch_size):
        client.upsert(collection_name=collection, points=points[i:i+batch_size])
```

## Search and Filtering

### Basic Search

```python
results = client.search(
    collection_name="documents",
    query_vector=[0.1, 0.2, ...],
    limit=10,
    with_payload=True,
    with_vectors=False,
    score_threshold=0.7
)
for point in results:
    print(f"ID: {point.id}, Score: {point.score}, Payload: {point.payload}")
```

### Payload Filtering

```python
from qdrant_client.models import Filter, FieldCondition, MatchValue, MatchAny, Range

# Exact match
results = client.search(
    collection_name="documents", query_vector=query_vec,
    query_filter=Filter(must=[
        FieldCondition(key="category", match=MatchValue(value="database"))
    ]), limit=10
)

# Numeric range
results = client.search(
    collection_name="documents", query_vector=query_vec,
    query_filter=Filter(must=[
        FieldCondition(key="year", range=Range(gte=2024, lte=2025))
    ]), limit=10
)

# Nested field
results = client.search(
    collection_name="documents", query_vector=query_vec,
    query_filter=Filter(must=[
        FieldCondition(key="author.org", match=MatchValue(value="Acme"))
    ]), limit=10
)

# Must NOT (exclusion)
results = client.search(
    collection_name="documents", query_vector=query_vec,
    query_filter=Filter(must_not=[
        FieldCondition(key="category", match=MatchValue(value="deprecated"))
    ]), limit=10
)

# Match any value in a list
results = client.search(
    collection_name="documents", query_vector=query_vec,
    query_filter=Filter(must=[
        FieldCondition(key="tags", match=MatchAny(any=["vector", "search"]))
    ]), limit=10
)
```

### Scroll API (Paginated Retrieval)

```python
results, next_offset = client.scroll(
    collection_name="documents",
    scroll_filter=Filter(must=[
        FieldCondition(key="category", match=MatchValue(value="database"))
    ]),
    limit=100, with_payload=True, with_vectors=False
)
while next_offset is not None:
    results, next_offset = client.scroll(
        collection_name="documents", offset=next_offset,
        limit=100, with_payload=True, with_vectors=False
    )
```

## Payload Indexing

Create indexes on payload fields to speed up filtered searches.

```python
from qdrant_client.models import PayloadSchemaType

client.create_payload_index("documents", "category", PayloadSchemaType.KEYWORD)
client.create_payload_index("documents", "year", PayloadSchemaType.INTEGER)
client.create_payload_index("documents", "title", PayloadSchemaType.TEXT)
```

## Quantization for Memory Optimization

```python
from qdrant_client.models import (
    ScalarQuantization, ScalarQuantizationConfig, ScalarType,
    BinaryQuantization, BinaryQuantizationConfig
)

# Scalar: float32 to int8 (4x memory reduction)
client.update_collection("documents", quantization_config=ScalarQuantization(
    scalar=ScalarQuantizationConfig(type=ScalarType.INT8, quantile=0.99, always_ram=True)
))

# Binary: 1 bit per dimension (32x compression, works well with OpenAI embeddings)
client.update_collection("documents", quantization_config=BinaryQuantization(
    binary=BinaryQuantizationConfig(always_ram=True)
))
```

## gRPC vs REST

| Feature     | REST (6333)      | gRPC (6334)               |
| ----------- | ---------------- | ------------------------- |
| Ease of use | Simple HTTP/JSON | Requires protobuf client  |
| Performance | Good             | 2-3x faster for bulk ops  |
| Best for    | Development      | High-throughput production |

```python
client = QdrantClient(host="localhost", port=6334, prefer_grpc=True)
```

## Delete and Update Operations

```python
from qdrant_client.models import PointIdsList

# Delete by IDs
client.delete("documents", points_selector=PointIdsList(points=[1, 2, 3]))

# Delete by filter
client.delete("documents", points_selector=Filter(
    must=[FieldCondition(key="category", match=MatchValue(value="deprecated"))]))

# Update payload (merge)
client.set_payload("documents", payload={"updated": True, "version": 2}, points=[1, 2])

# Overwrite entire payload
client.overwrite_payload("documents", payload={"title": "New Title"}, points=[1])

# Delete payload keys
client.delete_payload("documents", keys=["deprecated_field"], points=[1, 2, 3])
```

## Snapshots and Backups

```python
snapshot_info = client.create_snapshot(collection_name="documents")
snapshots = client.list_snapshots(collection_name="documents")
full_snapshot = client.create_full_snapshot()
```

## Anti-Patterns

- **Not creating payload indexes**: Without indexes, filtered searches scan all payloads linearly. Index fields you filter on frequently.
- **Using REST for high-throughput batch operations**: Switch to gRPC for 2-3x throughput improvement.
- **Skipping quantization for large datasets**: At millions of vectors, memory becomes the bottleneck. Scalar quantization provides 4x compression with minimal recall loss.
- **Not setting `score_threshold`**: Without a threshold, searches always return `limit` results even if irrelevant.
- **Storing large payloads**: Payload is loaded into memory for filtering. Keep payloads small; store large data externally.

## Production Checklist

- [ ] API key configured (`QDRANT__SERVICE__API_KEY` environment variable)
- [ ] gRPC enabled for high-throughput workloads (`prefer_grpc=True`)
- [ ] Payload indexes created for frequently filtered fields
- [ ] Quantization configured for large collections
- [ ] Docker volume mounted for persistent storage
- [ ] Snapshot schedule configured for backups
- [ ] Score threshold set in search queries
- [ ] Collection distance metric matches embedding model output
- [ ] Monitoring configured (Prometheus metrics at `/metrics`)
- [ ] Resource limits set in Docker/Kubernetes
- [ ] TLS enabled for production deployments
