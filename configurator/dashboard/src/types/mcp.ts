// SPDX-License-Identifier: MIT
/**
 * MCP Server Types for Dev-Suite Dashboard
 *
 * These types represent MCP server metadata, environment variable configurations,
 * and server management data structures.
 */

// ============================================
// MCP SERVER CATEGORY TYPES
// ============================================

/**
 * MCP server category classification
 */
export type McpServerCategory =
  | 'knowledge'
  | 'database'
  | 'infrastructure'
  | 'api'
  | 'git'
  | 'observability'
  | 'performance'
  | 'quality'
  | 'security'
  | 'integration'
  | 'general';

// ============================================
// ENVIRONMENT VARIABLE TYPES
// ============================================

/**
 * Environment variable configuration from metadata.json
 */
export interface EnvVarConfig {
  /** Environment variable name */
  name: string;
  /** Description of the variable */
  description: string;
  /** Whether the variable is required */
  required: boolean;
  /** Default value if any */
  default: string;
}

/**
 * Extended environment variable with detected values
 */
export interface EnvVarWithDetection extends EnvVarConfig {
  /** Auto-detected value from .env files */
  detectedValue?: string;
  /** Source of the detected value (e.g., 'auto-detected (.env)') */
  source?: string;
  /** Name of the MCP server that requires this variable */
  mcpServer?: string;
  /** Current user-provided value */
  value?: string;
}

// ============================================
// MCP SERVER TYPES
// ============================================

/**
 * MCP server metadata from metadata.json
 */
export interface McpServer {
  /** Server name (directory name) */
  name: string;
  /** Full description */
  description: string;
  /** Short description for UI */
  shortDescription?: string;
  /** Category classification */
  category: McpServerCategory;
  /** List of tool names provided by this server */
  tools: string[];
  /** Environment variables required by this server */
  envVars: EnvVarConfig[];
  /** Agent IDs that require this server */
  requiredFor: string[];
  /** Technologies that should trigger auto-selection */
  detectedWhen: string[];
}

/**
 * MCP server with selection state
 */
export interface McpServerWithSelection extends McpServer {
  /** Whether the server is selected */
  selected: boolean;
  /** Whether the server was auto-recommended */
  recommended: boolean;
  /** Reason for recommendation */
  recommendationReason?: string;
  /** Whether the server is built */
  built: boolean;
}

// ============================================
// MCP SERVER STATUS TYPES
// ============================================

/**
 * Build status for an MCP server
 */
export type McpBuildStatus =
  | 'not_built'
  | 'building'
  | 'built'
  | 'build_failed'
  | 'already_built'
  | 'invalid'
  | 'not_found';

/**
 * Result of preparing (building) an MCP server
 */
export interface McpPrepareResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Status of the build */
  status: McpBuildStatus;
  /** Error message if failed */
  error?: string;
}

/**
 * Result of preparing multiple MCP servers
 */
export interface McpPrepareMultipleResult {
  /** Whether all servers were prepared successfully */
  success: boolean;
  /** List of successfully prepared servers */
  prepared: string[];
  /** List of servers that failed */
  failed: string[];
  /** Detailed results per server */
  details: Record<string, McpPrepareResult>;
}

// ============================================
// MCP CONFIGURATION TYPES
// ============================================

/**
 * MCP server configuration entry in .mcp.json
 */
export interface McpJsonServerEntry {
  /** Command to run the server */
  command: string;
  /** Command arguments */
  args: string[];
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Complete .mcp.json configuration
 */
export interface McpJsonConfig {
  /** Map of server name to configuration */
  mcpServers: Record<string, McpJsonServerEntry>;
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Type guard to check if a value is a valid McpServerCategory
 */
export function isMcpServerCategory(value: unknown): value is McpServerCategory {
  return (
    typeof value === 'string' &&
    [
      'knowledge',
      'database',
      'infrastructure',
      'api',
      'git',
      'observability',
      'performance',
      'quality',
      'security',
      'integration',
      'general',
    ].includes(value)
  );
}

/**
 * Type guard to check if a value is a valid EnvVarConfig
 */
export function isEnvVarConfig(value: unknown): value is EnvVarConfig {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    typeof obj.required === 'boolean' &&
    typeof obj.default === 'string'
  );
}

/**
 * Type guard to check if a value is a valid McpServer
 */
export function isMcpServer(value: unknown): value is McpServer {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    isMcpServerCategory(obj.category) &&
    Array.isArray(obj.tools) &&
    Array.isArray(obj.envVars) &&
    Array.isArray(obj.requiredFor) &&
    Array.isArray(obj.detectedWhen)
  );
}
