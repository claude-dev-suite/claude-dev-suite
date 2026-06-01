// SPDX-License-Identifier: MIT
/**
 * AI-integrated systems architecture documentation
 * Backs the `ai-systems/` skill pack used by the architect agent.
 */

import type { DocsRecord } from "./types.js";

export const AI_SYSTEMS_TECHNOLOGIES = [
  "edge-inference",
  "inference-serving-topology",
  "hybrid-edge-cloud",
  "ai-hardware-selection",
  "model-gateway-routing",
  "agentic-architecture",
] as const;

export const aiSystemsDocs: DocsRecord = {
  "edge-inference": {
    "on-device-inference": {
      local: "edge-inference/on-device-inference.md",
      url: "https://www.tensorflow.org/lite/microcontrollers",
    },
  },
  "inference-serving-topology": {
    "serving-layers": {
      local: "inference-serving-topology/serving-layers.md",
      url: "https://docs.vllm.ai/en/latest/",
    },
  },
  "hybrid-edge-cloud": {
    "local-first-escalation": {
      local: "hybrid-edge-cloud/local-first-escalation.md",
      url: "https://arxiv.org/abs/2305.05176",
    },
  },
  "ai-hardware-selection": {
    "accelerator-selection": {
      local: "ai-hardware-selection/accelerator-selection.md",
      url: "https://developer.nvidia.com/blog/mastering-llm-techniques-inference-optimization/",
    },
  },
  "model-gateway-routing": {
    "gateway-patterns": {
      local: "model-gateway-routing/gateway-patterns.md",
      url: "https://docs.litellm.ai/docs/",
    },
  },
  "agentic-architecture": {
    "orchestration-topologies": {
      local: "agentic-architecture/orchestration-topologies.md",
      url: "https://www.anthropic.com/engineering/building-effective-agents",
    },
  },
};
