---
name: multi-region
description: |
  Multi-region RAG deployments for latency and resilience. Covers
  geo-replicated vector stores (Pinecone multi-region, Qdrant cluster,
  MongoDB Atlas Global, Weaviate), per-region embedding/rerank pools,
  LLM routing to nearest provider region (Anthropic, OpenAI, Bedrock),
  eventual-consistency strategies for index updates, and failover patterns.

  USE WHEN: user mentions "multi-region RAG", "global RAG", "geo replication",
  "RAG failover", "latency routing", "regional LLM endpoint",
  "disaster recovery RAG"

  DO NOT USE FOR: single-region scaling - use `rag-production`;
  LLM gateway vendor routing - use `llm-gateway`;
  CDN caching - use `rag-caching`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Multi-Region RAG

Three drivers for multi-region: (1) **latency** — cut cross-ocean RTT to your users; (2) **sovereignty** — data must stay in EU / US-only / India; (3) **resilience** — survive a full region outage. Each implies different architecture.

## Reference Architecture

```
                 ┌──────────────────── Users (global) ─────────────────────┐
                 │                                                          │
           GeoDNS / Anycast LB (Cloudflare, Route 53 geolocation)
                 │                                                          │
     ┌───────────┼────────────┬────────────────────────┐
     │           │            │                        │
  US-East     EU-West     AP-SE-1
  ┌──────┐   ┌──────┐    ┌──────┐
  │ App  │   │ App  │    │ App  │   stateless RAG orchestrator
  └──┬───┘   └──┬───┘    └──┬───┘
     │          │           │
  Embed/Rerank Embed/Rerank Embed/Rerank    (regional GPU pools)
     │          │           │
  Vector DB  Vector DB   Vector DB          (geo-replicated or sharded)
     │          │           │
  LLM (us-east1) LLM (eu1)  LLM (ap-south1) (regional provider endpoints)
```

Control plane (auth, tenant config, billing) can stay single-region behind the gateway; replicate only the read paths.

## Geo-Replicated Vector Stores

### Pinecone

- **Serverless**: single-region per index today; you create one index per region and replicate from the writer region.
- **Pods**: multi-AZ in-region; multi-region is still an app-layer concern.

Pattern:

```python
from pinecone import Pinecone
pcs = {
    "us": Pinecone(api_key=US_KEY).Index("kb-us-east-1"),
    "eu": Pinecone(api_key=EU_KEY).Index("kb-eu-west-1"),
    "ap": Pinecone(api_key=AP_KEY).Index("kb-ap-se-1"),
}

def query_nearest(region, vector, k=5):
    return pcs[region].query(vector=vector, top_k=k, include_metadata=True)
```

### Qdrant Cloud (Cluster)

Qdrant supports multi-node clustering with replication factor per collection:

```python
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance

qc = QdrantClient(url="https://your-cluster.qdrant.cloud", api_key=KEY)
qc.create_collection(
    collection_name="kb",
    vectors_config=VectorParams(size=1024, distance=Distance.COSINE),
    replication_factor=3,
    write_consistency_factor=2,
    shard_number=12,
)
```

For true geo, run one cluster per region and replicate at the ingest layer (dual-write from Kafka).

### MongoDB Atlas Global Clusters

Atlas supports native zoned sharding (by `tenant_region` shard key). Atlas Vector Search lives on the same cluster, so vector ops inherit the zoning:

- Tenants in zone `EU` have their shards pinned to EU regions.
- A vector query from an EU app hits EU shards only.

### Weaviate Cluster

Multi-node with replication; cross-region typically means a cluster per region plus app-layer routing. Enterprise Weaviate has read-replica configurations.

### Elastic / OpenSearch

Cross-Cluster Replication (CCR) propagates indices from a leader cluster in the writer region to follower clusters in reader regions. Vector fields replicate like any other field.

## Per-Region Embedding and Rerank

Embeddings are stateless; deploy TEI/Triton per region and pin routing:

- Each app pod calls the same-region embedder (`http://tei.svc.cluster.local`).
- Cross-region embedder calls **only** during disaster failover.

Pre-warm each regional pool with a warmup request on pod start; cold start hurts the first query after region spin-up.

## Embedding Cache per Region

Regional cache, not global — cross-region cache hits don't save latency.

```python
# Redis per region; keyed by sha256(text) -> vector
async def embed_cached(text: str, region: str) -> list[float]:
    key = f"emb:{region}:{sha256(text)}"
    if (v := await redis[region].get(key)) is not None:
        return orjson.loads(v)
    v = await embed_via_tei(text, region)
    await redis[region].setex(key, 86400, orjson.dumps(v))
    return v
```

Common query embeddings get cache-hit rates of 30–60% in chat workloads.

## LLM Routing by Latency and Residency

| Provider | Regional endpoints |
|---|---|
| Anthropic (direct API) | us-east, eu-west (beta), expanding |
| AWS Bedrock (Claude) | Many: us-east-1, us-west-2, eu-central-1, ap-northeast-1, ap-southeast-1 |
| GCP Vertex (Claude, Gemini) | All major regions |
| OpenAI (direct) | Global anycast + data residency add-on for EU/KR/JP |
| Azure OpenAI | Many regions; residency per deployment |

Route in the gateway:

```python
REGION_TO_BEDROCK = {
    "us": "us-east-1",
    "eu": "eu-central-1",
    "ap": "ap-southeast-1",
}

def llm_for(region):
    import boto3
    return boto3.client("bedrock-runtime", region_name=REGION_TO_BEDROCK[region])
```

Sovereignty: set the region **by tenant**, not by user IP. A US-resident admin for an EU tenant must still hit EU infra.

## Eventual Consistency for Index Updates

Cross-region replication lag is the dominant source of stale answers.

Patterns:

1. **Single writer region, N readers**: writer replicates via CDC / CCR / app-layer dual-write. Lag: typically 1–30 s.
2. **Read-your-own-writes**: after an ingest call, return a token; client pins subsequent reads to the writer region until a TTL expires.
3. **Version stamps on index**: tag each replica with `manifest_version`; clients requesting freshness check the stamp and fall back to writer region if stale.

```python
# Dual-write example, async
async def ingest(doc):
    vec = await embed(doc.text)
    await asyncio.gather(
        upsert("us", doc.id, vec, doc.meta),
        upsert("eu", doc.id, vec, doc.meta),
        upsert("ap", doc.id, vec, doc.meta),
    )
```

Gather with `return_exceptions=True` and log failures to a DLQ for reconciliation; full symmetry in <5 minutes is the target.

## Failover Patterns

- **Active-Active** (preferred): all regions serve reads; a region outage removes it from the GeoDNS pool. Embedding/LLM traffic shifts to the next-nearest region. Writes continue to the surviving regions and reconcile when the outaged region returns.
- **Active-Passive**: one region is the sole writer; standby region replicated but cold. Failover requires a runbook (flip writer, repoint DNS, invalidate caches).
- **Hot-Warm**: standby can serve reads but not writes without manual promotion. Cheap middle ground.

Synthetic failover drills: quarterly, with DR tests on a staging stack mirroring prod.

## Health-Check and Routing Logic

```
  Cloudflare / Route 53 health checks
       → each region exposes /healthz
       → on N consecutive failures, withdraw from GeoDNS pool
       → TTL low (30s) to allow fast shed
```

Client SDK should also round-robin across region endpoints with automatic retry on 5xx or timeout > SLO.

## Data Residency (GDPR, India, etc.)

Tag every document with `residency_region` at ingest time. Index only into the matching region's vector DB. Queries embed tenant metadata; the gateway short-circuits any cross-region read.

```python
if tenant.residency == "EU":
    result = pcs["eu"].query(...)
elif tenant.residency == "US":
    result = pcs["us"].query(...)
```

Never write a residency-tagged doc to a non-matching region even transiently.

## Cost Considerations

- Per-region GPU pools + vector DBs + LLM endpoints: 2–3x infra multiplier.
- Mitigate by sizing non-primary regions at 40–60% of primary.
- Egress between regions is measurable: route all inter-region hops through the cloud backbone (VPC peering / PrivateLink) to avoid public-internet egress charges.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Single vector DB in one region serving global users | Replicate per region or use geo-sharded store |
| Cross-region embedding calls on hot path | Keep embedders in-region; failover only |
| Ignoring tenant residency for routing | Residency-driven routing, per-tenant config |
| Global cache that replicates cross-region | Per-region cache; no cross-region fan-out |
| Uncoordinated dual-writes with no reconciliation | DLQ + hourly reconciler to repair divergence |
| Manual DNS failover without drills | Automate with health checks + quarterly DR tests |
| Stale LLM provider region pinning | Track provider's regional availability; update routing map |

## Production Checklist

- [ ] Per-region vector DB, embedder, reranker, LLM endpoint
- [ ] GeoDNS / latency-based routing with health checks
- [ ] Tenant-level residency policy enforced at the gateway
- [ ] Dual-write or CDC replication with DLQ + reconciliation
- [ ] Per-region cache — no cross-region cache fan-out
- [ ] Failover runbook + quarterly DR drill
- [ ] Consistency model documented (eventual, read-your-writes)
- [ ] Inter-region traffic over private backbone, not public egress
- [ ] Cost dashboards segmented by region
