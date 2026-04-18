// SPDX-License-Identifier: MIT
/**
 * RAG (Retrieval-Augmented Generation) documentation
 * Includes: architecture, chunking, retrieval patterns, agentic RAG,
 *           graph RAG, multimodal RAG, evaluation, guardrails, security,
 *           caching, observability, production, and ingestion orchestration.
 *
 * KB layout: knowledge/rag/{technology}/{topic}.md
 */

import type { DocsRecord } from "./types.js";

export const RAG_TECHNOLOGIES = [
  // Architecture & retrieval
  "rag-architecture",
  "chunking-strategies",
  "contextual-retrieval",
  "query-transformations",
  "advanced-retrieval",
  "hybrid-search",
  "reranking",
  "rag-evaluation",
  "agentic-rag",
  // Conversational / personalization / time
  "conversational-rag",
  "streaming-rag",
  "self-querying-retriever",
  "personalization-rag",
  "time-aware-retrieval",
  "long-context-vs-rag",
  "tabular-rag",
  "feedback-loops",
  // Specialized
  "graph-rag",
  "multimodal-rag",
  "rag-guardrails",
  "rag-caching",
  "rag-security",
  "rag-production",
  "rag-observability",
  // Knowledge graph
  "entity-resolution",
  "knowledge-graph-construction",
  "ontology-guided-retrieval",
  // Evaluation frameworks
  "ares-framework",
  "giskard-rag",
  "continuous-evaluation",
  "shadow-mode-deployment",
  // Ingestion
  "ingestion-orchestration",
  "cdc-streaming-ingestion",
  "domain-templates",
] as const;

export const ragDocs: DocsRecord = {
  "rag-architecture": {
    overview: { local: "rag/rag-architecture/overview.md", url: "https://python.langchain.com/docs/concepts/rag/" },
    "decision-tree": { local: "rag/rag-architecture/decision-tree.md", url: "https://python.langchain.com/docs/concepts/rag/" },
    "latency-budgets": { local: "rag/rag-architecture/latency-budgets.md", url: "https://python.langchain.com/docs/concepts/rag/" },
    "cost-math": { local: "rag/rag-architecture/cost-math.md", url: "https://python.langchain.com/docs/concepts/rag/" },
  },
  "chunking-strategies": {
    overview: { local: "rag/chunking-strategies/overview.md", url: "https://docs.llamaindex.ai/en/stable/optimizing/production_rag/" },
    "strategies-matrix": { local: "rag/chunking-strategies/strategies-matrix.md", url: "https://docs.llamaindex.ai/en/stable/optimizing/production_rag/" },
    "semantic-chunking-deep": { local: "rag/chunking-strategies/semantic-chunking-deep.md", url: "https://docs.llamaindex.ai/en/stable/optimizing/production_rag/" },
    benchmarks: { local: "rag/chunking-strategies/benchmarks.md", url: "https://docs.llamaindex.ai/en/stable/optimizing/production_rag/" },
  },
  "contextual-retrieval": {
    overview: { local: "rag/contextual-retrieval/overview.md", url: "https://www.anthropic.com/news/contextual-retrieval" },
    "anthropic-method": { local: "rag/contextual-retrieval/anthropic-method.md", url: "https://www.anthropic.com/news/contextual-retrieval" },
    "cost-optimization": { local: "rag/contextual-retrieval/cost-optimization.md", url: "https://www.anthropic.com/news/contextual-retrieval" },
    benchmarks: { local: "rag/contextual-retrieval/benchmarks.md", url: "https://www.anthropic.com/news/contextual-retrieval" },
  },
  "query-transformations": {
    overview: { local: "rag/query-transformations/overview.md", url: "https://blog.langchain.dev/query-transformations/" },
    "hyde-deep": { local: "rag/query-transformations/hyde-deep.md", url: "https://arxiv.org/abs/2212.10496" },
    "rag-fusion-deep": { local: "rag/query-transformations/rag-fusion-deep.md", url: "https://arxiv.org/abs/2402.03367" },
    routing: { local: "rag/query-transformations/routing.md", url: "https://blog.langchain.dev/query-transformations/" },
  },
  "advanced-retrieval": {
    overview: { local: "rag/advanced-retrieval/overview.md", url: "https://docs.llamaindex.ai/en/stable/optimizing/advanced_retrieval/advanced_retrieval/" },
    "raptor-paper": { local: "rag/advanced-retrieval/raptor-paper.md", url: "https://arxiv.org/abs/2401.18059" },
    "parent-document": { local: "rag/advanced-retrieval/parent-document.md", url: "https://python.langchain.com/docs/how_to/parent_document_retriever/" },
    "auto-merging": { local: "rag/advanced-retrieval/auto-merging.md", url: "https://docs.llamaindex.ai/en/stable/optimizing/advanced_retrieval/advanced_retrieval/" },
  },
  "hybrid-search": {
    overview: { local: "rag/hybrid-search/overview.md", url: "https://weaviate.io/blog/hybrid-search-explained" },
    "rrf-deep": { local: "rag/hybrid-search/rrf-deep.md", url: "https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf" },
    "alpha-tuning": { local: "rag/hybrid-search/alpha-tuning.md", url: "https://weaviate.io/blog/hybrid-search-explained" },
  },
  reranking: {
    overview: { local: "rag/reranking/overview.md", url: "https://docs.cohere.com/docs/rerank-2" },
    "cross-encoder-theory": { local: "rag/reranking/cross-encoder-theory.md", url: "https://www.sbert.net/examples/applications/cross-encoder/README.html" },
    "providers-comparison": { local: "rag/reranking/providers-comparison.md", url: "https://docs.cohere.com/docs/rerank-2" },
    "colbert-as-reranker": { local: "rag/reranking/colbert-as-reranker.md", url: "https://github.com/stanford-futuredata/ColBERT" },
  },
  "rag-evaluation": {
    overview: { local: "rag/rag-evaluation/overview.md", url: "https://docs.ragas.io/en/stable/" },
    "ragas-deep": { local: "rag/rag-evaluation/ragas-deep.md", url: "https://docs.ragas.io/en/stable/" },
    "golden-set-construction": { local: "rag/rag-evaluation/golden-set-construction.md", url: "https://docs.ragas.io/en/stable/" },
    "synthetic-data": { local: "rag/rag-evaluation/synthetic-data.md", url: "https://docs.ragas.io/en/stable/getstarted/testset_generation/" },
  },
  "agentic-rag": {
    overview: { local: "rag/agentic-rag/overview.md", url: "https://langchain-ai.github.io/langgraph/tutorials/rag/langgraph_agentic_rag/" },
    "self-rag-paper": { local: "rag/agentic-rag/self-rag-paper.md", url: "https://arxiv.org/abs/2310.11511" },
    "crag-paper": { local: "rag/agentic-rag/crag-paper.md", url: "https://arxiv.org/abs/2401.15884" },
    "adaptive-rag": { local: "rag/agentic-rag/adaptive-rag.md", url: "https://arxiv.org/abs/2403.14403" },
  },
  "conversational-rag": {
    overview: { local: "rag/conversational-rag/overview.md", url: "https://python.langchain.com/docs/tutorials/qa_chat_history/" },
    "memory-strategies": { local: "rag/conversational-rag/memory-strategies.md", url: "https://python.langchain.com/docs/tutorials/qa_chat_history/" },
    "query-rewriting": { local: "rag/conversational-rag/query-rewriting.md", url: "https://python.langchain.com/docs/tutorials/qa_chat_history/" },
  },
  "streaming-rag": {
    overview: { local: "rag/streaming-rag/overview.md", url: "https://sdk.vercel.ai/docs/ai-sdk-ui/streaming-data" },
    implementation: { local: "rag/streaming-rag/implementation.md", url: "https://sdk.vercel.ai/docs/ai-sdk-ui/streaming-data" },
    "client-side": { local: "rag/streaming-rag/client-side.md", url: "https://sdk.vercel.ai/docs/ai-sdk-ui/streaming-data" },
  },
  "self-querying-retriever": {
    overview: { local: "rag/self-querying-retriever/overview.md", url: "https://python.langchain.com/docs/how_to/self_query/" },
    "langchain-impl": { local: "rag/self-querying-retriever/langchain-impl.md", url: "https://python.langchain.com/docs/how_to/self_query/" },
    advanced: { local: "rag/self-querying-retriever/advanced.md", url: "https://python.langchain.com/docs/how_to/self_query/" },
  },
  "personalization-rag": {
    overview: { local: "rag/personalization-rag/overview.md", url: "https://docs.mem0.ai/" },
    "memory-systems": { local: "rag/personalization-rag/memory-systems.md", url: "https://docs.mem0.ai/" },
    implementation: { local: "rag/personalization-rag/implementation.md", url: "https://docs.mem0.ai/" },
  },
  "time-aware-retrieval": {
    overview: { local: "rag/time-aware-retrieval/overview.md", url: "https://python.langchain.com/docs/how_to/time_weighted_vectorstore/" },
    "recency-weighting": { local: "rag/time-aware-retrieval/recency-weighting.md", url: "https://python.langchain.com/docs/how_to/time_weighted_vectorstore/" },
    implementation: { local: "rag/time-aware-retrieval/implementation.md", url: "https://python.langchain.com/docs/how_to/time_weighted_vectorstore/" },
  },
  "long-context-vs-rag": {
    overview: { local: "rag/long-context-vs-rag/overview.md", url: "https://www.anthropic.com/news/prompt-caching" },
    "cost-comparison": { local: "rag/long-context-vs-rag/cost-comparison.md", url: "https://www.anthropic.com/news/prompt-caching" },
    "hybrid-approaches": { local: "rag/long-context-vs-rag/hybrid-approaches.md", url: "https://www.anthropic.com/news/prompt-caching" },
  },
  "tabular-rag": {
    overview: { local: "rag/tabular-rag/overview.md", url: "https://python.langchain.com/docs/tutorials/sql_qa/" },
    nl2sql: { local: "rag/tabular-rag/nl2sql.md", url: "https://python.langchain.com/docs/tutorials/sql_qa/" },
    hybrid: { local: "rag/tabular-rag/hybrid.md", url: "https://python.langchain.com/docs/tutorials/sql_qa/" },
  },
  "feedback-loops": {
    overview: { local: "rag/feedback-loops/overview.md", url: "https://docs.smith.langchain.com/evaluation/how_to_guides/online_evaluations" },
    collection: { local: "rag/feedback-loops/collection.md", url: "https://docs.smith.langchain.com/evaluation/how_to_guides/online_evaluations" },
    retraining: { local: "rag/feedback-loops/retraining.md", url: "https://docs.smith.langchain.com/evaluation/how_to_guides/online_evaluations" },
  },
  "graph-rag": {
    overview: { local: "rag/graph-rag/overview.md", url: "https://microsoft.github.io/graphrag/" },
    "community-summarization": { local: "rag/graph-rag/community-summarization.md", url: "https://microsoft.github.io/graphrag/" },
    "neo4j-integration": { local: "rag/graph-rag/neo4j-integration.md", url: "https://microsoft.github.io/graphrag/" },
  },
  "multimodal-rag": {
    overview: { local: "rag/multimodal-rag/overview.md", url: "https://docs.voyageai.com/docs/multimodal-embeddings" },
    "vision-pipeline": { local: "rag/multimodal-rag/vision-pipeline.md", url: "https://docs.voyageai.com/docs/multimodal-embeddings" },
    "table-pipeline": { local: "rag/multimodal-rag/table-pipeline.md", url: "https://docs.voyageai.com/docs/multimodal-embeddings" },
  },
  "rag-guardrails": {
    overview: { local: "rag/rag-guardrails/overview.md", url: "https://docs.nvidia.com/nemo/guardrails/index.html" },
    implementation: { local: "rag/rag-guardrails/implementation.md", url: "https://docs.nvidia.com/nemo/guardrails/index.html" },
    "llm-as-judge": { local: "rag/rag-guardrails/llm-as-judge.md", url: "https://docs.nvidia.com/nemo/guardrails/index.html" },
  },
  "rag-caching": {
    overview: { local: "rag/rag-caching/overview.md", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching" },
    "semantic-cache": { local: "rag/rag-caching/semantic-cache.md", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching" },
    "prompt-caching": { local: "rag/rag-caching/prompt-caching.md", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching" },
  },
  "rag-security": {
    overview: { local: "rag/rag-security/overview.md", url: "https://owasp.org/www-project-top-10-for-large-language-model-applications/" },
    "indirect-injection": { local: "rag/rag-security/indirect-injection.md", url: "https://owasp.org/www-project-top-10-for-large-language-model-applications/" },
    "access-control": { local: "rag/rag-security/access-control.md", url: "https://owasp.org/www-project-top-10-for-large-language-model-applications/" },
  },
  "rag-production": {
    overview: { local: "rag/rag-production/overview.md", url: "https://www.pinecone.io/learn/production-rag/" },
    indexing: { local: "rag/rag-production/indexing.md", url: "https://www.pinecone.io/learn/production-rag/" },
    scaling: { local: "rag/rag-production/scaling.md", url: "https://www.pinecone.io/learn/production-rag/" },
  },
  "rag-observability": {
    overview: { local: "rag/rag-observability/overview.md", url: "https://opentelemetry.io/docs/specs/semconv/gen-ai/" },
    "langsmith-langfuse": { local: "rag/rag-observability/langsmith-langfuse.md", url: "https://opentelemetry.io/docs/specs/semconv/gen-ai/" },
    opentelemetry: { local: "rag/rag-observability/opentelemetry.md", url: "https://opentelemetry.io/docs/specs/semconv/gen-ai/" },
  },
  "entity-resolution": {
    overview: { local: "rag/entity-resolution/overview.md", url: "https://moj-analytical-services.github.io/splink/" },
    algorithms: { local: "rag/entity-resolution/algorithms.md", url: "https://moj-analytical-services.github.io/splink/" },
    "production-pipeline": { local: "rag/entity-resolution/production-pipeline.md", url: "https://moj-analytical-services.github.io/splink/" },
  },
  "knowledge-graph-construction": {
    overview: { local: "rag/knowledge-graph-construction/overview.md", url: "https://neo4j.com/blog/knowledge-graph-llm-fundamentals/" },
    "extraction-pipeline": { local: "rag/knowledge-graph-construction/extraction-pipeline.md", url: "https://neo4j.com/blog/knowledge-graph-llm-fundamentals/" },
    "incremental-updates": { local: "rag/knowledge-graph-construction/incremental-updates.md", url: "https://neo4j.com/blog/knowledge-graph-llm-fundamentals/" },
  },
  "ontology-guided-retrieval": {
    overview: { local: "rag/ontology-guided-retrieval/overview.md", url: "https://www.w3.org/RDF/" },
    "query-expansion": { local: "rag/ontology-guided-retrieval/query-expansion.md", url: "https://www.w3.org/RDF/" },
    implementation: { local: "rag/ontology-guided-retrieval/implementation.md", url: "https://www.w3.org/RDF/" },
  },
  "ares-framework": {
    overview: { local: "rag/ares-framework/overview.md", url: "https://github.com/stanford-futuredata/ARES" },
    "setup-guide": { local: "rag/ares-framework/setup-guide.md", url: "https://github.com/stanford-futuredata/ARES" },
    comparison: { local: "rag/ares-framework/comparison.md", url: "https://github.com/stanford-futuredata/ARES" },
  },
  "giskard-rag": {
    overview: { local: "rag/giskard-rag/overview.md", url: "https://docs.giskard.ai/en/latest/open_source/testset_generation/rag_evaluation/index.html" },
    "testset-generation": { local: "rag/giskard-rag/testset-generation.md", url: "https://docs.giskard.ai/en/latest/open_source/testset_generation/rag_evaluation/index.html" },
    "ci-integration": { local: "rag/giskard-rag/ci-integration.md", url: "https://docs.giskard.ai/en/latest/open_source/testset_generation/rag_evaluation/index.html" },
  },
  "continuous-evaluation": {
    overview: { local: "rag/continuous-evaluation/overview.md", url: "https://docs.smith.langchain.com/evaluation" },
    "github-actions": { local: "rag/continuous-evaluation/github-actions.md", url: "https://docs.smith.langchain.com/evaluation" },
    monitoring: { local: "rag/continuous-evaluation/monitoring.md", url: "https://docs.smith.langchain.com/evaluation" },
  },
  "shadow-mode-deployment": {
    overview: { local: "rag/shadow-mode-deployment/overview.md", url: "https://launchdarkly.com/blog/shadow-deployments/" },
    "dual-execution": { local: "rag/shadow-mode-deployment/dual-execution.md", url: "https://launchdarkly.com/blog/shadow-deployments/" },
    "gradual-rollout": { local: "rag/shadow-mode-deployment/gradual-rollout.md", url: "https://launchdarkly.com/blog/shadow-deployments/" },
  },
  "ingestion-orchestration": {
    overview: { local: "rag/ingestion-orchestration/overview.md", url: "https://docs.prefect.io/v3/" },
    "prefect-pipeline": { local: "rag/ingestion-orchestration/prefect-pipeline.md", url: "https://docs.prefect.io/v3/" },
    monitoring: { local: "rag/ingestion-orchestration/monitoring.md", url: "https://docs.prefect.io/v3/" },
  },
  "cdc-streaming-ingestion": {
    overview: { local: "rag/cdc-streaming-ingestion/overview.md", url: "https://debezium.io/documentation/reference/stable/" },
    "debezium-kafka": { local: "rag/cdc-streaming-ingestion/debezium-kafka.md", url: "https://debezium.io/documentation/reference/stable/" },
    "exactly-once": { local: "rag/cdc-streaming-ingestion/exactly-once.md", url: "https://debezium.io/documentation/reference/stable/" },
  },
  "domain-templates": {
    overview: { local: "rag/domain-templates/overview.md", url: "https://github.com/langchain-ai/langchain/tree/master/templates" },
    "customer-support": { local: "rag/domain-templates/customer-support.md", url: "https://github.com/langchain-ai/langchain/tree/master/templates" },
    "legal-medical-financial": { local: "rag/domain-templates/legal-medical-financial.md", url: "https://github.com/langchain-ai/langchain/tree/master/templates" },
  },
};
