// SPDX-License-Identifier: MIT
/**
 * RAG operations & infrastructure documentation
 * Includes: TEI / Triton GPU serving, batch inference, cost allocation,
 *           multi-region deployment, LLM gateways (Portkey/OpenRouter/LiteLLM).
 *
 * KB layout: knowledge/rag-ops/{technology}/{topic}.md
 */

import type { DocsRecord } from "./types.js";

export const RAG_OPS_TECHNOLOGIES = [
  "tei-triton-serving",
  "batch-inference",
  "cost-allocation",
  "multi-region",
  "llm-gateway",
] as const;

export const ragOpsDocs: DocsRecord = {
  "tei-triton-serving": {
    overview: { local: "rag-ops/tei-triton-serving/overview.md", url: "https://huggingface.co/docs/text-embeddings-inference/index" },
    deployment: { local: "rag-ops/tei-triton-serving/deployment.md", url: "https://huggingface.co/docs/text-embeddings-inference/index" },
    benchmarks: { local: "rag-ops/tei-triton-serving/benchmarks.md", url: "https://huggingface.co/docs/text-embeddings-inference/index" },
  },
  "batch-inference": {
    overview: { local: "rag-ops/batch-inference/overview.md", url: "https://platform.openai.com/docs/guides/batch" },
    implementation: { local: "rag-ops/batch-inference/implementation.md", url: "https://platform.openai.com/docs/guides/batch" },
    "cost-analysis": { local: "rag-ops/batch-inference/cost-analysis.md", url: "https://platform.openai.com/docs/guides/batch" },
  },
  "cost-allocation": {
    overview: { local: "rag-ops/cost-allocation/overview.md", url: "https://langfuse.com/docs/model-usage-and-cost" },
    implementation: { local: "rag-ops/cost-allocation/implementation.md", url: "https://langfuse.com/docs/model-usage-and-cost" },
    optimization: { local: "rag-ops/cost-allocation/optimization.md", url: "https://langfuse.com/docs/model-usage-and-cost" },
  },
  "multi-region": {
    overview: { local: "rag-ops/multi-region/overview.md", url: "https://docs.pinecone.io/guides/indexes/create-an-index" },
    implementation: { local: "rag-ops/multi-region/implementation.md", url: "https://docs.pinecone.io/guides/indexes/create-an-index" },
    failover: { local: "rag-ops/multi-region/failover.md", url: "https://docs.pinecone.io/guides/indexes/create-an-index" },
  },
  "llm-gateway": {
    overview: { local: "rag-ops/llm-gateway/overview.md", url: "https://portkey.ai/docs/welcome/what-is-portkey" },
    implementation: { local: "rag-ops/llm-gateway/implementation.md", url: "https://portkey.ai/docs/welcome/what-is-portkey" },
    monitoring: { local: "rag-ops/llm-gateway/monitoring.md", url: "https://portkey.ai/docs/welcome/what-is-portkey" },
  },
};
