---
name: cdc-streaming-ingestion
description: |
  Real-time RAG ingestion. CDC (Debezium, Postgres logical replication), Kafka/
  Pulsar topics for doc events, stream processing (Flink, Kafka Streams) to
  embedding service, exactly-once semantics, late-arriving updates, tombstones
  (deletes), upsert to vector DB, schema evolution. Full Debezium + Kafka ->
  vector DB example.

  USE WHEN: user mentions "CDC RAG", "Debezium RAG", "Kafka RAG", "real-time
  embeddings", "streaming ingestion", "Flink embeddings", "Pulsar RAG",
  "logical replication RAG"

  DO NOT USE FOR: batch scheduled ingestion - use `ingestion-orchestration`;
  query-time freshness weighting - use `time-aware-retrieval`;
  evaluation - use `rag-evaluation`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# CDC / Streaming Ingestion

## When to Go Real-Time

Scheduled ingestion (see `ingestion-orchestration`) suffices when freshness tolerance is minutes-to-hours. Switch to streaming when:
- Users expect < 10s from source write to retrievable.
- Source is high-throughput (> 100 writes/sec).
- Deletes must propagate quickly (compliance).
- Downstream consumers beyond RAG also need the stream.

## Architecture

```
[Postgres]  --WAL-->  [Debezium]  -->  [Kafka topic: docs.changes]
                                               |
                                 +-------------+-------------+
                                 |                           |
                           [embed worker]              [other consumers]
                                 |
                           [Vector DB upsert]
                                 |
                         [Kafka topic: docs.indexed]   (offset log for observability)
```

Separation of concerns:
- CDC produces change events.
- Kafka is the durable, replayable event log.
- Stream processor embeds and upserts.
- Vector DB is the sink.

## CDC Source: Postgres + Debezium

Postgres logical replication exposes WAL changes. Debezium Connect consumes it and publishes to Kafka.

### Postgres setup

```sql
ALTER SYSTEM SET wal_level = 'logical';
SELECT pg_reload_conf();

CREATE PUBLICATION rag_pub FOR TABLE documents, articles;

CREATE USER debezium WITH REPLICATION LOGIN PASSWORD '***';
GRANT SELECT ON documents, articles TO debezium;

SELECT pg_create_logical_replication_slot('debezium_rag', 'pgoutput');
```

### Debezium connector config

```json
{
  "name": "postgres-rag",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "pg.internal",
    "database.port": "5432",
    "database.user": "debezium",
    "database.password": "${secret}",
    "database.dbname": "app",
    "plugin.name": "pgoutput",
    "slot.name": "debezium_rag",
    "publication.name": "rag_pub",
    "topic.prefix": "rag",
    "table.include.list": "public.documents,public.articles",
    "tombstones.on.delete": "true",
    "key.converter": "org.apache.kafka.connect.json.JsonConverter",
    "value.converter": "io.confluent.connect.avro.AvroConverter",
    "value.converter.schema.registry.url": "http://schema-registry:8081",
    "heartbeat.interval.ms": "30000",
    "heartbeat.action.query": "INSERT INTO debezium_heartbeat (ts) VALUES (now()) ON CONFLICT DO NOTHING"
  }
}
```

Key points:
- `pgoutput` plugin comes with Postgres 10+; no separate install.
- `tombstones.on.delete=true` sends a null-value record after a delete for log-compacted downstream topics.
- Heartbeats keep the replication slot active on low-traffic tables.
- Avro + schema registry for schema evolution discipline.

Event shape (Debezium `op` codes: `c` create, `u` update, `d` delete, `r` snapshot-read):

```json
{
  "before": { "id": 42, "title": "Old title", ... },
  "after":  { "id": 42, "title": "New title", ... },
  "source": { "lsn": 987654321, "txId": 445, "ts_ms": 1744726800000 },
  "op": "u",
  "ts_ms": 1744726800012
}
```

## Stream Processor: Python + Kafka

For moderate throughput, a Python consumer with `aiokafka` is enough.

```python
import asyncio, json
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from openai import AsyncOpenAI
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import PointStruct

oai = AsyncOpenAI()
qdr = AsyncQdrantClient(url="http://qdrant:6333")

async def process():
    consumer = AIOKafkaConsumer(
        "rag.public.documents",
        bootstrap_servers="kafka:9092",
        group_id="rag-embedder",
        enable_auto_commit=False,           # manual commit after successful upsert
        auto_offset_reset="earliest",
    )
    producer = AIOKafkaProducer(bootstrap_servers="kafka:9092",
                                 enable_idempotence=True, acks="all")
    await consumer.start(); await producer.start()

    try:
        async for msg in consumer:
            if msg.value is None:
                # Tombstone -> delete from vector DB
                doc_id = json.loads(msg.key.decode())["id"]
                await qdr.delete(collection_name="kb",
                                 points_selector={"filter": {"must": [
                                     {"key": "doc_id", "match": {"value": doc_id}}
                                 ]}})
                await consumer.commit(); continue

            evt = json.loads(msg.value.decode())
            op = evt["op"]
            doc = evt["after"] if op in ("c", "u", "r") else evt["before"]
            doc_id = doc["id"]

            if op == "d":
                await qdr.delete(collection_name="kb",
                                 points_selector={"filter": {"must": [
                                     {"key": "doc_id", "match": {"value": doc_id}}
                                 ]}})
            else:
                chunks = chunk_doc(doc)
                texts = [c["text"] for c in chunks]
                emb = await oai.embeddings.create(model="text-embedding-3-small", input=texts)
                points = [
                    PointStruct(
                        id=f"{doc_id}-{i}",
                        vector=emb.data[i].embedding,
                        payload={"doc_id": doc_id, "chunk_index": i,
                                 "text": chunks[i]["text"], "lsn": evt["source"]["lsn"]},
                    )
                    for i in range(len(chunks))
                ]
                # Delete old chunks then upsert new — handles chunk count change
                await qdr.delete(collection_name="kb",
                                 points_selector={"filter": {"must": [
                                     {"key": "doc_id", "match": {"value": doc_id}}
                                 ]}})
                await qdr.upsert(collection_name="kb", points=points)

            await producer.send("rag.indexed", key=msg.key,
                                value=json.dumps({"doc_id": doc_id, "op": op}).encode())
            await consumer.commit()
    finally:
        await consumer.stop(); await producer.stop()

asyncio.run(process())
```

- `enable_auto_commit=False` with manual commit after upsert => at-least-once delivery.
- Delete-then-upsert handles chunk count changes on update.
- Emit to `rag.indexed` topic for observability.

## Exactly-Once Semantics

Kafka exactly-once (EOS) requires transactional writes. The vector DB is usually not transactional with Kafka, so you cannot get true EOS end-to-end. Alternative: make upserts idempotent.

```python
# Use stable point IDs: f"{doc_id}-{chunk_index}"
# Use upsert (not insert) in the vector DB.
# Include LSN in payload; on reprocess, skip if stored LSN >= event LSN.

async def idempotent_upsert(point: PointStruct):
    existing = await qdr.retrieve(collection_name="kb", ids=[point.id], with_payload=True)
    if existing and existing[0].payload.get("lsn", 0) >= point.payload["lsn"]:
        return  # already applied a newer or equal version
    await qdr.upsert(collection_name="kb", points=[point])
```

Result: at-least-once delivery + idempotent sink = effectively exactly-once.

## Late-Arriving Updates

CDC can reorder across partitions. Pin all events of a given document to the same partition (by primary key) so updates arrive in order per document.

Debezium does this by default when `message.key` is the table primary key. Verify:

```bash
kafka-console-consumer --topic rag.public.documents --property print.key=true
# Key: {"id":42} for all events about document 42
```

Cross-document ordering is not guaranteed; it doesn't matter for embedding.

## Tombstones (Deletes)

Debezium produces two messages on delete:
1. The delete event (`op=d`, before populated, after null).
2. A tombstone (null value) for log compaction.

Handle both in the consumer:
- On `op=d`: delete from vector DB.
- On null value (tombstone): also delete (defensive; safe to re-delete).

Filter by `op == "d"` if your vector DB delete is costly:

```python
if evt.get("op") == "d":
    ...  # delete
```

## Flink Streaming (high throughput, stateful)

For > 10k events/sec or stateful joins (enrich from another topic before embedding), use Flink.

```python
# Flink SQL (PyFlink)
from pyflink.table import EnvironmentSettings, TableEnvironment

env = TableEnvironment.create(EnvironmentSettings.in_streaming_mode())

env.execute_sql("""
CREATE TABLE documents (
    id BIGINT,
    title STRING,
    body STRING,
    updated_at TIMESTAMP(3),
    PRIMARY KEY (id) NOT ENFORCED
) WITH (
    'connector' = 'kafka',
    'topic' = 'rag.public.documents',
    'properties.bootstrap.servers' = 'kafka:9092',
    'format' = 'debezium-json',
    'scan.startup.mode' = 'earliest-offset'
)""")

env.execute_sql("""
CREATE TABLE enriched AS
SELECT d.id, d.title, d.body, u.tenant_id, u.role
FROM documents d
LEFT JOIN users FOR SYSTEM_TIME AS OF d.updated_at AS u ON d.author_id = u.id
""")
# Sink to another topic consumed by the embed worker.
```

`debezium-json` format understands the CDC envelope natively. Temporal joins enrich events with slowly changing dimensions.

## Schema Evolution

1. Use Avro with a schema registry (Confluent, Redpanda, Apicurio).
2. Enforce backward-compatible changes: add optional fields only.
3. Track schema version in vector DB metadata.
4. On breaking change, publish to a new topic (`rag.public.documents.v2`) and run both consumers during migration.

```python
# In the upsert payload
payload = {"doc_id": doc_id, "schema_version": "v2", "lsn": lsn, ...}
```

When the embedder version changes (different embedding dimension/model), do a blue-green re-index off the CDC stream — start a new consumer group on earliest, write to a new collection, switch alias.

## Backpressure and Rate Limits

Embedding APIs have rate limits. Surge events can blow them. Options:
1. Batch events before embedding (collect for 1-2s or 64 docs).
2. Use a concurrency semaphore.
3. Configure consumer `max.poll.records` to cap per-poll batch.

```python
import asyncio
semaphore = asyncio.Semaphore(8)

async def embed_batch(batch: list[dict]):
    async with semaphore:
        texts = [b["text"] for b in batch]
        return await oai.embeddings.create(model="text-embedding-3-small", input=texts)
```

## Monitoring

- **Consumer lag**: `kafka.consumer.lag` per topic/partition. Alert > 1000.
- **Replication slot lag**: `pg_replication_slots.confirmed_flush_lsn` vs current WAL.
- **Embedding throughput**: events/sec, rolling P95.
- **Vector DB upsert errors**: by error class.
- **End-to-end latency**: `now() - evt.ts_ms` percentile dashboard.

```sql
-- Postgres: watch replication slot lag
SELECT slot_name, pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn) AS bytes_behind
FROM pg_replication_slots WHERE slot_name = 'debezium_rag';
```

An unconsumed slot holds WAL on disk. Alert above a few GB.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Auto-commit offset before upsert | Data loss on crash; manual commit after success |
| No tombstone handling | Deletes never propagate; stale vectors linger |
| Single partition | No parallelism; repartition by primary key |
| Embedding one event at a time | Batch to amortize API overhead |
| No schema registry | Silent schema drift breaks consumers weeks later |
| Forgetting to drop the replication slot | WAL accumulates forever; disk fills |
| Cross-document ordering dependencies | Key by primary key; do not require global order |
| Same consumer group for test and prod | Test consumes prod; isolate groups |
| Re-embedding on every update regardless of content | Content-hash gate still applies |
| No end-to-end latency SLO | You cannot prove freshness without one |

## Production Checklist

- [ ] Postgres `wal_level=logical`, publication created, replication user configured
- [ ] Debezium connector deployed with heartbeats enabled
- [ ] Schema registry (Avro) in use
- [ ] Tombstones on delete enabled
- [ ] Consumer group with manual offset commit
- [ ] Idempotent upsert with stable point IDs + LSN gate
- [ ] Batching + concurrency semaphore on embedding API
- [ ] Dead-letter topic for poison messages
- [ ] Replication slot lag alert
- [ ] Consumer group lag alert
- [ ] End-to-end latency SLO (e.g., P95 < 10s)
- [ ] Content-hash gate to skip no-op updates
- [ ] Blue-green re-index procedure for embedding model changes
- [ ] Runbook for replication slot recovery (drop + recreate from snapshot)
- [ ] Observability topic (`rag.indexed`) consumed by dashboards
