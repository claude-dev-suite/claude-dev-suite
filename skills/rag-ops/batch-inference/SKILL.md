---
name: batch-inference
description: |
  Batch RAG for high-volume ingest and bulk query scenarios. Covers OpenAI
  Batch API (50% discount, 24h SLA), Anthropic Message Batches API, Voyage
  AI and Cohere batch embeddings, ingestion-time vs query-time batching,
  async/Ray parallelism, parallel writes to vector DBs, and rate-limit
  coordination across workers.

  USE WHEN: user mentions "batch API", "OpenAI batch", "Anthropic batches",
  "bulk embedding", "Ray embeddings", "parallel ingest", "batch RAG"

  DO NOT USE FOR: streaming single-query latency - use `rag-production`;
  cost-dashboards - use `cost-allocation`;
  LLM gateway routing - use `llm-gateway`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Batch Inference for RAG

Batch APIs cut cost 50% and unlock much higher throughput than the real-time path. Use them wherever a 24-hour SLA is acceptable: initial ingest, re-embed after model swap, bulk metadata extraction, nightly eval runs, large-scale query replay.

## When to Batch vs Stream

| Workload | Batch? |
|---|---|
| Initial corpus embedding (millions of chunks) | Yes |
| Re-embed after model swap | Yes |
| Nightly eval run on golden set | Yes |
| Extracting entities/summaries/keywords during ingest | Yes |
| User-facing chat query | No |
| Real-time retrieval embedding (single query) | No |
| Sub-100 ms reranker call | No |

## OpenAI Batch API (50% Discount, 24h SLA)

Works for `/v1/chat/completions`, `/v1/embeddings`, `/v1/completions`. Input is a JSONL file where each line is a self-contained request.

```python
from openai import OpenAI
import json, pathlib

client = OpenAI()

# 1. Prepare JSONL
requests = [
    {
        "custom_id": f"chunk-{i}",
        "method": "POST",
        "url": "/v1/embeddings",
        "body": {"model": "text-embedding-3-small", "input": chunk, "dimensions": 512},
    }
    for i, chunk in enumerate(chunks)
]
pathlib.Path("batch.jsonl").write_text("\n".join(json.dumps(r) for r in requests))

# 2. Upload file
fobj = client.files.create(file=open("batch.jsonl", "rb"), purpose="batch")

# 3. Create batch job
batch = client.batches.create(
    input_file_id=fobj.id,
    endpoint="/v1/embeddings",
    completion_window="24h",
    metadata={"project": "kb_v2_embed"},
)
print(batch.id, batch.status)
```

Poll:

```python
while batch.status in {"validating", "in_progress", "finalizing"}:
    time.sleep(60)
    batch = client.batches.retrieve(batch.id)
print(batch.status, batch.request_counts)
```

Download + parse:

```python
out = client.files.content(batch.output_file_id).text
for line in out.splitlines():
    row = json.loads(line)
    vec = row["response"]["body"]["data"][0]["embedding"]
    upsert(row["custom_id"], vec)
```

**Limits**: max 50k requests per batch, max 200 MB per file, max 50 queued batches per account. Split big jobs into chunks and upload in parallel.

## Anthropic Message Batches API (50% Discount, 24h SLA)

```python
import anthropic
client = anthropic.Anthropic()

requests = [
    {
        "custom_id": f"summarize-{i}",
        "params": {
            "model": "claude-sonnet-4-5",
            "max_tokens": 512,
            "messages": [{"role": "user", "content": f"Summarize:\n{doc}"}],
        },
    }
    for i, doc in enumerate(docs)
]

batch = client.messages.batches.create(requests=requests)
print(batch.id, batch.processing_status)

# Poll
while batch.processing_status in {"in_progress"}:
    time.sleep(60)
    batch = client.messages.batches.retrieve(batch.id)

for result in client.messages.batches.results(batch.id):
    if result.result.type == "succeeded":
        text = result.result.message.content[0].text
        store(result.custom_id, text)
```

Limits: 100k requests per batch, 256 MB file size. Works with prompt caching — cache prefixes still apply for 50% stacking with batch's 50%, effectively 75% off the prefix tokens.

## Voyage AI Batch Embeddings

Voyage supports batched calls in real-time (no separate batch endpoint), but the per-call batch size is high (128 inputs):

```python
import voyageai
vo = voyageai.Client()

def embed_batch(texts, model="voyage-3"):
    # 128-input batches optimal on API
    out = []
    for i in range(0, len(texts), 128):
        r = vo.embed(texts[i:i+128], model=model, input_type="document")
        out.extend(r.embeddings)
    return out
```

## Cohere Embed Jobs (Async Bulk)

```python
import cohere
co = cohere.ClientV2()

job = co.embed_jobs.create(
    dataset_id="my-dataset-id",
    model="embed-v4.0",
    input_type="search_document",
)
# Poll status, then download dataset with vectors attached
```

Good for datasets already in Cohere's dataset store; less useful if you're not in that ecosystem.

## Query-Time vs Ingest-Time

- **Ingest-time batch**: huge wins. You have all inputs up front; 50% discount + parallelism; eventual consistency fine.
- **Query-time batch**: only viable if you micro-batch multiple near-simultaneous user queries (50–200 ms window). Usually not worth the complexity for chat UX.

## Parallel Embedding with asyncio

Real-time path where you want pipeline parallelism without hitting a batch API:

```python
import asyncio
from openai import AsyncOpenAI

client = AsyncOpenAI()
sem = asyncio.Semaphore(16)       # cap concurrent API calls

async def embed_one(batch):
    async with sem:
        r = await client.embeddings.create(model="text-embedding-3-small", input=batch)
        return [d.embedding for d in r.data]

async def embed_all(chunks, batch_size=64):
    tasks = [embed_one(chunks[i:i+batch_size]) for i in range(0, len(chunks), batch_size)]
    return [v for sub in await asyncio.gather(*tasks) for v in sub]

vecs = asyncio.run(embed_all(all_chunks))
```

## Ray / Dask for CPU- or Local-Model Embeddings

```python
import ray
ray.init()

@ray.remote(num_gpus=0.25)
class Embedder:
    def __init__(self):
        from sentence_transformers import SentenceTransformer
        self.m = SentenceTransformer("BAAI/bge-large-en-v1.5").half().cuda()
    def embed(self, batch):
        return self.m.encode(batch, batch_size=64, normalize_embeddings=True).tolist()

workers = [Embedder.remote() for _ in range(4)]
futures = [workers[i % 4].embed.remote(batch) for i, batch in enumerate(batches)]
all_vecs = [v for sub in ray.get(futures) for v in sub]
```

Ray is great for: hundreds of millions of chunks, self-hosted embedders, spot instance clusters. Each worker can shard by `hash(doc_id) % N`.

## Parallel Writes to Vector DBs

Vector DBs all support batch upsert — always use it:

```python
# Pinecone
index.upsert(vectors=[(id, vec, meta) for id, vec, meta in batch], batch_size=100)

# Qdrant
from qdrant_client.models import PointStruct
client.upsert(collection_name="kb",
              points=[PointStruct(id=i, vector=v, payload=m) for i, v, m in batch])

# Weaviate v4
with client.batch.dynamic() as b:
    for i, v, m in batch:
        b.add_object(collection="Chunk", properties=m, uuid=i, vector=v)
```

Throttle concurrent writers to avoid storage-engine contention; usually 4–8 parallel writer tasks saturate most managed services.

## Rate-Limit Coordination Across Workers

Distributed embedding hitting one API key needs a shared rate-limit budget. Options:

```python
# Redis-based token bucket
import redis, time
r = redis.Redis()

def take(tokens, key="openai_tpm", capacity=1_000_000, refill_per_sec=1_000_000/60):
    now = time.time()
    with r.pipeline() as p:
        p.hmget(key, "tokens", "ts"); p.execute()
    # ... standard token-bucket refill math, HSET back atomically
```

Simpler: give each worker a slice of the limit. With 1M TPM and 10 workers, cap each at 100k TPM and run independently.

## Error Handling and DLQ

- Validate JSONL before upload (OpenAI rejects the whole file on a single bad line — parse with `json.loads` in a loop first).
- Retry the entire batch on transient failure; retry per-request on `response.error` in the output.
- Persist a DLQ for requests that still fail after retries; rerun after fixing the input.

```python
for line in out.splitlines():
    row = json.loads(line)
    if row.get("error"):
        dlq.append(row)
    else:
        process(row)
```

## Cost Math

Example: 20M chunks × 500 tokens × `text-embedding-3-small` at $0.02/M tokens.

- Real-time: 10B tokens × $0.02/M = **$200**, plus engineer time on rate-limit headaches.
- Batch: **$100**, queued and done in 24h.

For a re-embed with `-large` at $0.13/M, batch savings are **$650** on the same corpus.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Initial corpus embed via real-time API | Use OpenAI/Anthropic Batch for 50% off |
| No `custom_id` — can't map results back | Always set a stable `custom_id` |
| Single JSONL of 10M requests | Split into ≤50k-request files; parallel upload |
| Per-request vector DB upserts | Batch 100–500 per upsert call |
| Uncoordinated rate limits across workers | Redis token bucket or pre-sliced per-worker caps |
| Retrying whole batch on one failure | Retry only `error` rows from output |
| Forgetting cache invalidation after re-embed | Bump index version + flush semantic cache |

## Production Checklist

- [ ] Batch API used for ingest-time embedding and extraction
- [ ] `custom_id` ties every response back to a chunk row
- [ ] Batch files split by 50k-request cap
- [ ] Parallel upload, parallel result download
- [ ] Retry + DLQ for persistent errors
- [ ] Idempotent upserts keyed by `doc_id + chunk_idx`
- [ ] Shared rate-limit budget across workers (Redis bucket or slicing)
- [ ] Cost checkpoint before triggering multi-million-row batches
- [ ] Manifest records which batch job produced which index version
