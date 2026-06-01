---
name: hardware-aware-design
description: |
  Hardware-aware architecture for high performance: memory hierarchy & cache
  behavior, NUMA, SIMD/vectorization, mechanical sympathy, false sharing, and
  lock-free vs locked concurrency. Architect-level guidance on designing software
  that matches the machine.

  USE WHEN: latency/throughput-critical design, "cache miss", "NUMA", "SIMD",
  "false sharing", "memory bandwidth", "mechanical sympathy", "lock-free",
  "cache line", data-oriented design, hot-path performance architecture.

  DO NOT USE FOR: app-level profiling tasks (use the performance agent/skills);
  GPU/AI accelerator selection (use `ai-systems` hardware skill); networking
  (use `systems-networking`).
allowed-tools: Read, Grep, Glob
---
# Hardware-Aware Design (Mechanical Sympathy)

When a design is bound by the machine, architecture must respect it.

## The memory hierarchy is the dominant cost

Rough latencies: L1 ~1ns, L2 ~4ns, L3 ~15ns, **DRAM ~100ns**, NVMe ~50–100µs,
network/disk far worse. A cache miss to DRAM is ~100× an L1 hit → **layout and
access patterns often matter more than algorithmic constants** on hot paths.

- **Cache lines (64B)**: pack hot fields together; avoid pointer-chasing
  (linked lists/trees thrash the cache) — prefer contiguous arrays.
- **False sharing**: two cores writing different vars on the same line ping-pong
  the line → pad/align per-core data to a cache line.
- **Data-oriented design / SoA vs AoS**: struct-of-arrays enables streaming +
  SIMD and better cache use than array-of-structs for bulk processing.
- **Prefetch & predictability**: sequential, predictable access lets HW prefetch
  and branch predictors win; random access defeats them.

## Parallelism levers

- **SIMD/vectorization** (SSE/AVX/NEON, SVE): data-parallel hot loops; needs
  aligned, contiguous, branch-light data.
- **NUMA**: pin memory near the core that uses it; cross-socket access is far
  slower — partition data per node, avoid a global shared structure.
- **Concurrency**: lock-free/wait-free (CAS, RCU) avoids contention but is hard
  and ABA-prone; often a well-placed lock or sharded/per-core state beats clever
  lock-free. Cache-coherence traffic (MESI) is the hidden cost of shared writes.

## When to invoke this
- µs-scale latency budgets, high-throughput data processing, DB/engine internals,
  trading, media/codec, simulation. **Not** for typical CRUD/web services — there,
  I/O and architecture-level concerns dominate, not cache lines.

## Process
Identify the bottleneck resource (CPU/mem-bandwidth/latency) first, then choose
the matching technique. Measure; don't micro-optimize on intuition.
