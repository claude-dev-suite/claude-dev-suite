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
};
