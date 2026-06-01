---
name: inference-serving-topology
description: |
  LLM/model inference serving architecture: the engine → serving → orchestration
  layering (vLLM/SGLang/TensorRT-LLM, Triton, KServe/Ray Serve), KV-cache &
  continuous batching, prefill-decode disaggregation, and scaling. Architect-level
  topology, not model training.

  USE WHEN: designing model/LLM serving infra, "vLLM", "SGLang", "TensorRT-LLM",
  "Triton", "KServe", "Ray Serve", "continuous batching", "KV cache", "prefill
  decode", "TTFT", multi-GPU/multi-model serving, inference autoscaling.

  DO NOT USE FOR: on-device (use `edge-inference`); provider routing (use
  `model-gateway-routing`); RAG app logic (use rag/rag-frameworks skills).
allowed-tools: Read, Grep, Glob
---
# Inference Serving Topology

## The three layers (name which you're designing)
1. **Engine** — executes the model on accelerators: **vLLM**, **SGLang**,
   **TensorRT-LLM**. Owns paged **KV-cache**, **continuous (in-flight) batching**,
   quantization. This is where throughput/latency is won.
2. **Serving** — request routing, batching policy, API contract, metrics, rate
   limiting: **Triton** (production shell around an engine), **KServe**,
   **LiteLLM/Envoy AI Gateway**.
3. **Orchestration** — scaling, health, placement: **Kubernetes + KEDA**,
   **Ray Serve**, llm-d, GKE Inference Gateway.

A common 2026 pairing: **vLLM as the token engine + Triton as the production
shell**; **Ray Serve** when you need multi-GPU/multi-node distributed strategies.

## Levers that decide the topology
- **KV-cache** is the memory bottleneck for LLMs → paged KV (vLLM), cache reuse,
  quantized KV. Drives max batch / context.
- **Continuous batching** (vs static) is mandatory for throughput.
- **Prefill–decode disaggregation**: split the compute-bound prefill from the
  memory-bound decode onto different pools → better utilization at scale.
- **Parallelism**: tensor / pipeline / expert (MoE) / data-parallel attention —
  chosen by model size vs GPU memory.
- **Targets**: state TTFT (time-to-first-token, low hundreds of ms) and
  inter-token latency (tens of ms) goals — they drive batching/parallelism.

## Scale ladder
Single GPU + vLLM → multi-GPU one node → Ray Serve/KServe multi-node + KEDA
autoscaling → disaggregated prefill/decode + multi-region. Don't jump tiers
without a load/latency reason.

## When to recommend what
- One model, moderate load → single-node vLLM (+ Triton for ops).
- Many models / platform team → Triton + KServe on k8s.
- Large model / high concurrency / SLO-driven → Ray Serve, disaggregation,
  tensor/expert parallelism.
