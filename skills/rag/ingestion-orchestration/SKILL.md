---
name: ingestion-orchestration
description: |
  Production ingestion pipelines with Airflow, Prefect 3, Dagster. DAG design for
  RAG: extract -> parse -> chunk -> embed -> index. Retry policies, idempotency,
  partial failure, monitoring, backfills, incremental vs full refresh, data
  lineage, upstream dependencies. Full Dagster and Prefect examples.

  USE WHEN: user mentions "ingestion pipeline", "Airflow RAG", "Prefect RAG",
  "Dagster RAG", "DAG for embeddings", "backfill embeddings", "incremental
  ingestion", "idempotent ingestion"

  DO NOT USE FOR: real-time streaming ingestion - use `cdc-streaming-ingestion`;
  chunking details - use `chunking-strategies`;
  eval - use `rag-evaluation`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Ingestion Orchestration

## Pipeline Stages

```
[Source] -> [Extract] -> [Parse] -> [Chunk] -> [Contextualize?] -> [Embed] -> [Upsert] -> [Validate]
                                                   |                             |
                                                   +-- side: lineage + metrics --+
```

Every stage must be:
- **Idempotent** — rerunning on the same input produces the same output.
- **Retriable** — transient failures recovered automatically.
- **Observable** — counts, durations, error rates per stage.
- **Partitioned** — a failing partition does not block the others.

## Idempotency via Content Hash

```python
import hashlib

def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()

def needs_processing(chunk_id: str, new_hash: str, state_store) -> bool:
    existing = state_store.get(chunk_id)
    return existing != new_hash
```

Store `(chunk_id, content_hash, last_indexed_at)` in a durable state table. Skip stages when the hash is unchanged.

## Prefect 3 Example

Prefect 3's task runner handles retries, concurrency, and observability natively.

```python
from prefect import flow, task, get_run_logger
from prefect.tasks import task_input_hash
from datetime import timedelta
from prefect.concurrency.sync import concurrency

@task(retries=3, retry_delay_seconds=[10, 30, 120],
      cache_key_fn=task_input_hash, cache_expiration=timedelta(hours=24))
def extract(source_id: str) -> list[dict]:
    log = get_run_logger()
    raw = source_client.fetch(source_id)
    log.info(f"Extracted {len(raw)} docs from {source_id}")
    return raw

@task(retries=2)
def parse(raw: list[dict]) -> list[dict]:
    return [{"id": d["id"], "text": parser.clean(d["text"])} for d in raw]

@task(retries=2)
def chunk(parsed: list[dict]) -> list[dict]:
    chunks = []
    for doc in parsed:
        for i, c in enumerate(splitter.split_text(doc["text"])):
            chunks.append({"doc_id": doc["id"], "chunk_id": f"{doc['id']}::{i}",
                           "text": c, "hash": content_hash(c)})
    return chunks

@task(retries=3, retry_delay_seconds=30)
def embed(chunks: list[dict]) -> list[dict]:
    with concurrency("embedding_api", occupy=1):
        vectors = embedder.embed([c["text"] for c in chunks])
    for c, v in zip(chunks, vectors):
        c["vector"] = v
    return chunks

@task(retries=3)
def upsert(chunks: list[dict]) -> int:
    to_write = [c for c in chunks if needs_processing(c["chunk_id"], c["hash"], state)]
    vstore.upsert(to_write)
    for c in to_write:
        state.put(c["chunk_id"], c["hash"])
    return len(to_write)

@task
def validate(expected_min: int, actual: int):
    if actual < expected_min:
        raise ValueError(f"Upserted {actual} < expected {expected_min}; halting")

@flow(name="rag-ingest", log_prints=True)
def rag_ingest(source_id: str):
    raw = extract(source_id)
    parsed = parse(raw)
    chunks = chunk(parsed)
    embedded = embed(chunks)
    count = upsert(embedded)
    validate(expected_min=1, actual=count)
    return count

if __name__ == "__main__":
    rag_ingest.deploy(
        name="rag-ingest-prod",
        work_pool_name="k8s-pool",
        schedule={"cron": "0 */2 * * *", "timezone": "UTC"},
        parameters={"source_id": "kb_main"},
    )
```

- `cache_key_fn=task_input_hash` skips stages when inputs are unchanged.
- `concurrency("embedding_api")` enforces provider rate limits.
- Deployment schedule runs every 2 hours.

## Dagster Example (asset-first, good for RAG)

Dagster models each output as a materialized asset with lineage — great fit for embedding pipelines.

```python
from dagster import (
    asset, AssetIn, AssetExecutionContext, Definitions, Output,
    DailyPartitionsDefinition, RetryPolicy, MetadataValue,
)
from datetime import datetime

daily = DailyPartitionsDefinition(start_date="2025-01-01")

@asset(partitions_def=daily, retry_policy=RetryPolicy(max_retries=3, delay=30))
def raw_docs(context: AssetExecutionContext) -> list[dict]:
    partition_date = context.partition_key
    return source_client.fetch_since(partition_date)

@asset(ins={"raw_docs": AssetIn("raw_docs")})
def parsed_docs(raw_docs: list[dict]) -> list[dict]:
    return [parser.clean(d) for d in raw_docs]

@asset(ins={"parsed_docs": AssetIn("parsed_docs")})
def chunks(parsed_docs: list[dict]) -> list[dict]:
    return [c for d in parsed_docs for c in chunk_document(d)]

@asset(retry_policy=RetryPolicy(max_retries=3))
def embeddings(context: AssetExecutionContext, chunks: list[dict]) -> list[dict]:
    to_embed = [c for c in chunks if state.get(c["chunk_id"]) != c["hash"]]
    context.add_output_metadata({
        "num_new": MetadataValue.int(len(to_embed)),
        "num_skipped": MetadataValue.int(len(chunks) - len(to_embed)),
    })
    if not to_embed: return []
    vectors = embedder.embed([c["text"] for c in to_embed])
    for c, v in zip(to_embed, vectors): c["vector"] = v
    return to_embed

@asset
def vector_index(embeddings: list[dict]) -> int:
    if not embeddings: return 0
    vstore.upsert(embeddings)
    for c in embeddings: state.put(c["chunk_id"], c["hash"])
    return len(embeddings)

defs = Definitions(
    assets=[raw_docs, parsed_docs, chunks, embeddings, vector_index],
)
```

Lineage for free: `raw_docs -> parsed_docs -> chunks -> embeddings -> vector_index` is visible in the Dagster UI. Partition-level retries, backfills, and freshness policies come built-in.

## Airflow Example (for shops already on Airflow)

```python
from airflow.decorators import dag, task
from datetime import datetime, timedelta

default_args = {"retries": 3, "retry_delay": timedelta(minutes=5)}

@dag(schedule="0 */2 * * *", start_date=datetime(2025, 1, 1),
     catchup=False, default_args=default_args, max_active_runs=1)
def rag_ingest():

    @task
    def extract(): ...
    @task(pool="embedding_api", pool_slots=1)
    def embed(chunks): ...
    @task
    def upsert(embedded): ...

    upsert(embed(chunk(parse(extract()))))

rag_ingest()
```

Airflow's `pool` construct throttles concurrent calls — use it for external embedding API limits.

## Partial Failure Handling

Never fail a 1000-doc batch because one doc is malformed. Route failures to a dead letter table.

```python
@task
def chunk_safely(parsed: list[dict]) -> tuple[list[dict], list[dict]]:
    ok, failed = [], []
    for doc in parsed:
        try:
            ok.extend(chunk_document(doc))
        except Exception as e:
            failed.append({"doc_id": doc["id"], "error": str(e), "ts": datetime.utcnow()})
    dead_letter.insert_many(failed)
    return ok, failed
```

Monitor the dead letter queue. Alert when it grows beyond a threshold (e.g., > 1% of processed docs / hour).

## Backfills

Backfill = re-process a historical range, typically after a parser bug fix or schema change.

### Dagster backfill

```bash
dagster asset backfill --select embeddings --from 2025-01-01 --to 2025-03-01
```

### Prefect backfill

```python
from prefect.deployments import run_deployment
from datetime import date, timedelta

def backfill(start: date, end: date, deployment: str):
    d = start
    while d <= end:
        run_deployment(deployment, parameters={"since": d.isoformat()})
        d += timedelta(days=1)
```

Key rule: backfills must be idempotent and must respect rate limits. Tag backfill runs so you can exclude them from regular alerting.

## Incremental vs Full Refresh

| Mode | When | Cost | Risk |
|---|---|---|---|
| Incremental (diff by watermark) | Regular cadence | Low | Watermark drift if upstream late |
| Full refresh | Schema change, parser fix | High | Long runtime; index disruption |
| Blue-green full refresh | Production full refresh | High | Minimal risk; takes 2x storage |

Blue-green pattern: build a new collection `kb_v_2025_04_15`, validate, flip an alias atomically:

```python
client.update_collection_aliases([
    {"create_alias": {"collection_name": "kb_v_2025_04_15", "alias_name": "kb_current"}},
    {"delete_alias": {"alias_name": "kb_current_previous"}},
])
```

## Data Lineage

Track source -> chunk -> embedding -> query retrieval. At minimum, store in each chunk's metadata:

```python
{
    "source_uri": "s3://bucket/path/doc.pdf",
    "source_etag": "abc123",
    "pipeline_run_id": "prefect-run-5f8a",
    "embedding_model": "text-embedding-3-small@20250401",
    "chunker_version": "v3.2",
    "ingested_at": "2025-04-15T14:30:00Z",
}
```

This lets you invalidate chunks tied to a bad pipeline run, outdated embedding model, or broken chunker version.

## Monitoring / Metrics

Per run:
- Docs fetched, parsed, chunked, embedded, upserted.
- Dead-letter count per stage.
- API latency P50/P95/P99 for embedding and upsert.
- Cost: tokens embedded * price; USD total.
- Freshness lag: `now - max(updated_at in index)`.

Alert on:
- Freshness lag > 2x expected interval.
- Dead-letter rate > 1%.
- Run duration > 2x historical P95.
- Cost anomaly > 3 sigma from baseline.

## Dependency on Upstream Sources

If your RAG depends on a source DB, detect schema changes before they break ingestion.

```python
@task
def verify_source_schema():
    expected = {"id": "int", "title": "str", "body": "str", "updated_at": "timestamp"}
    actual = source_client.describe_schema()
    missing = {k: v for k, v in expected.items() if actual.get(k) != v}
    if missing:
        raise ValueError(f"Schema drift: {missing}")
```

Run as the first step of every pipeline.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Re-embedding unchanged content | Content hash gate |
| One giant task "do everything" | Split by stage; fine-grained retries |
| No rate-limit on embedding provider | Pool / concurrency primitive |
| Failing whole batch on one bad doc | Dead-letter queue |
| In-place collection updates during full refresh | Blue-green with alias swap |
| Schedule in UTC confused with local | UTC everywhere |
| Backfills without the same idempotency | Same flow, same hash gate |
| No observability on cost | Embedding tokens * price per run |
| Missing lineage metadata | Store pipeline_run_id, model_version in every chunk |
| Unbounded parallelism | Respect API limits; use `pool` / `concurrency` |

## Production Checklist

- [ ] Orchestrator chosen (Dagster for asset-first, Prefect for flow-first, Airflow for existing shops)
- [ ] Schedule defined (cron or interval)
- [ ] Content-hash state store (Postgres, DynamoDB)
- [ ] Per-stage retry policy with backoff
- [ ] Dead-letter queue for malformed inputs
- [ ] Rate-limit pool for embedding API
- [ ] Lineage metadata stamped on every chunk
- [ ] Blue-green deploy pattern for full refreshes
- [ ] Source schema verification as first step
- [ ] Cost per run tracked
- [ ] Freshness lag alert configured
- [ ] Runbook for common failure modes (API down, schema drift, dead-letter spike)
- [ ] Backfill procedure documented and tested
