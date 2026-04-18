---
name: r2r
description: |
  R2R (RAG to Riches) by SciPhi — a production-ready RAG engine with
  built-in hybrid search, automatic knowledge graph construction,
  agentic workflows, multi-tenant support, REST + Python SDK, and
  self-hosted or cloud deployment.

  USE WHEN: user mentions "R2R", "RAG to Riches", "SciPhi", "R2R SDK",
  "R2R knowledge graph", "R2R ingestion pipeline"

  DO NOT USE FOR: DIY retrieval pipelines - use `rag-architecture`;
  Pinecone-specific stacks - use `canopy`;
  lightweight embeddings on edge - use `txtai`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# R2R (RAG to Riches)

R2R is an opinionated, batteries-included RAG service. Instead of stitching together a vector DB, chunker, embedder, KG builder, and agent layer, R2R ships them as one backend with a REST API and Python/TypeScript SDKs. It targets teams that want a working RAG system in hours, not sprints.

## When to Use R2R

- You want hybrid search (vector + full-text) and a knowledge graph "for free".
- You're OK running Postgres + pgvector (the default backend).
- You want multi-tenancy (collections, users, access control) out of the box.
- You want to avoid glue-code between LangChain / LlamaIndex / Neo4j / Qdrant.

Not a fit when: you need fine-grained control of every pipeline step (use LangGraph / LlamaIndex), or you need ultra-low-latency serving (<50 ms) on non-Postgres backends.

## Deployment

### Self-hosted (Docker)

```bash
# Clone and run — pulls Postgres, Hatchet, unstructured, and the R2R API
git clone https://github.com/SciPhi-AI/R2R
cd R2R/docker
docker compose -f compose.full.yaml up -d
```

Key services:
- `r2r` (API, port 7272)
- `postgres` with `pgvector` + `pg_trgm` + `vchord`
- `hatchet` (workflow orchestrator for ingestion)
- `unstructured` (document parser)

### Hosted (SciPhi Cloud)

```bash
pip install r2r
export R2R_API_KEY=...   # from https://app.sciphi.ai
```

## Python Client

```python
from r2r import R2RClient

client = R2RClient("http://localhost:7272")  # or cloud URL
client.users.login(email="admin@example.com", password="change_me_immediately")
```

## Ingestion

The default pipeline: parse → chunk → embed → upsert → extract entities → build KG.

```python
# Single file
client.documents.create(file_path="manual.pdf", metadata={"team": "platform"})

# URL
client.documents.create_from_url(
    url="https://example.com/whitepaper.pdf",
    metadata={"source": "web"},
)

# Raw text
client.documents.create(
    raw_text="# Release Notes\n...",
    metadata={"doc_type": "changelog"},
)

# Bulk
for path in pathlib.Path("./data").glob("*.md"):
    client.documents.create(file_path=str(path))
```

Ingestion runs async via Hatchet. Poll status:

```python
for d in client.documents.list().results:
    print(d.id, d.ingestion_status, d.extraction_status)
```

## Search (Vector + Hybrid + Graph)

```python
resp = client.retrieval.search(
    query="How do we rotate DB credentials?",
    search_settings={
        "use_hybrid_search": True,       # vector + BM25 + trigram
        "use_semantic_search": True,
        "limit": 10,
        "filters": {"team": {"$eq": "platform"}},
    },
)
for r in resp.results.chunk_search_results:
    print(r.score, r.text[:120])
```

Graph search (entities + relationships):

```python
resp = client.retrieval.search(
    query="Who owns the billing service?",
    search_settings={
        "graph_search_settings": {"enabled": True, "limit": 5},
        "limit": 5,
    },
)
print(resp.results.graph_search_results)
```

## RAG (Query with Generation)

```python
resp = client.retrieval.rag(
    query="Summarize our credential rotation policy with citations.",
    rag_generation_config={
        "model": "anthropic/claude-sonnet-4-5",
        "temperature": 0.1,
        "stream": False,
    },
    search_settings={"use_hybrid_search": True, "limit": 8},
)
print(resp.results.completion)
print(resp.results.citations)
```

Streaming:

```python
stream = client.retrieval.rag(query="...", rag_generation_config={"stream": True})
for chunk in stream:
    print(chunk, end="")
```

## Agentic RAG

R2R's agent layer calls the retriever as a tool and supports multi-step reasoning.

```python
resp = client.retrieval.agent(
    message={"role": "user", "content": "Compare Q3 and Q4 incidents by severity."},
    rag_generation_config={"model": "anthropic/claude-opus-4-5"},
    search_settings={"use_hybrid_search": True},
    include_title_if_available=True,
)
for msg in resp.results.messages:
    print(msg.role, msg.content)
```

## Knowledge Graph Construction

R2R auto-extracts entities + relationships into a Postgres-backed graph after ingestion. Trigger explicitly:

```python
client.graphs.create(
    collection_id=coll.id,
    settings={
        "entity_types": ["Person", "Service", "Team", "Incident"],
        "relation_types": ["OWNS", "CAUSED", "ESCALATED_TO"],
    },
)

# Build communities (GraphRAG-style hierarchical summaries)
client.graphs.build_communities(collection_id=coll.id)
```

Query the graph:

```python
entities = client.graphs.list_entities(collection_id=coll.id).results
relationships = client.graphs.list_relationships(collection_id=coll.id).results
communities = client.graphs.list_communities(collection_id=coll.id).results
```

## Multi-Tenancy (Collections + Users)

```python
# Create a tenant collection
coll = client.collections.create(name="acme-corp", description="Acme private docs")

# Invite a user
client.users.register(email="alice@acme.com", password="...", name="Alice")
client.collections.add_user(id=coll.id, user_id=alice.id)

# Restrict ingest/retrieval to that collection
client.documents.create(file_path="acme-runbook.md", collection_ids=[coll.id])
```

Each retrieval call scopes to the user's collections; cross-tenant leaks are prevented at the SQL layer.

## REST API Examples

```bash
# Ingest
curl -X POST http://localhost:7272/v3/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F file=@manual.pdf

# RAG
curl -X POST http://localhost:7272/v3/retrieval/rag \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SLA targets","rag_generation_config":{"model":"anthropic/claude-sonnet-4-5"}}'
```

## Configuration (r2r.toml)

```toml
[app]
default_max_documents_per_user = 1000

[embedding]
provider = "openai"
base_model = "text-embedding-3-small"
base_dimension = 512

[completion]
provider = "litellm"
[completion.generation_config]
model = "anthropic/claude-sonnet-4-5"
temperature = 0.1

[database]
provider = "postgres"
default_collection_name = "default"

[ingestion]
chunk_size = 1024
chunk_overlap = 512
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Running `compose.dev.yaml` in production | Use `compose.full.yaml` + managed Postgres with backups |
| Using the default admin password | Rotate immediately; put behind SSO/reverse proxy |
| Shoving all orgs into one collection | One collection per tenant; enforce at access-control layer |
| Re-ingesting unchanged files | Let R2R dedup by file hash (default); don't re-upload |
| Building graphs on tiny corpora | Graphs add little under ~50 docs; skip until corpus grows |
| Ignoring Hatchet worker lag | Monitor queue depth; scale workers if ingestion backs up |

## Production Checklist

- [ ] Managed Postgres with pgvector + `pg_trgm` + backups
- [ ] Hatchet workers scaled for ingest throughput
- [ ] R2R API behind HTTPS + auth proxy (OIDC/SSO)
- [ ] Per-tenant collections with access control enforced
- [ ] Rotated admin + service credentials in a vault
- [ ] Document ingestion retries + DLQ
- [ ] KG build scheduled off-peak on large collections
- [ ] Observability: OpenTelemetry export to your APM
- [ ] Cost alerting on LiteLLM provider spend
