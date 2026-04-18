// SPDX-License-Identifier: MIT
/**
 * RAG frameworks documentation
 * Includes: LlamaIndex, Haystack, DSPy, LangGraph for RAG,
 *           Ragatouille, R2R, Canopy, txtai.
 *
 * KB layout: knowledge/rag-frameworks/{technology}/{topic}.md
 */

import type { DocsRecord } from "./types.js";

export const RAG_FRAMEWORKS_TECHNOLOGIES = [
  "llamaindex",
  "haystack",
  "dspy",
  "langgraph-rag",
  "ragatouille",
  "r2r",
  "canopy",
  "txtai",
] as const;

export const ragFrameworksDocs: DocsRecord = {
  llamaindex: {
    overview: { local: "rag-frameworks/llamaindex/overview.md", url: "https://docs.llamaindex.ai/en/stable/" },
    "ingestion-deep": { local: "rag-frameworks/llamaindex/ingestion-deep.md", url: "https://docs.llamaindex.ai/en/stable/module_guides/loading/ingestion_pipeline/" },
    "query-engines": { local: "rag-frameworks/llamaindex/query-engines.md", url: "https://docs.llamaindex.ai/en/stable/module_guides/deploying/query_engine/" },
    agents: { local: "rag-frameworks/llamaindex/agents.md", url: "https://docs.llamaindex.ai/en/stable/module_guides/deploying/agents/" },
  },
  haystack: {
    overview: { local: "rag-frameworks/haystack/overview.md", url: "https://docs.haystack.deepset.ai/docs/intro" },
    "getting-started": { local: "rag-frameworks/haystack/getting-started.md", url: "https://docs.haystack.deepset.ai/docs/intro" },
    advanced: { local: "rag-frameworks/haystack/advanced.md", url: "https://docs.haystack.deepset.ai/docs/intro" },
  },
  dspy: {
    overview: { local: "rag-frameworks/dspy/overview.md", url: "https://dspy.ai/" },
    "getting-started": { local: "rag-frameworks/dspy/getting-started.md", url: "https://dspy.ai/" },
    optimization: { local: "rag-frameworks/dspy/optimization.md", url: "https://dspy.ai/" },
  },
  "langgraph-rag": {
    overview: { local: "rag-frameworks/langgraph-rag/overview.md", url: "https://langchain-ai.github.io/langgraph/" },
    "state-design": { local: "rag-frameworks/langgraph-rag/state-design.md", url: "https://langchain-ai.github.io/langgraph/" },
    "self-rag-impl": { local: "rag-frameworks/langgraph-rag/self-rag-impl.md", url: "https://langchain-ai.github.io/langgraph/tutorials/rag/langgraph_self_rag/" },
    "multi-agent": { local: "rag-frameworks/langgraph-rag/multi-agent.md", url: "https://langchain-ai.github.io/langgraph/tutorials/multi_agent/multi-agent-collaboration/" },
  },
  ragatouille: {
    overview: { local: "rag-frameworks/ragatouille/overview.md", url: "https://github.com/AnswerDotAI/RAGatouille" },
    "getting-started": { local: "rag-frameworks/ragatouille/getting-started.md", url: "https://github.com/AnswerDotAI/RAGatouille" },
    training: { local: "rag-frameworks/ragatouille/training.md", url: "https://github.com/AnswerDotAI/RAGatouille" },
  },
  r2r: {
    overview: { local: "rag-frameworks/r2r/overview.md", url: "https://r2r-docs.sciphi.ai/" },
    "getting-started": { local: "rag-frameworks/r2r/getting-started.md", url: "https://r2r-docs.sciphi.ai/" },
    advanced: { local: "rag-frameworks/r2r/advanced.md", url: "https://r2r-docs.sciphi.ai/" },
  },
  canopy: {
    overview: { local: "rag-frameworks/canopy/overview.md", url: "https://github.com/pinecone-io/canopy" },
    "getting-started": { local: "rag-frameworks/canopy/getting-started.md", url: "https://github.com/pinecone-io/canopy" },
    advanced: { local: "rag-frameworks/canopy/advanced.md", url: "https://github.com/pinecone-io/canopy" },
  },
  txtai: {
    overview: { local: "rag-frameworks/txtai/overview.md", url: "https://neuml.github.io/txtai/" },
    "getting-started": { local: "rag-frameworks/txtai/getting-started.md", url: "https://neuml.github.io/txtai/" },
    advanced: { local: "rag-frameworks/txtai/advanced.md", url: "https://neuml.github.io/txtai/" },
  },
};
