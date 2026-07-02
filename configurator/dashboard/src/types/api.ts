// SPDX-License-Identifier: MIT
// KEPT IN SYNC with configurator/dashboard/{src,server/src}/types/api.ts — verified by scripts/check-type-sync.mjs
/**
 * API Response Types for Dev-Suite Dashboard
 *
 * These types represent all API endpoint request and response structures
 * for communication between the frontend and backend.
 */

import type {
  StackInfo,
  FrameworkInfo,
  DatabaseInfo,
  TestingInfo,
  EnvironmentMap,
  GitRepoInfo,
  InstallManifest,
  DevSuiteConfig,
} from './core';

import type { Agent, AgentRecommendations } from './agents';

import type {
  McpServer,
  McpPrepareMultipleResult,
  EnvVarWithDetection,
} from './mcp';

// ============================================
// GENERIC API RESPONSE TYPES
// ============================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  /** Whether the request succeeded */
  success: boolean;
  /** Response data (present on success) */
  data?: T;
  /** Error message (present on failure) */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: string;
}

/**
 * Paginated API response
 */
export interface PaginatedResponse<T> {
  /** Items for current page */
  items: T[];
  /** Total number of items */
  total: number;
  /** Current page number (1-indexed) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Total number of pages */
  totalPages: number;
}

// ============================================
// SECURITY TOKEN TYPES
// ============================================

/**
 * Security tokens response
 * Note: CSRF protection is not needed for localhost-only tools
 */
export interface SecurityTokensResponse {
  /** WebSocket authentication token */
  wsToken: string;
  /** WebSocket server port */
  wsPort: number;
}

// ============================================
// DETECTION ENDPOINT TYPES
// ============================================

/**
 * Detection API response
 * GET /api/detect
 */
export interface DetectionResponse {
  /** Detected project type */
  project_type: string;
  /** Frontend framework info */
  frontend?: FrameworkInfo;
  /** Backend framework info */
  backend?: FrameworkInfo;
  /** Database info */
  database?: DatabaseInfo;
  /** Testing framework info */
  testing?: TestingInfo;
  /** Whether project is a monorepo */
  is_monorepo: boolean;
  /** Detection confidence (0-100) */
  confidence: number;
}

/**
 * Environment detection API response
 * GET /api/environments
 */
export interface EnvironmentsResponse {
  /** Map of environment name to info */
  environments: EnvironmentMap;
}

/**
 * Git repos detection API response
 * GET /api/git-repos
 */
export interface GitReposResponse {
  /** List of detected git repositories */
  repos: GitRepoInfo[];
}

/**
 * Recommendations API response
 * GET /api/recommendations
 */
export interface RecommendationsResponse extends AgentRecommendations {
  /** Detected stack info */
  stack: StackInfo;
}

// ============================================
// AGENTS ENDPOINT TYPES
// ============================================

/**
 * Agents list API response
 * GET /api/agents
 */
export interface AgentsResponse {
  /** List of available agents */
  agents: Agent[];
}

/**
 * MCP servers list API response
 * GET /api/mcp-servers
 */
export interface McpServersResponse {
  /** List of available MCP servers */
  servers: McpServer[];
}

/**
 * Environment variables API request
 * POST /api/env-vars
 */
export interface EnvVarsRequest {
  /** List of MCP server names */
  serverNames: string[];
  /** Project path for detection */
  projectPath: string;
  /** Selected environment name */
  selectedEnv?: string;
}

/**
 * Environment variables API response
 * POST /api/env-vars
 */
export interface EnvVarsResponse {
  /** List of environment variables with detection info */
  envVars: EnvVarWithDetection[];
}

// ============================================
// INSTALLATION ENDPOINT TYPES
// ============================================

/**
 * Prepare servers API request
 * POST /api/prepare-servers
 */
export interface PrepareServersRequest {
  /** List of server names to prepare */
  serverNames: string[];
}

/**
 * Prepare servers API response
 * POST /api/prepare-servers
 */
export interface PrepareServersResponse extends McpPrepareMultipleResult {
  /** Optional message */
  message?: string;
}

/**
 * Installation configuration request
 * POST /api/install
 */
export interface InstallRequest {
  /** Target project path */
  projectPath: string;
  /** Selected agent IDs */
  agents: string[];
  /** Selected MCP server names */
  mcpServers: string[];
  /** Environment variable values */
  envVars: Record<string, string>;
  /** Detected stack info */
  stack?: StackInfo;
}

/**
 * Installation API response
 * POST /api/install
 */
export interface InstallationResponse {
  /** Whether installation succeeded */
  success: boolean;
  /** Installation output log */
  output?: string;
  /** Error message if failed */
  error?: string;
  /** Installation manifest */
  manifest?: InstallManifest;
  /** Summary message */
  summary?: string;
}

/**
 * Installation status API response
 * GET /api/install-status
 */
export interface InstallStatusResponse {
  /** Whether installation is in progress */
  installing: boolean;
  /** Current step description */
  currentStep?: string;
  /** Progress percentage (0-100) */
  progress?: number;
  /** List of completed steps */
  completedSteps?: string[];
}

/**
 * Uninstall API response
 * POST /api/uninstall
 */
export interface UninstallResponse {
  /** Whether uninstall succeeded */
  success: boolean;
  /** Details of what was removed */
  removed: {
    files: string[];
    directories: string[];
    envVars: string[];
    preserved: string[];
  };
  /** List of errors encountered */
  errors?: string[];
  /** Summary message */
  summary: string;
}

// ============================================
// MANAGEMENT ENDPOINT TYPES
// ============================================

/**
 * Installed components API response
 * GET /api/installed-components
 */
export interface InstalledComponentsResponse {
  /** Whether dev-suite is installed */
  installed: boolean;
  /** Dev-suite configuration */
  config?: DevSuiteConfig;
  /** List of installed agent IDs */
  agents: string[];
  /** List of installed MCP server names */
  mcpServers: string[];
  /** Installation manifest */
  manifest?: InstallManifest;
}

/**
 * New component discovered since project installation
 */
export interface NewComponent {
  id: string;
  name: string;
  description: string;
  category: string;
}

/**
 * New components API response
 * GET /api/management/new-components
 */
export interface NewComponentsResponse {
  newAgents: NewComponent[];
  newMcpServers: NewComponent[];
}

/**
 * Add agent API request
 * POST /api/add-agent
 */
export interface AddAgentRequest {
  /** Agent ID to add */
  agentId: string;
  /** Target project path */
  projectPath: string;
}

/**
 * Remove agent API request
 * POST /api/remove-agent
 */
export interface RemoveAgentRequest {
  /** Agent ID to remove */
  agentId: string;
  /** Target project path */
  projectPath: string;
}

/**
 * Add MCP server API request
 * POST /api/add-mcp-server
 */
export interface AddMcpServerRequest {
  /** Server name to add */
  serverName: string;
  /** Target project path */
  projectPath: string;
  /** Environment variable values */
  envVars?: Record<string, string>;
}

/**
 * Remove MCP server API request
 * POST /api/remove-mcp-server
 */
export interface RemoveMcpServerRequest {
  /** Server name to remove */
  serverName: string;
  /** Target project path */
  projectPath: string;
}

/**
 * Generic component operation response
 */
export interface ComponentOperationResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Message describing result */
  message: string;
  /** Error message if failed */
  error?: string;
}

// ============================================
// HOOKS ENDPOINT TYPES
// ============================================

/**
 * Hook type classification
 */
export type HookType =
  | 'pre-commit'
  | 'prepare-commit-msg'
  | 'commit-msg'
  | 'post-commit'
  | 'pre-merge-commit'
  | 'pre-push'
  | 'post-merge'
  | 'post-checkout';

/**
 * Hook action
 */
export type HookAction = 'format' | 'lint' | 'test' | 'build' | 'custom';

/**
 * Hook configuration
 */
export interface HookConfig {
  /** Hook type */
  type: HookType;
  /** Actions to run */
  actions: HookAction[];
  /** Custom command (if action is 'custom') */
  customCommand?: string;
  /** Whether hook is enabled */
  enabled: boolean;
}

/**
 * Hooks status API response
 * GET /api/hooks/status
 */
export interface HooksStatusResponse {
  /** Whether Husky is detected */
  huskyDetected: boolean;
  /** Installed hooks */
  installedHooks: HookConfig[];
  /** Available hooks to install */
  availableHooks: HookType[];
}

/**
 * Install hooks API request
 * POST /api/hooks/install
 */
export interface InstallHooksRequest {
  /** Target project path */
  projectPath: string;
  /** Hooks to install */
  hooks: HookConfig[];
}

// ============================================
// CLAUDE HOOKS ENDPOINT TYPES
// ============================================

/**
 * Claude hook event type
 */
export type ClaudeHookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'Notification'
  | 'Stop';

/**
 * Claude hook configuration
 */
export interface ClaudeHookConfig {
  /** Hook matcher (tool name or pattern) */
  matcher: string;
  /** Hooks for each event type */
  hooks: Partial<Record<ClaudeHookEvent, ClaudeHookAction[]>>;
}

/**
 * Claude hook action
 */
export interface ClaudeHookAction {
  /** Action type */
  type: 'command' | 'mcp';
  /** Command or MCP tool to execute */
  command: string;
}

/**
 * Prompt hook configuration (for SubagentStop with prompt-based decision)
 */
export interface ClaudePromptHook {
  type: 'prompt';
  prompt: string;
  timeout?: number;
}

/**
 * Hook command - can be a string (shell command) or a prompt hook object
 */
export type ClaudeHookCommand = string | ClaudePromptHook;

/**
 * Claude hook as returned by the API for UI display
 * This is the parsed format from the backend's parseClaudeHooksForUI
 */
export interface ClaudeHookUI {
  /** Unique ID (format: "Event-index", e.g., "PreToolUse-0") */
  id: string;
  /** Event type */
  event: string;
  /** Matcher pattern (tool name or regex) */
  matcher: string;
  /** Commands to execute - can be strings or prompt hook objects */
  commands: ClaudeHookCommand[];
  /** Optional timeout in milliseconds */
  timeout?: number;
}

/**
 * Claude hooks status API response
 * GET /api/claude-hooks/status
 */
export interface ClaudeHooksStatusResponse {
  /** Whether claude hooks are configured */
  configured: boolean;
  /** Current hooks configuration (UI format) */
  hooks: ClaudeHookUI[];
  /** Available templates */
  templates: ClaudeHookTemplate[];
}

/**
 * Claude hook template
 */
export interface ClaudeHookTemplate {
  /** Template ID */
  id: string;
  /** Template name */
  name: string;
  /** Template description */
  description: string;
  /** Hooks this template provides */
  hooks: ClaudeHookConfig[];
}

// ============================================
// CODE REVIEW ENDPOINT TYPES
// ============================================

/**
 * Code review scope
 */
export type ReviewScope = 'uncommitted' | 'full-project' | 'custom';

/**
 * Code review type
 */
export type ReviewType =
  | 'security'
  | 'performance'
  | 'quality'
  | 'accessibility'
  | 'best-practices'
  | 'documentation';

/**
 * Code review options
 */
export interface CodeReviewOptions {
  /** Review scope */
  scope: ReviewScope;
  /** Review types to perform */
  reviewTypes: ReviewType[];
  /** Files to review (for custom scope) */
  files?: string[];
  /** Repository path (for multi-repo) */
  repoPath?: string;
}

/**
 * Code review files API response
 * GET /api/code-review/files
 */
export interface CodeReviewFilesResponse {
  /** File tree structure */
  tree: FileTreeNode[];
  /** Total file count */
  totalFiles: number;
}

/**
 * File tree node
 */
export interface FileTreeNode {
  /** Node name (file or directory name) */
  name: string;
  /** Full path relative to project root */
  path: string;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** Children nodes (for directories) */
  children?: FileTreeNode[];
}

/**
 * Start code review API request
 * POST /api/code-review/start
 */
export interface StartCodeReviewRequest {
  /** Target project path */
  projectPath: string;
  /** Review options */
  options: CodeReviewOptions;
}

// ============================================
// ANALYTICS ENDPOINT TYPES
// ============================================

/**
 * KB usage entry
 */
export interface KBUsageEntry {
  /** Technology name */
  technology: string;
  /** File path fetched */
  filePath: string;
  /** Tool that requested the file */
  tool: string;
  /** Timestamp */
  timestamp: string;
  /** Whether fetch was successful */
  success: boolean;
  /** Optional job ID */
  jobId?: string;
}

/**
 * KB usage stats
 */
export interface KBUsageStats {
  /** Total requests */
  totalRequests: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Usage by technology */
  byTechnology: Record<string, number>;
  /** Usage by tool */
  byTool: Record<string, number>;
  /** Usage over time */
  timeline: TimelineEntry[];
}

/**
 * Timeline entry for analytics
 */
export interface TimelineEntry {
  /** Date string (YYYY-MM-DD) */
  date: string;
  /** Count for that date */
  count: number;
}

/**
 * KB usage API request
 * GET /api/analytics/kb-usage
 */
export interface KBUsageRequest {
  /** Filter by technology */
  technology?: string;
  /** Filter by tool */
  tool?: string;
  /** Start date (ISO string) */
  startDate?: string;
  /** End date (ISO string) */
  endDate?: string;
  /** Page number */
  page?: number;
  /** Page size */
  pageSize?: number;
}

/**
 * KB usage API response
 * GET /api/analytics/kb-usage
 */
export interface KBUsageResponse extends PaginatedResponse<KBUsageEntry> {
  /** Stats summary */
  stats: KBUsageStats;
}

// ============================================
// TOKEN USAGE ANALYTICS TYPES (opt-in)
// ============================================

/**
 * A single token-usage event (mirrors backend TokenUsageEntry).
 * No prompt content is stored — only counts and metadata.
 */
export interface TokenUsageEntry {
  id: string;
  timestamp: string;
  agentId?: string;
  skillPath?: string;
  mcpTool?: string;
  sessionId?: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd?: number;
  model?: string;
  success: boolean;
  durationMs?: number;
}

/**
 * Aggregated row returned by GET /api/analytics/token-usage/aggregate
 */
export interface TokenAggregatedRow {
  key: string;
  totalTokens: number;
  totalCostUsd: number;
  callCount: number;
  avgTokensPerCall: number;
}

// ============================================
// CHECK UPDATES ENDPOINT TYPES
// ============================================

/**
 * Check updates API response
 * GET /api/check-updates
 */
export interface CheckUpdatesResponse {
  /** Whether updates are available */
  hasUpdates: boolean;
  /** Current version */
  currentVersion: string;
  /** Latest available version */
  latestVersion: string;
  /** Changelog summary */
  changelog?: string;
}

/**
 * Pull updates API response
 * POST /api/pull-updates
 */
export interface PullUpdatesResponse {
  /** Whether update succeeded */
  success: boolean;
  /** Updated version */
  version: string;
  /** Update summary */
  summary: string;
  /** List of changes */
  changes?: string[];
  /** Error if failed */
  error?: string;
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Type guard for ApiResponse
 */
export function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.success === 'boolean';
}

/**
 * Type guard for DetectionResponse
 */
export function isDetectionResponse(value: unknown): value is DetectionResponse {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.project_type === 'string' &&
    typeof obj.is_monorepo === 'boolean' &&
    typeof obj.confidence === 'number'
  );
}

/**
 * Type guard for InstallationResponse
 */
export function isInstallationResponse(value: unknown): value is InstallationResponse {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.success === 'boolean';
}
