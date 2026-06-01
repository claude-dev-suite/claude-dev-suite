---
name: embedded-rtos
description: |
  Embedded, firmware, and real-time systems architecture: bare-metal vs RTOS
  (FreeRTOS/Zephyr), real-time scheduling (RMS/EDF), WCET and schedulability,
  priority inversion, interrupt latency, memory/energy budgets, MMU-less design.

  USE WHEN: designing firmware/embedded/IoT/MCU systems, real-time deadlines,
  "RTOS", "FreeRTOS", "Zephyr", "bare-metal", "WCET", "hard real-time", "priority
  inversion", "interrupt latency", "deadline", microcontroller architecture.

  DO NOT USE FOR: general OS/kernel design (use `os-kernel-architecture`);
  cloud/server perf (use `hardware-aware-design`); app code (use language skills).
allowed-tools: Read, Grep, Glob
---
# Embedded / Firmware / RTOS Architecture

## Bare-metal vs RTOS vs GPOS — the first decision

| Option | When | Cost |
|---|---|---|
| **Bare-metal (superloop + ISRs)** | Tiny MCU, few tasks, hard determinism | No task abstraction; hand-rolled scheduling |
| **RTOS (FreeRTOS, Zephyr, ThreadX)** | Many concurrent tasks, deadlines, drivers | Footprint (KBs), scheduling overhead |
| **GPOS w/ RT patch (Linux PREEMPT_RT)** | Rich connectivity + soft/firm RT | MBs RAM, MMU, bounded-but-larger latency |

## Real-time scheduling & schedulability

- **Hard vs soft vs firm** real-time: missing a hard deadline = system failure.
- **RMS** (rate-monotonic, fixed priority): schedulable if Σ(Cᵢ/Tᵢ) ≤ n(2^(1/n)−1).
- **EDF** (earliest-deadline-first, dynamic): optimal, schedulable up to 100% CPU,
  but harder to reason about overload.
- **WCET** (worst-case execution time) is the input everything depends on —
  caches, branch prediction, DMA contention make it hard; measure + analyze.
- **Priority inversion** → use priority inheritance or priority ceiling on mutexes
  (the Mars Pathfinder bug). Avoid unbounded blocking.

## Architecture constraints that dominate

- **Memory**: often no MMU → no virtual memory, no process isolation; static
  allocation preferred (no heap fragmentation); stack sizing per task.
- **Interrupt latency**: keep ISRs short (top-half), defer to tasks; measure
  worst-case disable-interrupt windows.
- **Power**: tickless idle, sleep states, peripheral clock gating, wake sources;
  energy-per-inference for edge AI (see `ai-systems`/edge).
- **Determinism over throughput**: avoid dynamic allocation, unbounded loops,
  and non-deterministic libraries on hot paths.

## When to recommend what
- Hard deadlines + tiny MCU → bare-metal or small RTOS, RMS/EDF, static alloc.
- Connectivity + soft RT → Zephyr or Linux PREEMPT_RT.
- Safety-critical (ISO 26262 / DO-178C / IEC 62304) → certified RTOS, redundancy,
  formal/coverage analysis (pairs with a safety-critical skill when present).
