---
name: os-kernel-architecture
description: |
  Operating-system and kernel architecture decisions: monolithic vs microkernel
  vs hybrid vs unikernel/exokernel, scheduler design, virtual memory & paging,
  IPC mechanisms, syscall/ABI boundaries, and interrupt handling. Architect-level
  trade-offs, not driver implementation.

  USE WHEN: designing or evaluating an OS/kernel, RTOS-vs-GPOS choice, kernel
  structure, scheduler/memory/IPC subsystem design, syscall/ABI surface, "monolithic",
  "microkernel", "unikernel", "exokernel", "scheduler", "virtual memory", "IPC".

  DO NOT USE FOR: Windows driver implementation (use windows driver skills);
  app-level concurrency (use language skills); container internals (use `virtualization`).
allowed-tools: Read, Grep, Glob
---
# OS / Kernel Architecture

Architect-level decisions for operating systems and kernels.

## Kernel structure — the core decision

| Structure | Idea | Pros | Cons | Fits |
|---|---|---|---|---|
| **Monolithic** | All services in kernel space (Linux) | Fast (no IPC for services), mature | Large TCB, a fault can panic the system | General-purpose, performance-first |
| **Microkernel** | Minimal kernel; drivers/FS/net as user servers (seL4, QNX) | Isolation, verifiability, restartable servers | IPC cost on hot paths | Safety/security-critical, high-assurance |
| **Hybrid** | Monolithic core + some servers (XNU, NT) | Pragmatic balance | Ambiguous boundaries | Commercial desktop/mobile OS |
| **Unikernel** | App + minimal libOS into one address space (MirageOS) | Tiny attack surface, fast boot | Single app, weak isolation within | Single-purpose cloud/edge appliances |
| **Exokernel** | Kernel only multiplexes hardware; libOS in app | Max app control | Complexity pushed to apps | Research / specialized perf |

Decision drivers: **isolation/assurance vs IPC overhead**, TCB size, fault
containment, restartability, verification goals (seL4 = formally verified).

## Subsystems the architecture must pin down

- **Scheduler**: fairness (CFS) vs real-time (RMS/EDF, priority + inheritance to
  avoid priority inversion) vs throughput (batch). Preemptible vs cooperative.
  Tickless vs periodic tick. SMP load balancing, CPU affinity, NUMA awareness.
- **Memory management**: virtual memory + paging, page table levels, TLB
  pressure, huge pages, demand paging vs pinned, copy-on-write, NUMA placement,
  OOM policy. MMU-less (embedded) changes everything.
- **IPC**: synchronous rendezvous (seL4/L4) vs async message queues vs shared
  memory + doorbells. IPC latency is the microkernel make-or-break metric.
- **Syscall/ABI**: trap vs `syscall` instruction, vDSO for hot read-only calls,
  capability-based vs ambient-authority, ABI stability contract.
- **Interrupts**: top-half/bottom-half split, threaded IRQs, interrupt latency
  and determinism (hard real-time needs bounded latency), MSI/MSI-X.

## When to recommend what
- Need **provable isolation / restartable drivers** → microkernel (seL4/QNX).
- Need **max throughput, rich ecosystem** → monolithic (Linux).
- **Single cloud/edge appliance** → unikernel.
- **Hard real-time** → RTOS or PREEMPT_RT, EDF/RMS scheduling, bounded IRQ
  latency (see `embedded-rtos`).

Load deeper material with `fetch_docs("os-kernel-architecture", <topic>)` when
the knowledge base has it.
