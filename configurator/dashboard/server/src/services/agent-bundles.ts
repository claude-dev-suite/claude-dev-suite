// SPDX-License-Identifier: MIT
/**
 * Agent Skill Bundles
 *
 * Maps bundle IDs to lists of skill paths. Bundles compress heavy agent
 * frontmatters: instead of listing 10–30 skills individually, an agent
 * declares `- bundle:rag/foundation` and the parser expands it at load time.
 *
 * Convention:
 *   In agent YAML frontmatter, prefix a bundle entry with `bundle:`:
 *     skills:
 *       - bundle:rag/foundation
 *       - bundle:rag/embeddings
 *       - my-explicit/skill
 *
 * Rules:
 *   - Bundle IDs use <namespace>/<name> format (e.g. rag/foundation)
 *   - Every skill path in a bundle must exist under skills/ in the dev-suite repo
 *   - Skills may appear in multiple bundles; deduplication happens at parse time
 *   - Adding a skill to a bundle is backward-compatible — agents that list it
 *     explicitly will simply have it deduped out
 */

export const BUNDLES: Record<string, string[]> = {
  // ─────────────────────────────────────────────────────────────────────────
  // RAG Expert bundles
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Core RAG architecture & retrieval patterns.
   * Covers naive → agentic pipelines, chunking, query transforms, feedback.
   */
  'rag/foundation': [
    'rag/rag-architecture',
    'rag/chunking-strategies',
    'rag/contextual-retrieval',
    'rag/query-transformations',
    'rag/advanced-retrieval',
    'rag/hybrid-search',
    'rag/reranking',
    'rag/rag-evaluation',
    'rag/agentic-rag',
    'rag/conversational-rag',
    'rag/streaming-rag',
    'rag/self-querying-retriever',
    'rag/personalization-rag',
    'rag/time-aware-retrieval',
    'rag/long-context-vs-rag',
    'rag/tabular-rag',
    'rag/feedback-loops',
  ],

  /**
   * Specialized RAG patterns: graph, multimodal, guardrails, caching,
   * security, production rollout, and observability.
   */
  'rag/specialized': [
    'rag/graph-rag',
    'rag/multimodal-rag',
    'rag/rag-guardrails',
    'rag/rag-caching',
    'rag/rag-security',
    'rag/rag-production',
    'rag/rag-observability',
  ],

  /**
   * Knowledge-graph RAG: entity resolution, graph construction, ontology.
   */
  'rag/knowledge-graph': [
    'rag/entity-resolution',
    'rag/knowledge-graph-construction',
    'rag/ontology-guided-retrieval',
  ],

  /**
   * RAG evaluation frameworks: ARES, Giskard, continuous eval, shadow mode.
   */
  'rag/evaluation': [
    'rag/ares-framework',
    'rag/giskard-rag',
    'rag/continuous-evaluation',
    'rag/shadow-mode-deployment',
  ],

  /**
   * Ingestion patterns: orchestration, CDC streaming, domain templates.
   */
  'rag/ingestion': [
    'rag/ingestion-orchestration',
    'rag/cdc-streaming-ingestion',
    'rag/domain-templates',
  ],

  /**
   * Dense and sparse retrieval algorithms.
   */
  'rag/retrieval': [
    'retrieval/colbert-retrieval',
    'retrieval/splade-deep',
    'retrieval/bm25-tuning',
    'retrieval/rank-gpt',
    'retrieval/cross-encoder-training',
  ],

  /**
   * Embedding models, fine-tuning, multilingual, matryoshka, drift detection.
   */
  'rag/embeddings': [
    'embeddings/embedding-models',
    'embeddings/multilingual-embeddings',
    'embeddings/embedding-fine-tuning',
    'embeddings/matryoshka-embeddings',
    'embeddings/late-chunking',
    'embeddings/drift-detection',
    'embeddings/hard-negative-mining',
    'embeddings/semantic-dedup',
  ],

  /**
   * Vector store deep-dives: pgvector, Qdrant, Weaviate, Pinecone, Milvus,
   * Elasticsearch, Redis, LanceDB, MongoDB Atlas, ChromaDB, OpenSearch, Vespa,
   * plus ANN algorithms and vector quantization.
   */
  'rag/vector-stores': [
    'vector-stores/pgvector-advanced',
    'vector-stores/qdrant-advanced',
    'vector-stores/weaviate-advanced',
    'vector-stores/elasticsearch-vectors',
    'vector-stores/pinecone-advanced',
    'vector-stores/milvus',
    'vector-stores/redis-vector',
    'vector-stores/lancedb',
    'vector-stores/mongodb-atlas-vector',
    'vector-stores/chromadb-advanced',
    'vector-stores/opensearch-knn',
    'vector-stores/vespa',
    'vector-stores/ann-algorithms',
    'vector-stores/vector-quantization',
  ],

  /**
   * Document processing: PDF, tables, OCR, code chunking, web scraping,
   * Office docs, audio, email, video, markdown.
   */
  'rag/document-processing': [
    'document-processing/pdf-extraction',
    'document-processing/unstructured-io',
    'document-processing/table-extraction',
    'document-processing/ocr',
    'document-processing/code-chunking',
    'document-processing/web-scraping',
    'document-processing/office-docs',
    'document-processing/audio-transcription',
    'document-processing/email-ingestion',
    'document-processing/video-rag',
    'document-processing/markdown-structured',
  ],

  /**
   * RAG frameworks: LlamaIndex, Haystack, DSPy, LangGraph-RAG, RAGatouille,
   * R2R, Canopy, txtai, plus the ai-integration langchain & RAG patterns.
   */
  'rag/frameworks': [
    'rag-frameworks/llamaindex',
    'rag-frameworks/haystack',
    'rag-frameworks/dspy',
    'rag-frameworks/langgraph-rag',
    'rag-frameworks/ragatouille',
    'rag-frameworks/r2r',
    'rag-frameworks/canopy',
    'rag-frameworks/txtai',
    'ai-integration/rag-patterns',
    'ai-integration/vector-databases',
    'ai-integration/langchain',
    'ai-integration/anthropic-python',
  ],

  /**
   * RAG ops / infra: TEI+Triton serving, batch inference, cost allocation,
   * multi-region, LLM gateway.
   */
  'rag/ops': [
    'rag-ops/tei-triton-serving',
    'rag-ops/batch-inference',
    'rag-ops/cost-allocation',
    'rag-ops/multi-region',
    'rag-ops/llm-gateway',
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // Sysadmin Expert bundles
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Web server & reverse proxy stack: Nginx, Caddy, Traefik, load balancer,
   * SSL/TLS, DNS, WAF.
   */
  'infra/web-server': [
    'infrastructure/nginx',
    'infrastructure/ssl-tls',
    'infrastructure/dns',
    'infrastructure/caddy',
    'infrastructure/traefik',
    'infrastructure/load-balancer',
    'infrastructure/waf',
  ],

  /**
   * Security hardening: firewall, server hardening, secrets management,
   * CORS/security headers, API security, rate limiting, OWASP Top 10,
   * audit logging, IaC security, container security, supply chain, cryptography.
   */
  'infra/security-hardening': [
    'infrastructure/firewall',
    'infrastructure/server-hardening',
    'security/secrets-management',
    'security/cors-security-headers',
    'security/api-security',
    'security/rate-limiting',
    'security/owasp-top-10',
    'security/audit-logging',
    'security/iac-security',
    'security/container-security',
    'security/supply-chain',
    'security/cryptography',
  ],

  /**
   * System services: systemd, cron scheduling, job queues.
   */
  'infra/services': [
    'infrastructure/systemd',
    'infrastructure/cron-scheduling',
    'infrastructure/job-queues',
  ],

  /**
   * Monitoring & observability: server monitoring, Prometheus/Grafana,
   * OpenTelemetry, error tracking.
   */
  'infra/monitoring': [
    'infrastructure/server-monitoring',
    'observability/opentelemetry',
    'observability/error-tracking',
  ],

  /**
   * Backup, recovery, and VPN networking: backup-recovery, WireGuard.
   */
  'infra/backup-network': [
    'infrastructure/backup-recovery',
    'infrastructure/wireguard',
  ],

  /**
   * Container orchestration & cloud IaC: Docker, Docker Compose, Kubernetes,
   * Terraform, AWS, GCP, Azure, serverless.
   */
  'infra/k8s-cloud': [
    'infrastructure/docker',
    'infrastructure/docker-compose',
    'infrastructure/kubernetes',
    'infrastructure/terraform',
    'cloud/aws',
    'cloud/gcp',
    'cloud/azure',
    'cloud/serverless',
  ],

  /**
   * Databases on the host: PostgreSQL, MySQL, MongoDB, Elasticsearch, Redis,
   * migrations, Flyway.
   */
  'infra/databases': [
    'databases/postgresql',
    'databases/mysql',
    'databases/mongodb',
    'databases/elasticsearch',
    'databases/redis',
    'databases/migrations',
    'databases/flyway',
  ],
};

/**
 * Expand a single skills entry that may be a bundle reference.
 *
 * A bundle reference has the form `bundle:<id>` (e.g. `bundle:rag/foundation`).
 * Plain skill paths (no `bundle:` prefix) are returned as-is in a one-element array.
 *
 * @param entry   Raw string from the agent's `skills:` YAML list
 * @param agentId Agent identifier used only for warning messages
 * @returns       Expanded list of skill paths (one or many)
 */
export function expandBundleEntry(entry: string, agentId: string): string[] {
  if (!entry.startsWith('bundle:')) {
    return [entry];
  }

  const bundleId = entry.slice('bundle:'.length).trim();
  const expanded = BUNDLES[bundleId];

  if (!expanded) {
    // Warn but don't throw — unknown bundle degrades gracefully to an empty
    // expansion so the rest of the agent still loads.
    console.warn(
      `[AgentsService] Unknown bundle "${bundleId}" in agent "${agentId}". ` +
        `Skipping. Add it to agent-bundles.ts if intentional.`
    );
    return [];
  }

  return expanded;
}
