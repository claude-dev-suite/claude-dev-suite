---
name: storage-engines
description: |
  Storage-engine and database-internals architecture: B-tree vs LSM-tree, write-
  ahead logging, buffer/page cache, MVCC and concurrency control, durability/fsync,
  and compaction. Architect-level engine selection and data-path design.

  USE WHEN: designing or choosing a storage engine, "B-tree vs LSM", "WAL",
  "buffer pool", "MVCC", "compaction", "write amplification", "fsync/durability",
  embedded KV store, database internals, read/write-optimized store choice.

  DO NOT USE FOR: SQL query writing/ORM (use database/orm skills); data pipelines
  (use `data-intensive`); vector indexes (use vector-stores skills).
allowed-tools: Read, Grep, Glob
---
# Storage-Engine Internals

## B-tree vs LSM-tree — the defining choice

| | **B-tree** (InnoDB, Postgres) | **LSM-tree** (RocksDB, Cassandra) |
|---|---|---|
| Writes | In-place; random I/O; write-amp from page writes | Sequential (memtable→SST); high throughput |
| Reads | 1 path, predictable | May touch many levels → read-amp (mitigate w/ bloom filters) |
| Space | Fragmentation | Space-amp until compaction |
| Best for | Read-heavy, range scans, point lookups | Write-heavy ingest, SSD-friendly |

The three amplifications (**write / read / space**) trade off against each other —
state which one the workload can least afford.

## Durability & the write path

- **WAL**: append before applying; `fsync`/`fdatasync` policy = the
  durability ↔ throughput knob (group commit amortizes fsync). `O_DIRECT` vs
  page cache; `fsync` correctness (don't trust it lying — the "fsync-gate").
- **Buffer/page cache**: hit ratio drives everything; eviction (LRU/CLOCK),
  dirty-page writeback, checkpointing to bound recovery time.
- **Crash recovery**: redo/undo, ARIES, checkpoints; recovery time vs steady-state.

## Concurrency control

- **MVCC** (snapshot reads, no read locks) vs 2PL (locking) vs OCC (validate at
  commit). MVCC needs version GC/vacuum (Postgres bloat).
- Isolation levels and their anomalies; SSI for serializable without heavy locks.

## When to recommend what
- Write-heavy ingest / time-series / SSD → LSM (RocksDB/Cassandra/ScyllaDB).
- Read-heavy, rich queries, range scans → B-tree (Postgres/InnoDB).
- Embedded/edge KV → LMDB (B-tree, mmap) or RocksDB (LSM) by read/write mix.
