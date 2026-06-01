---
name: systems-networking
description: |
  Systems-level networking architecture: kernel-bypass (DPDK, io_uring, eBPF/XDP),
  zero-copy, the network stack data path, NIC offloads, congestion control, and
  high-connection-count (C10M) server design. Architect-level, not app HTTP.

  USE WHEN: designing high-throughput/low-latency networking, packet processing,
  "kernel bypass", "DPDK", "io_uring", "eBPF", "XDP", "zero-copy", "C10M",
  "line rate", NIC offload, congestion control, software data plane.

  DO NOT USE FOR: REST/GraphQL API design (use api-design skills); app websockets
  (use real-time skills); cloud LB config (use infrastructure skills).
allowed-tools: Read, Grep, Glob
---
# Systems Networking Architecture

## The latency/throughput ladder (pick the lowest tier that meets needs)

| Tier | Mechanism | Throughput/latency | Cost/complexity |
|---|---|---|---|
| Sockets + epoll | Classic kernel stack | Good; syscalls + copies dominate | Lowest |
| **io_uring** | Async, batched, shared rings | Fewer syscalls/copies | Moderate; Linux ≥5.x |
| **eBPF/XDP** | Run code at the driver hook | Drop/redirect at line rate before stack | Verifier limits; per-packet logic |
| **Kernel bypass (DPDK)** | Poll-mode driver in userspace | 10–100M pps, µs latency | High; burns cores, no kernel stack |

Decision drivers: required **pps/latency**, CPU budget (DPDK busy-polls cores),
need for the kernel stack (TLS, routing), and operational complexity.

## Architectural levers

- **Zero-copy**: avoid user/kernel copies (sendfile, splice, io_uring fixed
  buffers, DPDK mbufs). Copies are often the real bottleneck.
- **Per-core / shared-nothing**: thread-per-core with RSS/affinity (Seastar
  model) to kill cross-core contention and cache bouncing.
- **NIC offloads**: checksum, TSO/LRO, RSS, and increasingly full TCP/crypto
  offload; SmartNIC/DPU pushes the data plane off the host CPU.
- **Congestion control**: choose per goal — CUBIC (throughput), BBR
  (latency/bufferbloat), DCTCP (datacenter). Matters for tail latency.
- **C10M**: the bottleneck is per-connection kernel cost and copies → bypass +
  zero-copy + per-core state.

## When to recommend what
- API server, normal scale → sockets/epoll or io_uring; don't over-engineer.
- Software router/firewall/LB at line rate → XDP/eBPF or DPDK.
- µs-tail trading/telco data plane → DPDK + per-core + kernel-bypass, SmartNIC.
