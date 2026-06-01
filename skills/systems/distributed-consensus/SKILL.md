---
name: distributed-consensus
description: |
  Distributed-systems architecture at the protocol level: consensus (Raft, Paxos,
  BFT), replication and quorums, consistency models, clock synchronization, and
  the CAP/PACELC trade-offs. Architect-level — how to make state agree and survive
  failures.

  USE WHEN: designing replicated/consensus systems, "Raft", "Paxos", "BFT",
  "quorum", "leader election", "consistency model", "linearizability", "CAP",
  "PACELC", "split-brain", replication topology, distributed state machines.

  DO NOT USE FOR: app microservice wiring (use web/enterprise patterns); message
  queues (use messaging skills); blockchain specifics (use bitcoin skills).
allowed-tools: Read, Grep, Glob
---
# Distributed Consensus & Replication

## Consensus protocol selection

| Protocol | Fault model | Notes |
|---|---|---|
| **Raft** | Crash-fault (f of 2f+1) | Understandable, leader-based; default for etcd/Consul |
| **(Multi-)Paxos** | Crash-fault | Foundational, subtle; powers Spanner/Chubby lineage |
| **BFT (PBFT, Tendermint)** | Byzantine (f of 3f+1) | For untrusted/adversarial nodes; higher msg cost |
| **Viewstamped Replication** | Crash-fault | Raft-like, predates it |

Use crash-fault consensus inside a trust boundary; use **BFT only** when nodes
can be malicious (cross-org, blockchain) — it costs more nodes and messages.

## Replication & quorums

- **Quorum**: W + R > N for read-your-writes; tune (e.g. N=3, W=2, R=2).
- **Leader-based** (strong, simple, leader bottleneck) vs **leaderless**
  (Dynamo-style, available, needs read-repair/anti-entropy + conflict handling).
- **Sync vs async replication** = durability/latency vs RPO on failover.

## Consistency models (state the one you need)

Linearizable → sequential → causal → eventual. Stronger = more coordination =
higher latency / lower availability. Don't ask for linearizable if causal suffices.

## CAP / PACELC

Under a **P**artition choose **C** or **A**; *else* (no partition) trade **L**atency
vs **C**onsistency. Real systems are points on a spectrum (Spanner: CP + TrueTime
clocks; Dynamo: AP). **Clocks**: avoid relying on wall-clock ordering; use logical
/ hybrid logical clocks, or bounded-uncertainty clocks (TrueTime) for external
consistency.

## When to recommend what
- Config/coordination, small cluster → Raft (etcd).
- Global strong consistency → Paxos/Spanner-style + synchronized clocks.
- High availability, geo, conflict-tolerant → leaderless Dynamo-style + CRDTs.
- Adversarial/multi-party → BFT.
