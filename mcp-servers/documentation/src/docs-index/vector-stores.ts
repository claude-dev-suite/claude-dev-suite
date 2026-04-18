// SPDX-License-Identifier: MIT
/**
 * Vector stores documentation (deep, beyond the ai.ts basic entries)
 * Includes: pgvector, Qdrant, Weaviate, Elasticsearch, Pinecone, Milvus,
 *           Redis, LanceDB, MongoDB Atlas, ChromaDB, OpenSearch, Vespa,
 *           ANN algorithms, vector quantization.
 *
 * KB layout: knowledge/vector-stores/{technology}/{topic}.md
 */

import type { DocsRecord } from "./types.js";

export const VECTOR_STORES_TECHNOLOGIES = [
  "pgvector-advanced",
  "qdrant-advanced",
  "weaviate-advanced",
  "elasticsearch-vectors",
  "pinecone-advanced",
  "milvus",
  "redis-vector",
  "lancedb",
  "mongodb-atlas-vector",
  "chromadb-advanced",
  "opensearch-knn",
  "vespa",
  "ann-algorithms",
  "vector-quantization",
] as const;

export const vectorStoresDocs: DocsRecord = {
  "pgvector-advanced": {
    overview: { local: "vector-stores/pgvector-advanced/overview.md", url: "https://github.com/pgvector/pgvector" },
    "hnsw-tuning": { local: "vector-stores/pgvector-advanced/hnsw-tuning.md", url: "https://github.com/pgvector/pgvector#hnsw" },
    "hybrid-pg-trgm": { local: "vector-stores/pgvector-advanced/hybrid-pg-trgm.md", url: "https://www.postgresql.org/docs/current/pgtrgm.html" },
    benchmarks: { local: "vector-stores/pgvector-advanced/benchmarks.md", url: "https://github.com/pgvector/pgvector" },
  },
  "qdrant-advanced": {
    overview: { local: "vector-stores/qdrant-advanced/overview.md", url: "https://qdrant.tech/documentation/" },
    deployment: { local: "vector-stores/qdrant-advanced/deployment.md", url: "https://qdrant.tech/documentation/guides/installation/" },
    benchmarks: { local: "vector-stores/qdrant-advanced/benchmarks.md", url: "https://qdrant.tech/benchmarks/" },
  },
  "weaviate-advanced": {
    overview: { local: "vector-stores/weaviate-advanced/overview.md", url: "https://weaviate.io/developers/weaviate" },
    deployment: { local: "vector-stores/weaviate-advanced/deployment.md", url: "https://weaviate.io/developers/weaviate/installation" },
    benchmarks: { local: "vector-stores/weaviate-advanced/benchmarks.md", url: "https://weaviate.io/developers/weaviate" },
  },
  "elasticsearch-vectors": {
    overview: { local: "vector-stores/elasticsearch-vectors/overview.md", url: "https://www.elastic.co/guide/en/elasticsearch/reference/current/knn-search.html" },
    deployment: { local: "vector-stores/elasticsearch-vectors/deployment.md", url: "https://www.elastic.co/guide/en/elasticsearch/reference/current/setup.html" },
    benchmarks: { local: "vector-stores/elasticsearch-vectors/benchmarks.md", url: "https://www.elastic.co/guide/en/elasticsearch/reference/current/knn-search.html" },
  },
  "pinecone-advanced": {
    overview: { local: "vector-stores/pinecone-advanced/overview.md", url: "https://docs.pinecone.io/" },
    deployment: { local: "vector-stores/pinecone-advanced/deployment.md", url: "https://docs.pinecone.io/guides/indexes/create-an-index" },
    benchmarks: { local: "vector-stores/pinecone-advanced/benchmarks.md", url: "https://docs.pinecone.io/" },
  },
  milvus: {
    overview: { local: "vector-stores/milvus/overview.md", url: "https://milvus.io/docs" },
    deployment: { local: "vector-stores/milvus/deployment.md", url: "https://milvus.io/docs/install_standalone-docker.md" },
    benchmarks: { local: "vector-stores/milvus/benchmarks.md", url: "https://milvus.io/docs" },
  },
  "redis-vector": {
    overview: { local: "vector-stores/redis-vector/overview.md", url: "https://redis.io/docs/latest/develop/interact/search-and-query/query/vector-search/" },
    deployment: { local: "vector-stores/redis-vector/deployment.md", url: "https://redis.io/docs/latest/operate/oss_and_stack/install/install-stack/" },
    benchmarks: { local: "vector-stores/redis-vector/benchmarks.md", url: "https://redis.io/docs/latest/develop/interact/search-and-query/query/vector-search/" },
  },
  lancedb: {
    overview: { local: "vector-stores/lancedb/overview.md", url: "https://lancedb.github.io/lancedb/" },
    deployment: { local: "vector-stores/lancedb/deployment.md", url: "https://lancedb.github.io/lancedb/guides/storage/" },
    benchmarks: { local: "vector-stores/lancedb/benchmarks.md", url: "https://lancedb.github.io/lancedb/" },
  },
  "mongodb-atlas-vector": {
    overview: { local: "vector-stores/mongodb-atlas-vector/overview.md", url: "https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-overview/" },
    deployment: { local: "vector-stores/mongodb-atlas-vector/deployment.md", url: "https://www.mongodb.com/docs/atlas/atlas-vector-search/create-index/" },
    benchmarks: { local: "vector-stores/mongodb-atlas-vector/benchmarks.md", url: "https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-overview/" },
  },
  "chromadb-advanced": {
    overview: { local: "vector-stores/chromadb-advanced/overview.md", url: "https://docs.trychroma.com/" },
    deployment: { local: "vector-stores/chromadb-advanced/deployment.md", url: "https://docs.trychroma.com/production/administration/migration" },
    benchmarks: { local: "vector-stores/chromadb-advanced/benchmarks.md", url: "https://docs.trychroma.com/" },
  },
  "opensearch-knn": {
    overview: { local: "vector-stores/opensearch-knn/overview.md", url: "https://opensearch.org/docs/latest/search-plugins/knn/" },
    deployment: { local: "vector-stores/opensearch-knn/deployment.md", url: "https://opensearch.org/docs/latest/install-and-configure/" },
    benchmarks: { local: "vector-stores/opensearch-knn/benchmarks.md", url: "https://opensearch.org/docs/latest/search-plugins/knn/" },
  },
  vespa: {
    overview: { local: "vector-stores/vespa/overview.md", url: "https://docs.vespa.ai/" },
    deployment: { local: "vector-stores/vespa/deployment.md", url: "https://docs.vespa.ai/en/getting-started.html" },
    benchmarks: { local: "vector-stores/vespa/benchmarks.md", url: "https://docs.vespa.ai/" },
  },
  "ann-algorithms": {
    overview: { local: "vector-stores/ann-algorithms/overview.md", url: "https://arxiv.org/abs/1603.09320" },
    "hnsw-deep": { local: "vector-stores/ann-algorithms/hnsw-deep.md", url: "https://arxiv.org/abs/1603.09320" },
    "ivf-pq-deep": { local: "vector-stores/ann-algorithms/ivf-pq-deep.md", url: "https://github.com/facebookresearch/faiss/wiki" },
  },
  "vector-quantization": {
    overview: { local: "vector-stores/vector-quantization/overview.md", url: "https://www.pinecone.io/learn/series/faiss/product-quantization/" },
    "techniques-comparison": { local: "vector-stores/vector-quantization/techniques-comparison.md", url: "https://www.pinecone.io/learn/series/faiss/product-quantization/" },
    implementation: { local: "vector-stores/vector-quantization/implementation.md", url: "https://github.com/facebookresearch/faiss/wiki" },
  },
};
