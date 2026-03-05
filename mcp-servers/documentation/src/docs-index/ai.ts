// SPDX-License-Identifier: MIT
/**
 * AI integration documentation
 * Includes: RAG patterns, Vector databases
 */

import type { DocsRecord } from "./types.js";

export const AI_TECHNOLOGIES = [
  "rag-patterns",
  "vector-databases",
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
};
