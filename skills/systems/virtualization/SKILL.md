---
name: virtualization
description: |
  Virtualization and isolation architecture: hypervisors (type-1/type-2),
  container internals (namespaces, cgroups), microVMs, and the
  isolation-vs-overhead spectrum. Architect-level choice of isolation boundary.

  USE WHEN: choosing an isolation/virtualization boundary, "hypervisor", "KVM",
  "type-1/type-2", "container", "namespaces", "cgroups", "microVM", "Firecracker",
  "gVisor", "Kata", multi-tenant isolation, sandboxing untrusted workloads.

  DO NOT USE FOR: Kubernetes/Docker operational config (use infrastructure skills);
  OS internals (use `os-kernel-architecture`).
allowed-tools: Read, Grep, Glob
---
# Virtualization & Isolation

## The isolation ↔ overhead spectrum (pick the weakest sufficient boundary)

| Boundary | Isolation | Overhead / density | Boot | Fits |
|---|---|---|---|---|
| **Process + namespaces/cgroups (containers)** | Shared kernel → weakest | Lowest, highest density | ms | Trusted multi-service |
| **gVisor / user-space kernel** | Syscall interception | Moderate; some perf loss | ms | Semi-trusted, k8s-friendly |
| **microVM (Firecracker, Kata)** | Own kernel, tiny device model | Low-ish; ~125ms boot | fast | Untrusted multi-tenant (FaaS) |
| **Full VM (type-1 KVM/Xen, type-2)** | Strong, own kernel + devices | Highest per-VM | s | Strong tenant isolation, mixed OS |

Decision driver: **trust level of the workload**. Untrusted/multi-tenant code →
at least a microVM; trusted internal services → containers.

## Mechanics worth pinning down

- **Type-1** (bare-metal: KVM, Xen, Hyper-V, ESXi) vs **type-2** (hosted:
  VirtualBox). Hardware-assisted virt (VT-x/AMD-V, EPT/NPT) is assumed.
- **Containers** = namespaces (pid/net/mnt/user/…) + cgroups (CPU/mem/io limits)
  + capabilities + seccomp + (often) a userns for rootless. NOT a security
  boundary against kernel exploits by themselves.
- **microVMs**: minimal device model + own guest kernel → VM-grade isolation at
  near-container speed/density; the FaaS sweet spot (Lambda uses Firecracker).
- **Confidential computing**: SEV-SNP/TDX encrypt guest memory from the host —
  for untrusted-host scenarios (pairs with security architecture).

## When to recommend what
- Internal trusted microservices → containers + cgroups, seccomp, rootless.
- Run untrusted/tenant code → Firecracker/Kata microVMs or gVisor.
- Mixed OS / strong tenant separation / legacy → full VMs on type-1.
