// SPDX-License-Identifier: MIT
// KEPT IN SYNC with configurator/dashboard/{src,server/src}/types/core.ts — verified by scripts/check-type-sync.mjs
/**
 * Core Types for Dev-Suite Dashboard
 *
 * These types represent the fundamental data structures used throughout
 * the dashboard for project detection, configuration, and stack information.
 */

// ============================================
// PROJECT TYPES
// ============================================

/**
 * Project type classification based on detected technologies
 */
export type ProjectType = 'frontend' | 'backend' | 'fullstack' | 'monorepo' | 'unknown';

/**
 * Main project configuration containing all detected information
 */
export interface ProjectConfig {
  /** Absolute path to the project */
  path: string;
  /** Detected technology stack */
  stack: StackInfo;
  /** Whether the project is a monorepo */
  isMonorepo: boolean;
  /** Detection confidence score (0-100) */
  confidence: number;
}

// ============================================
// STACK TYPES
// ============================================

/**
 * Complete stack information for a project
 */
export interface StackInfo {
  /** Frontend framework information */
  frontend?: FrameworkInfo;
  /** Backend framework information */
  backend?: FrameworkInfo;
  /** Database information */
  database?: DatabaseInfo;
  /** Testing framework information */
  testing?: TestingInfo;
  /** Classified project type */
  projectType: ProjectType;
}

/**
 * Framework detection result
 */
export interface FrameworkInfo {
  /** Primary framework name (e.g., 'react', 'vue', 'spring-boot') */
  framework: string;
  /** Meta-framework if applicable (e.g., 'nextjs', 'nuxt') */
  meta_framework?: string;
  /** Runtime environment (e.g., 'nodejs', 'bun', 'deno', 'jvm') */
  runtime?: string;
}

/**
 * Database detection result
 */
export interface DatabaseInfo {
  /** Database type (e.g., 'postgresql', 'mysql', 'mongodb') */
  db_type: string;
  /** ORM/ODM in use (e.g., 'prisma', 'drizzle', 'typeorm') */
  orm?: string;
}

/**
 * Testing framework detection result
 */
export interface TestingInfo {
  /** Unit testing framework (e.g., 'vitest', 'jest', 'junit') */
  unit?: string;
  /** E2E testing framework (e.g., 'playwright', 'cypress') */
  e2e?: string;
}

// ============================================
// ENVIRONMENT TYPES
// ============================================

/**
 * Detected environment file with database URL
 */
export interface EnvironmentInfo {
  /** Environment name (e.g., 'default', 'development', 'production') */
  name: string;
  /** Display label */
  label: string;
  /** Constructed or detected database URL */
  database_url: string;
  /** Relative path to the source .env file */
  source: string;
}

/**
 * Map of environment name to environment info
 */
export type EnvironmentMap = Record<string, EnvironmentInfo>;

// ============================================
// GIT REPOSITORY TYPES
// ============================================

/**
 * Detected Git repository information
 */
export interface GitRepoInfo {
  /** Relative path from project root (. for root) */
  path: string;
  /** Repository name (from remote URL or directory name) */
  name: string;
  /** Current branch name */
  branch: string | null;
  /** Remote name (e.g., 'origin') */
  remote: string | null;
  /** Remote URL */
  remoteUrl: string | null;
}

// ============================================
// INSTALLATION TYPES
// ============================================

/**
 * Installation manifest, exactly as `POST /api/install` returns it.
 *
 * KEPT IN STEP WITH the service's `InstallManifest` (server/src/types.ts), which
 * is what the route actually serialises. This declaration used to describe a
 * different object entirely — `files: string[]`, plus `directories`,
 * `devSuiteVersion` and `envVarsAdded` fields no service has ever produced — so
 * `manifest.skipped` never reached the UI and `check-type-sync` kept two copies
 * of a fiction perfectly in sync with each other. A contract test now asserts
 * this against a real install result.
 */
export interface InstallManifest {
  /** Version of the manifest schema */
  version: string;
  /** Timestamp of installation */
  installedAt: string;
  /** Absolute path of the project this was installed into */
  projectPath: string;
  /** Names of agents installed */
  agents: string[];
  /** Names of MCP servers installed */
  mcpServers: string[];
  /** Ids of rule templates installed */
  rules: string[];
  /** Every file written, with its kind and origin */
  files: InstalledFile[];
  /**
   * Capabilities an assistant could not receive, with the reason.
   *
   * The install pipeline reports controlled degradation here — Cline has no
   * project MCP config, Codex and Gemini have no glob-activated rules — but the
   * field was absent from this contract, so the whole mechanism stopped one
   * layer short of the user. Optional: only present when something was skipped.
   */
  skipped?: InstallSkippedCapability[];
}

/**
 * One file recorded by an install.
 *
 * MIRRORS server/src/types.ts::InstalledFile.
 */
export interface InstalledFile {
  /** Project-relative path, POSIX separators */
  path: string;
  /** What kind of artifact this is */
  type: string;
  /** Where the content came from: an absolute source path, or 'generated' */
  source: string;
}

/**
 * One primitive an assistant could not receive during an install.
 */
export interface InstallSkippedCapability {
  /** Target assistant id, e.g. `cline`, `codex`. */
  target: string;
  /** Primitive name, e.g. `mcp`, `rule-templates`, `native-agents`. */
  capability: string;
  /** Human-readable explanation, surfaced to the user. */
  reason: string;
}

/**
 * Dev-suite configuration stored in .dev-suite.json
 */
export interface DevSuiteConfig {
  /** Configuration version */
  version: string;
  /** Installation timestamp */
  installedAt: string;
  /** Detected project stack */
  stack: StackInfo;
  /** Selected agent IDs */
  selectedAgents: string[];
  /** Selected MCP server names */
  selectedMcpServers: string[];
  /** Environment variable configurations */
  envVars: Record<string, string>;
  /** Additional metadata */
  metadata?: {
    detectedFrameworks?: string[];
    monorepoType?: string;
  };
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Type guard to check if a value is a valid ProjectType
 */
export function isProjectType(value: unknown): value is ProjectType {
  return (
    typeof value === 'string' &&
    ['frontend', 'backend', 'fullstack', 'monorepo', 'unknown'].includes(value)
  );
}

/**
 * Type guard to check if a value is a valid FrameworkInfo
 */
export function isFrameworkInfo(value: unknown): value is FrameworkInfo {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.framework === 'string';
}

/**
 * Type guard to check if a value is a valid DatabaseInfo
 */
export function isDatabaseInfo(value: unknown): value is DatabaseInfo {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.db_type === 'string';
}

/**
 * Type guard to check if a value is a valid StackInfo
 */
export function isStackInfo(value: unknown): value is StackInfo {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return isProjectType(obj.projectType);
}
