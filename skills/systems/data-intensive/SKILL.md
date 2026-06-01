---
name: data-intensive
description: |
  Data-intensive / data-platform architecture: warehouse vs lakehouse, OLTP vs
  OLAP, batch vs streaming (lambda/kappa), change-data-capture, and data mesh.
  Architect-level platform-shape decisions, not SQL or ETL code.

  USE WHEN: designing a data platform/pipeline architecture, "data warehouse",
  "lakehouse", "OLAP vs OLTP", "lambda/kappa", "streaming vs batch", "CDC",
  "data mesh", "medallion", analytics platform, columnar store, ingestion topology.

  DO NOT USE FOR: writing SQL/ORM (use database skills); a specific ETL tool
  (use data/data-processing skills); storage-engine internals (use `storage-engines`).
allowed-tools: Read, Grep, Glob
---
# Data-Intensive Architecture

## OLTP vs OLAP — separate the workloads
- **OLTP**: many small row-oriented transactions, low latency, normalized.
- **OLAP**: few large column-oriented scans/aggregations, throughput-oriented.
Don't run heavy analytics on the OLTP store — replicate/ETL/CDC into an
analytics store. Columnar formats (Parquet/ORC) + columnar engines win OLAP.

## Storage architecture choice
| Option | Idea | Fits |
|---|---|---|
| **Warehouse** (Snowflake, BigQuery, Redshift) | Managed columnar SQL store | Structured BI, governance, SQL-first |
| **Data lake** (object storage + files) | Cheap, schema-on-read, any format | Raw/varied data, ML feature sources |
| **Lakehouse** (Delta/Iceberg/Hudi on object storage) | Lake economics + ACID tables + time travel | Unified BI + ML, open formats, avoids lock-in |

Lakehouse (open table formats) is the common 2026 default when you want one
copy of data serving both BI and ML without warehouse lock-in.

## Batch vs streaming topology
- **Batch**: periodic, simple, high-latency. **Streaming** (Kafka/Flink):
  continuous, low-latency, more complex (exactly-once, watermarks, state).
- **Lambda**: batch layer (accurate) + speed layer (fresh) merged — two
  codebases, complexity. **Kappa**: stream-only, reprocess from the log —
  simpler; prefer it unless you truly need a separate batch layer.
- **CDC** (Debezium): stream row changes out of OLTP without dual-writes — the
  clean way to feed lake/warehouse/search in near-real-time.

## Modeling & ownership
- **Medallion** (bronze/silver/gold) layering for lake/lakehouse refinement.
- **Data mesh**: domain-owned data products + federated governance —
  organizational, for large orgs; overkill for small teams (start centralized).

## When to recommend what
- BI on structured data, SQL team → warehouse (or lakehouse w/ SQL engine).
- Mixed BI + ML, open formats, scale → lakehouse (Iceberg/Delta) + Kappa + CDC.
- Real-time decisions → streaming (Kafka + Flink), exactly-once where it matters.
- Don't reach for data mesh until org scale forces decentralization.
