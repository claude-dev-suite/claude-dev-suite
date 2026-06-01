---
name: hybrid-edge-cloud
description: |
  Hybrid edge-cloud AI architecture: local-first inference with cloud escalation,
  model cascading, and splitting the workload across device and datacenter to
  balance latency, cost, privacy, and quality. Architect-level topology.

  USE WHEN: designing systems that combine on-device and cloud AI, "local-first",
  "cloud fallback", "model cascade", "escalation", "hybrid inference", routing
  by confidence/complexity, edge+cloud trade-offs.

  DO NOT USE FOR: pure on-device (use `edge-inference`); pure cloud serving (use
  `inference-serving-topology`); multi-provider API routing (use `model-gateway-routing`).
allowed-tools: Read, Grep, Glob
---
# Hybrid Edge–Cloud AI

Combine a small/fast local model with a large/capable cloud model to get the best
of both — when neither pure-edge nor pure-cloud fits.

## Patterns
- **Local-first + cloud escalation**: run a small on-device model; escalate to
  the cloud only when needed (low confidence, long context, hard query). Most
  requests stay local (fast, cheap, private); hard ones get cloud quality.
- **Model cascade**: cheap model → if confidence < threshold → bigger model →
  … . Tune thresholds to a cost/quality target. Works within cloud too.
- **Speculative / draft-verify**: small model drafts, large model verifies — a
  latency optimization more than a topology, but composes here.
- **Split computation**: feature extraction / preprocessing on device, heavy
  inference in cloud (classic for vision/audio).

## Decision drivers
- **Escalation trigger**: confidence score, input complexity/length, task type,
  or explicit user action. The trigger quality makes or breaks the design.
- **Privacy boundary**: what may leave the device? Sometimes only embeddings or
  redacted text escalate.
- **Connectivity**: must it degrade gracefully offline? Local model = floor.
- **Cost model**: % of traffic that escalates × cloud cost vs local hardware cost.

## Failure & consistency
- Define behavior when the cloud is unreachable (serve local result + flag, queue,
  or refuse). Avoid silent quality cliffs.
- Cache cloud results on device for repeat queries.

## When to recommend
- Voice assistants, copilots on laptops/phones, field/IoT devices with
  intermittent connectivity, privacy-sensitive apps with occasional hard queries.
- If ~all traffic needs the big model → just use cloud serving. If ~none does →
  go pure edge.
