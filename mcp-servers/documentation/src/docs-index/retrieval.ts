// SPDX-License-Identifier: MIT
/**
 * Retrieval algorithms documentation
 * Includes: ColBERT, SPLADE, BM25 tuning, RankGPT, cross-encoder training.
 *
 * KB layout: knowledge/retrieval/{technology}/{topic}.md
 */

import type { DocsRecord } from "./types.js";

export const RETRIEVAL_TECHNOLOGIES = [
  "colbert-retrieval",
  "splade-deep",
  "bm25-tuning",
  "rank-gpt",
  "cross-encoder-training",
] as const;

export const retrievalDocs: DocsRecord = {
  "colbert-retrieval": {
    overview: { local: "retrieval/colbert-retrieval/overview.md", url: "https://github.com/stanford-futuredata/ColBERT" },
    "paper-v1": { local: "retrieval/colbert-retrieval/paper-v1.md", url: "https://arxiv.org/abs/2004.12832" },
    "paper-v2-plaid": { local: "retrieval/colbert-retrieval/paper-v2-plaid.md", url: "https://arxiv.org/abs/2112.01488" },
    "ragatouille-guide": { local: "retrieval/colbert-retrieval/ragatouille-guide.md", url: "https://github.com/AnswerDotAI/RAGatouille" },
    benchmarks: { local: "retrieval/colbert-retrieval/benchmarks.md", url: "https://github.com/stanford-futuredata/ColBERT" },
  },
  "splade-deep": {
    overview: { local: "retrieval/splade-deep/overview.md", url: "https://github.com/naver/splade" },
    implementation: { local: "retrieval/splade-deep/implementation.md", url: "https://github.com/naver/splade" },
    benchmarks: { local: "retrieval/splade-deep/benchmarks.md", url: "https://github.com/naver/splade" },
  },
  "bm25-tuning": {
    overview: { local: "retrieval/bm25-tuning/overview.md", url: "https://www.elastic.co/blog/practical-bm25-part-3-considerations-for-picking-b-and-k1-in-elasticsearch" },
    "k1-b-tuning": { local: "retrieval/bm25-tuning/k1-b-tuning.md", url: "https://www.elastic.co/blog/practical-bm25-part-3-considerations-for-picking-b-and-k1-in-elasticsearch" },
    "language-analyzers": { local: "retrieval/bm25-tuning/language-analyzers.md", url: "https://www.elastic.co/guide/en/elasticsearch/reference/current/analysis-lang-analyzer.html" },
    "hybrid-patterns": { local: "retrieval/bm25-tuning/hybrid-patterns.md", url: "https://weaviate.io/blog/hybrid-search-explained" },
  },
  "rank-gpt": {
    overview: { local: "retrieval/rank-gpt/overview.md", url: "https://arxiv.org/abs/2304.09542" },
    implementation: { local: "retrieval/rank-gpt/implementation.md", url: "https://arxiv.org/abs/2304.09542" },
    comparison: { local: "retrieval/rank-gpt/comparison.md", url: "https://arxiv.org/abs/2304.09542" },
  },
  "cross-encoder-training": {
    overview: { local: "retrieval/cross-encoder-training/overview.md", url: "https://www.sbert.net/examples/training/cross-encoder/README.html" },
    "training-guide": { local: "retrieval/cross-encoder-training/training-guide.md", url: "https://www.sbert.net/examples/training/cross-encoder/README.html" },
    evaluation: { local: "retrieval/cross-encoder-training/evaluation.md", url: "https://www.sbert.net/examples/training/cross-encoder/README.html" },
  },
};
