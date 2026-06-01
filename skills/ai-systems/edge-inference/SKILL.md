---
name: edge-inference
description: |
  Edge / on-device AI inference architecture: running models on MCUs, NPUs,
  mobile, and mini-PCs; quantization for edge, TOPS/memory/energy budgets,
  TinyML, and the latency case for on-device vs cloud. Architect-level.

  USE WHEN: designing on-device/edge AI, "edge inference", "on-device", "NPU",
  "TinyML", "quantization", "Jetson", "Coral", "Hailo", local LLM on small
  hardware, offline/low-latency inference, energy-constrained ML.

  DO NOT USE FOR: cloud GPU serving (use `inference-serving-topology`); choosing
  datacenter accelerators (use `ai-hardware-selection`); RAG app code (use rag skills).
allowed-tools: Read, Grep, Glob
---
# Edge / On-Device Inference

## Why on-device (the decision drivers)
- **Latency**: on-device token/inference in ~tens of ms vs 200–500ms cloud
  round-trip — decisive for voice, AR, control loops.
- **Privacy / offline / cost**: data never leaves the device; works without
  connectivity; no per-call cloud cost.
- **Cost of doing it**: tight memory/energy/thermal budgets; smaller models;
  more engineering.

## The hardware tiers (match model to silicon)
| Tier | Silicon | Typical model |
|---|---|---|
| MCU / TinyML | Cortex-M + tiny NPU (sub-$1 class) | KB-MB models: keyword spotting, anomaly detection (TFLite Micro) |
| Mobile / AI-PC | Phone NPU, laptop NPU (tens of TOPS) | Quantized 3–8B LLMs, vision |
| Edge box | Jetson Orin/Thor, Coral, Hailo (40+ TOPS) | 7–13B LLMs, multi-camera vision |

## Architectural levers
- **Quantization** is the key enabler: FP16 → INT8 → INT4 trades accuracy for
  memory/throughput/energy. Most edge LLMs run INT4/INT8. Validate accuracy loss.
- **Model choice**: small instruct/distilled models (e.g. 3–8B class) and vision
  models sized to the NPU's memory bandwidth, not just TOPS.
- **Runtime**: TFLite/LiteRT, ONNX Runtime, ExecuTorch, llama.cpp/Ollama,
  vendor SDKs (TensorRT for Jetson). Pick what targets the accelerator.
- **Budgets**: state the TOPS, RAM, and energy-per-inference budget up front —
  they bound everything. Batch=1, KV-cache memory dominates LLM RAM.

## When to recommend edge vs cloud vs hybrid
- Hard latency / offline / privacy / per-unit cost → on-device.
- Large model / variable load / centralized updates → cloud serving.
- Both needs → **hybrid** (small local model + cloud escalation): see
  `hybrid-edge-cloud`.
