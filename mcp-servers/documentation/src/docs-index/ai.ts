// SPDX-License-Identifier: MIT
/**
 * AI integration documentation
 * Includes: RAG patterns, Vector databases, Claude API, MCP SDK
 */

import type { DocsRecord } from "./types.js";

export const AI_TECHNOLOGIES = [
  "rag-patterns",
  "vector-databases",
  "anthropic",
  "mcp-sdk",
] as const;

export const aiDocs: DocsRecord = {
  "rag-patterns": {
    chunking: {
      local: "rag-patterns/chunking.md",
      url: "https://docs.llamaindex.ai/en/stable/optimizing/production_rag/",
    },
    retrieval: {
      local: "rag-patterns/retrieval.md",
      url: "https://python.langchain.com/docs/concepts/retrievers/",
    },
    "hybrid-search": {
      local: "rag-patterns/hybrid-search.md",
      url: "https://weaviate.io/blog/hybrid-search-explained",
    },
    evaluation: {
      local: "rag-patterns/evaluation.md",
      url: "https://docs.ragas.io/en/stable/",
    },
    "advanced-patterns": {
      local: "rag-patterns/advanced-patterns.md",
      url: "https://docs.llamaindex.ai/en/stable/optimizing/advanced_retrieval/",
    },
  },

  "vector-databases": {
    pinecone: {
      local: "vector-databases/pinecone.md",
      url: "https://docs.pinecone.io/guides/get-started/overview",
    },
    chromadb: {
      local: "vector-databases/chromadb.md",
      url: "https://docs.trychroma.com/getting-started",
    },
    pgvector: {
      local: "vector-databases/pgvector.md",
      url: "https://github.com/pgvector/pgvector",
    },
    qdrant: {
      local: "vector-databases/qdrant.md",
      url: "https://qdrant.tech/documentation/",
    },
    indexing: {
      local: "vector-databases/indexing.md",
      url: "https://www.pinecone.io/learn/vector-database/",
    },
  },

  // Canonical host is platform.claude.com: both docs.anthropic.com and
  // docs.claude.com now 301 there.
  anthropic: {
    basics: {
      local: "anthropic/basics.md",
      url: "https://platform.claude.com/docs/en/api/getting-started",
    },
    messages: {
      local: "anthropic/messages.md",
      url: "https://platform.claude.com/docs/en/api/messages",
    },
    streaming: {
      local: "anthropic/streaming.md",
      url: "https://platform.claude.com/docs/en/api/messages-streaming",
    },
    tools: {
      local: "anthropic/tools.md",
      url: "https://platform.claude.com/docs/en/docs/build-with-claude/tool-use/overview",
    },
    // Batches + prompt caching + token counting + retries: no single upstream
    // page covers them, so this points at the features hub that indexes them.
    advanced: {
      local: "anthropic/advanced.md",
      url: "https://platform.claude.com/docs/en/build-with-claude/overview",
    },
  },

  "mcp-sdk": {
    basics: {
      local: "mcp-sdk/basics.md",
      url: "https://modelcontextprotocol.io/docs/concepts/architecture",
    },
    server: {
      local: "mcp-sdk/server.md",
      url: "https://modelcontextprotocol.io/docs/develop/build-server",
    },
    client: {
      local: "mcp-sdk/client.md",
      url: "https://modelcontextprotocol.io/docs/develop/build-client",
    },
    tools: {
      local: "mcp-sdk/tools.md",
      url: "https://modelcontextprotocol.io/docs/concepts/tools",
    },
    resources: {
      local: "mcp-sdk/resources.md",
      url: "https://modelcontextprotocol.io/docs/concepts/resources",
    },
    prompts: {
      local: "mcp-sdk/prompts.md",
      url: "https://modelcontextprotocol.io/docs/concepts/prompts",
    },
  },
};
