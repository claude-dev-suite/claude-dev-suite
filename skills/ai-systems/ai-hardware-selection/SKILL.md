---
name: ai-hardware-selection
description: |
  Selecting accelerators for AI workloads: GPU vs TPU vs NPU vs FPGA vs CPU,
  and the metrics that actually decide it — memory capacity & bandwidth, TOPS/
  FLOPS, interconnect, and cost/Watt. Architect-level hardware-fit reasoning.

  USE WHEN: choosing AI hardware/accelerators, "which GPU", "TPU vs GPU", "NPU",
  "FPGA", "HBM/memory bandwidth", "TOPS", "cost per token", VRAM sizing for a
  model, training vs inference hardware, accelerator interconnect.

  DO NOT USE FOR: serving software topology (use `inference-serving-topology`);
  on-device runtimes (use `edge-inference`); generic CPU perf (use
  systems/hardware-aware-design).
allowed-tools: Read, Grep, Glob
---
# AI Hardware Selection

## The metric that usually decides: memory, then bandwidth
For LLM **inference**, the binding constraint is typically **VRAM/HBM capacity**
(weights + KV-cache must fit) and **memory bandwidth** (decode is
memory-bound) — not raw FLOPS. Size first:
`weights ≈ params × bytes/param` (e.g. 70B × 2B(FP16) ≈ 140GB → multi-GPU or
quantize). Add KV-cache (grows with context × batch). Only then look at TOPS.

## Accelerator families
| Type | Strength | Use |
|---|---|---|
| **GPU** (NVIDIA H/B-series, AMD MI) | Flexible, huge ecosystem, HBM | Training + inference, the default |
| **TPU** | Matmul-dense, pod-scale interconnect | Large-scale training/inference on GCP |
| **NPU** | Perf/Watt at low power | Edge / mobile / AI-PC inference |
| **FPGA** | Custom low-latency dataflow | Niche ultra-low-latency / fixed pipelines |
| **CPU** | Available, fine for small/batch | Small models, embeddings, light load |

## Other levers
- **Interconnect** (NVLink, InfiniBand): decisive for multi-GPU training and
  tensor parallelism — bandwidth between accelerators bounds scaling.
- **Precision support**: FP8/INT4 support multiplies effective throughput/capacity.
- **Cost/Watt & TCO**: cloud per-hour vs owned; power/cooling; utilization. The
  honest metric is **cost per token (or per request) at target latency**.
- **Training vs inference**: training needs FLOPS + interconnect + memory;
  inference needs memory capacity/bandwidth + latency.

## When to recommend what
- Default / flexibility / training → NVIDIA GPUs (size by model VRAM).
- Edge/mobile/low-power inference → NPU.
- Hyperscale training on GCP → TPU pods.
- Fixed ultra-low-latency pipeline → FPGA (only if justified).
