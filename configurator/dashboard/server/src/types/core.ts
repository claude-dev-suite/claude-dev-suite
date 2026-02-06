// SPDX-License-Identifier: MIT
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
 * Installation manifest tracking all installed files
 */
export interface InstallManifest {
  /** Version of the manifest schema */
  version: string;
  /** Timestamp of installation */
  installedAt: string;
  /** Dev-suite version */
  devSuiteVersion: string;
  /** Relative paths of all installed files */
  files: string[];
  /** Relative paths of all created directories */
  directories: string[];
  /** Names of MCP servers installed */
  mcpServers: string[];
  /** Names of agents installed */
  agents: string[];
  /** Names of env vars added to .env */
  envVarsAdded: string[];
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
