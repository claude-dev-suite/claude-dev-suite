// SPDX-License-Identifier: MIT
/**
 * Documentation index - aggregates all technology categories
 *
 * This module re-exports all documentation entries organized by category
 * and provides combined SUPPORTED_TECHNOLOGIES and docsIndex for backward compatibility.
 */

// Re-export types
export type { DocEntry, DocsRecord } from "./types.js";

// Import all categories
import { FRONTEND_TECHNOLOGIES, frontendDocs } from "./frontend.js";
import { META_FRAMEWORK_TECHNOLOGIES, metaFrameworkDocs } from "./meta-frameworks.js";
import { BACKEND_TECHNOLOGIES, backendDocs } from "./backend.js";
import { DATABASE_TECHNOLOGIES, databaseDocs } from "./databases.js";
import { TESTING_TECHNOLOGIES, testingDocs } from "./testing.js";
import { INFRASTRUCTURE_TECHNOLOGIES, infrastructureDocs } from "./infrastructure.js";
import { LANGUAGE_TECHNOLOGIES, languageDocs } from "./languages.js";
import { API_TECHNOLOGIES, apiDocs } from "./api.js";
import { AUTH_TECHNOLOGIES, authDocs } from "./auth.js";
import { DESKTOP_TECHNOLOGIES, desktopDocs } from "./desktop.js";
import { TOOLING_TECHNOLOGIES, toolingDocs } from "./tooling.js";
import { STANDARDS_TECHNOLOGIES, standardsDocs } from "./standards.js";
import { OBSERVABILITY_TECHNOLOGIES, observabilityDocs } from "./observability.js";
import { ARCHITECTURE_TECHNOLOGIES, architectureDocs } from "./architecture.js";
import { AI_TECHNOLOGIES, aiDocs } from "./ai.js";
import { SECURITY_TECHNOLOGIES, securityDocs } from "./security.js";
import { UX_TECHNOLOGIES, uxDocs } from "./ux.js";
// RAG-expert categories
import { RAG_TECHNOLOGIES, ragDocs } from "./rag.js";
import { RETRIEVAL_TECHNOLOGIES, retrievalDocs } from "./retrieval.js";
import { EMBEDDINGS_TECHNOLOGIES, embeddingsDocs } from "./embeddings.js";
import { VECTOR_STORES_TECHNOLOGIES, vectorStoresDocs } from "./vector-stores.js";
import { DOCUMENT_PROCESSING_TECHNOLOGIES, documentProcessingDocs } from "./document-processing.js";
import { RAG_FRAMEWORKS_TECHNOLOGIES, ragFrameworksDocs } from "./rag-frameworks.js";
import { RAG_OPS_TECHNOLOGIES, ragOpsDocs } from "./rag-ops.js";

// Re-export individual category modules
export { FRONTEND_TECHNOLOGIES, frontendDocs } from "./frontend.js";
export { META_FRAMEWORK_TECHNOLOGIES, metaFrameworkDocs } from "./meta-frameworks.js";
export { BACKEND_TECHNOLOGIES, backendDocs } from "./backend.js";
export { DATABASE_TECHNOLOGIES, databaseDocs } from "./databases.js";
export { TESTING_TECHNOLOGIES, testingDocs } from "./testing.js";
export { INFRASTRUCTURE_TECHNOLOGIES, infrastructureDocs } from "./infrastructure.js";
export { LANGUAGE_TECHNOLOGIES, languageDocs } from "./languages.js";
export { API_TECHNOLOGIES, apiDocs } from "./api.js";
export { AUTH_TECHNOLOGIES, authDocs } from "./auth.js";
export { DESKTOP_TECHNOLOGIES, desktopDocs } from "./desktop.js";
export { TOOLING_TECHNOLOGIES, toolingDocs } from "./tooling.js";
export { STANDARDS_TECHNOLOGIES, standardsDocs } from "./standards.js";
export { OBSERVABILITY_TECHNOLOGIES, observabilityDocs } from "./observability.js";
export { ARCHITECTURE_TECHNOLOGIES, architectureDocs } from "./architecture.js";
export { AI_TECHNOLOGIES, aiDocs } from "./ai.js";
export { SECURITY_TECHNOLOGIES, securityDocs } from "./security.js";
export { UX_TECHNOLOGIES, uxDocs } from "./ux.js";
// RAG-expert categories
export { RAG_TECHNOLOGIES, ragDocs } from "./rag.js";
export { RETRIEVAL_TECHNOLOGIES, retrievalDocs } from "./retrieval.js";
export { EMBEDDINGS_TECHNOLOGIES, embeddingsDocs } from "./embeddings.js";
export { VECTOR_STORES_TECHNOLOGIES, vectorStoresDocs } from "./vector-stores.js";
export { DOCUMENT_PROCESSING_TECHNOLOGIES, documentProcessingDocs } from "./document-processing.js";
export { RAG_FRAMEWORKS_TECHNOLOGIES, ragFrameworksDocs } from "./rag-frameworks.js";
export { RAG_OPS_TECHNOLOGIES, ragOpsDocs } from "./rag-ops.js";

/**
 * Combined list of all supported technologies
 * Maintains backward compatibility with the original docs-index.ts
 */
export const SUPPORTED_TECHNOLOGIES = [
  ...FRONTEND_TECHNOLOGIES,
  ...META_FRAMEWORK_TECHNOLOGIES,
  ...DESKTOP_TECHNOLOGIES,
  ...BACKEND_TECHNOLOGIES,
  ...DATABASE_TECHNOLOGIES,
  ...API_TECHNOLOGIES,
  ...AUTH_TECHNOLOGIES,
  ...TESTING_TECHNOLOGIES,
  ...INFRASTRUCTURE_TECHNOLOGIES,
  ...TOOLING_TECHNOLOGIES,
  ...STANDARDS_TECHNOLOGIES,
  ...LANGUAGE_TECHNOLOGIES,
  ...OBSERVABILITY_TECHNOLOGIES,
  ...ARCHITECTURE_TECHNOLOGIES,
  ...AI_TECHNOLOGIES,
  ...SECURITY_TECHNOLOGIES,
  ...UX_TECHNOLOGIES,
  // RAG-expert
  ...RAG_TECHNOLOGIES,
  ...RETRIEVAL_TECHNOLOGIES,
  ...EMBEDDINGS_TECHNOLOGIES,
  ...VECTOR_STORES_TECHNOLOGIES,
  ...DOCUMENT_PROCESSING_TECHNOLOGIES,
  ...RAG_FRAMEWORKS_TECHNOLOGIES,
  ...RAG_OPS_TECHNOLOGIES,
] as const;

export type Technology = (typeof SUPPORTED_TECHNOLOGIES)[number];

/**
 * Combined documentation index
 * Merges all category docs into a single record for backward compatibility
 */
export const docsIndex: Record<string, Record<string, { local: string; url: string }>> = {
  ...frontendDocs,
  ...metaFrameworkDocs,
  ...desktopDocs,
  ...backendDocs,
  ...databaseDocs,
  ...apiDocs,
  ...authDocs,
  ...testingDocs,
  ...infrastructureDocs,
  ...toolingDocs,
  ...standardsDocs,
  ...languageDocs,
  ...observabilityDocs,
  ...architectureDocs,
  ...aiDocs,
  ...securityDocs,
  ...uxDocs,
  // RAG-expert
  ...ragDocs,
  ...retrievalDocs,
  ...embeddingsDocs,
  ...vectorStoresDocs,
  ...documentProcessingDocs,
  ...ragFrameworksDocs,
  ...ragOpsDocs,
};

/**
 * Category-to-technologies mapping for list_docs filtering
 */
export const CATEGORY_MAP: Record<string, readonly string[]> = {
  frontend: FRONTEND_TECHNOLOGIES,
  "meta-frameworks": META_FRAMEWORK_TECHNOLOGIES,
  backend: BACKEND_TECHNOLOGIES,
  databases: DATABASE_TECHNOLOGIES,
  testing: TESTING_TECHNOLOGIES,
  infrastructure: INFRASTRUCTURE_TECHNOLOGIES,
  languages: LANGUAGE_TECHNOLOGIES,
  api: API_TECHNOLOGIES,
  auth: AUTH_TECHNOLOGIES,
  desktop: DESKTOP_TECHNOLOGIES,
  tooling: TOOLING_TECHNOLOGIES,
  standards: STANDARDS_TECHNOLOGIES,
  observability: OBSERVABILITY_TECHNOLOGIES,
  architecture: ARCHITECTURE_TECHNOLOGIES,
  ai: AI_TECHNOLOGIES,
  security: SECURITY_TECHNOLOGIES,
  ux: UX_TECHNOLOGIES,
  rag: RAG_TECHNOLOGIES,
  retrieval: RETRIEVAL_TECHNOLOGIES,
  embeddings: EMBEDDINGS_TECHNOLOGIES,
  "vector-stores": VECTOR_STORES_TECHNOLOGIES,
  "document-processing": DOCUMENT_PROCESSING_TECHNOLOGIES,
  "rag-frameworks": RAG_FRAMEWORKS_TECHNOLOGIES,
  "rag-ops": RAG_OPS_TECHNOLOGIES,
};
