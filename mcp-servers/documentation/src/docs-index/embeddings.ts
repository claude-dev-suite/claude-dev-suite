// SPDX-License-Identifier: MIT
/**
 * Embeddings documentation
 * Includes: model selection, multilingual, fine-tuning, Matryoshka,
 *           late chunking, drift detection, hard-negative mining, semantic dedup.
 *
 * KB layout: knowledge/embeddings/{technology}/{topic}.md
 */

import type { DocsRecord } from "./types.js";

export const EMBEDDINGS_TECHNOLOGIES = [
  "embedding-models",
  "multilingual-embeddings",
  "embedding-fine-tuning",
  "matryoshka-embeddings",
  "late-chunking",
  "drift-detection",
  "hard-negative-mining",
  "semantic-dedup",
] as const;

export const embeddingsDocs: DocsRecord = {
  "embedding-models": {
    overview: { local: "embeddings/embedding-models/overview.md", url: "https://huggingface.co/spaces/mteb/leaderboard" },
    "providers-comparison": { local: "embeddings/embedding-models/providers-comparison.md", url: "https://huggingface.co/spaces/mteb/leaderboard" },
    "dimension-selection": { local: "embeddings/embedding-models/dimension-selection.md", url: "https://platform.openai.com/docs/guides/embeddings" },
  },
  "multilingual-embeddings": {
    overview: { local: "embeddings/multilingual-embeddings/overview.md", url: "https://huggingface.co/BAAI/bge-m3" },
    "model-comparison": { local: "embeddings/multilingual-embeddings/model-comparison.md", url: "https://huggingface.co/BAAI/bge-m3" },
    "cross-lingual-patterns": { local: "embeddings/multilingual-embeddings/cross-lingual-patterns.md", url: "https://huggingface.co/BAAI/bge-m3" },
  },
  "embedding-fine-tuning": {
    overview: { local: "embeddings/embedding-fine-tuning/overview.md", url: "https://www.sbert.net/docs/training/overview.html" },
    "training-guide": { local: "embeddings/embedding-fine-tuning/training-guide.md", url: "https://www.sbert.net/docs/training/overview.html" },
    evaluation: { local: "embeddings/embedding-fine-tuning/evaluation.md", url: "https://www.sbert.net/docs/training/overview.html" },
  },
  "matryoshka-embeddings": {
    overview: { local: "embeddings/matryoshka-embeddings/overview.md", url: "https://arxiv.org/abs/2205.13147" },
    "truncation-guide": { local: "embeddings/matryoshka-embeddings/truncation-guide.md", url: "https://arxiv.org/abs/2205.13147" },
    "quality-comparison": { local: "embeddings/matryoshka-embeddings/quality-comparison.md", url: "https://arxiv.org/abs/2205.13147" },
  },
  "late-chunking": {
    overview: { local: "embeddings/late-chunking/overview.md", url: "https://jina.ai/news/late-chunking-in-long-context-embedding-models/" },
    implementation: { local: "embeddings/late-chunking/implementation.md", url: "https://jina.ai/news/late-chunking-in-long-context-embedding-models/" },
    benchmarks: { local: "embeddings/late-chunking/benchmarks.md", url: "https://jina.ai/news/late-chunking-in-long-context-embedding-models/" },
  },
  "drift-detection": {
    overview: { local: "embeddings/drift-detection/overview.md", url: "https://docs.arize.com/arize/machine-learning/machine-learning/how-arize-works/embeddings" },
    "metrics-guide": { local: "embeddings/drift-detection/metrics-guide.md", url: "https://docs.arize.com/arize/machine-learning/machine-learning/how-arize-works/embeddings" },
    alerting: { local: "embeddings/drift-detection/alerting.md", url: "https://docs.arize.com/arize/machine-learning/machine-learning/how-arize-works/embeddings" },
  },
  "hard-negative-mining": {
    overview: { local: "embeddings/hard-negative-mining/overview.md", url: "https://www.sbert.net/examples/training/ms_marco/README.html" },
    "mining-strategies": { local: "embeddings/hard-negative-mining/mining-strategies.md", url: "https://www.sbert.net/examples/training/ms_marco/README.html" },
    "training-pipeline": { local: "embeddings/hard-negative-mining/training-pipeline.md", url: "https://www.sbert.net/examples/training/ms_marco/README.html" },
  },
  "semantic-dedup": {
    overview: { local: "embeddings/semantic-dedup/overview.md", url: "https://github.com/ekzhu/datasketch" },
    algorithms: { local: "embeddings/semantic-dedup/algorithms.md", url: "https://github.com/ekzhu/datasketch" },
    "production-pipeline": { local: "embeddings/semantic-dedup/production-pipeline.md", url: "https://github.com/ekzhu/datasketch" },
  },
};
