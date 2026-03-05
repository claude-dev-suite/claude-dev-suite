// SPDX-License-Identifier: MIT
/**
 * Documentation index - re-exports from modular structure
 *
 * The actual documentation entries are now organized in:
 *   ./docs-index/frontend.ts      - React, Vue, UI libs, State management
 *   ./docs-index/meta-frameworks.ts - Next.js, Nuxt, SvelteKit, etc.
 *   ./docs-index/backend.ts       - Express, NestJS, Spring Boot, etc.
 *   ./docs-index/databases.ts     - PostgreSQL, MongoDB, Redis, ORMs
 *   ./docs-index/testing.ts       - Vitest, Jest, Playwright, Cypress
 *   ./docs-index/infrastructure.ts - Docker, K8s, GitHub Actions, Messaging
 *   ./docs-index/languages.ts     - TypeScript, Python, Rust, Go, Deno
 *   ./docs-index/api.ts           - GraphQL, tRPC, REST, HTTP clients
 *   ./docs-index/auth.ts          - JWT, OAuth2, NextAuth
 *   ./docs-index/desktop.ts       - Electron, Tauri
 *   ./docs-index/tooling.ts       - Biome, ESLint, Logging
 *   ./docs-index/standards.ts     - Clean code, OWASP, WCAG, JSDoc, Resilience, Caching
 *   ./docs-index/architecture.ts  - DDD, Event Sourcing/CQRS, Multitenancy
 *   ./docs-index/ai.ts            - RAG patterns, Vector databases
 *   ./docs-index/security.ts      - Cryptography, GDPR
 */

// Re-export everything for backward compatibility
export {
  SUPPORTED_TECHNOLOGIES,
  docsIndex,
  type Technology,
  type DocEntry,
  type DocsRecord,
} from "./docs-index/index.js";

// Also export individual categories for selective imports
export {
  FRONTEND_TECHNOLOGIES,
  frontendDocs,
  META_FRAMEWORK_TECHNOLOGIES,
  metaFrameworkDocs,
  BACKEND_TECHNOLOGIES,
  backendDocs,
  DATABASE_TECHNOLOGIES,
  databaseDocs,
  TESTING_TECHNOLOGIES,
  testingDocs,
  INFRASTRUCTURE_TECHNOLOGIES,
  infrastructureDocs,
  LANGUAGE_TECHNOLOGIES,
  languageDocs,
  API_TECHNOLOGIES,
  apiDocs,
  AUTH_TECHNOLOGIES,
  authDocs,
  DESKTOP_TECHNOLOGIES,
  desktopDocs,
  TOOLING_TECHNOLOGIES,
  toolingDocs,
  STANDARDS_TECHNOLOGIES,
  standardsDocs,
  ARCHITECTURE_TECHNOLOGIES,
  architectureDocs,
  AI_TECHNOLOGIES,
  aiDocs,
  SECURITY_TECHNOLOGIES,
  securityDocs,
} from "./docs-index/index.js";
