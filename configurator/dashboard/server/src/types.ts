// SPDX-License-Identifier: MIT
/**
 * Shared types for the dashboard server
 */

// API Response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Detection types
export interface DetectionResult {
  projectType: string;
  frontend?: FrameworkInfo;
  backend?: FrameworkInfo;
  database?: DatabaseInfo;
  testing?: TestingInfo;
  additionalTechnologies?: string[];
  isMonorepo: boolean;
  confidence: number;
  gitProvider?: GitProviderInfo;
}

export interface FrameworkInfo {
  framework?: string;
  metaFramework?: string;
  runtime?: string;
  version?: string;
}

export interface DatabaseInfo {
  dbType?: string;
  orm?: string;
  version?: string;
}

export interface TestingInfo {
  unit?: string;
  e2e?: string;
}

export interface GitProviderInfo {
  provider: 'github' | 'gitlab' | 'bitbucket' | 'azure' | 'unknown';
  remoteUrl?: string;
}

// Agent types
export interface Agent {
  id: string;
  name: string;
  description: string;
  category: AgentCategory;
  /** Union of coreSkills + extendedSkills (deduplicated, bundle-expanded). Kept for backward compat with consumers that don't distinguish tiers. */
  skills: string[];
  /** Skills always preloaded under `.claude/skills/` in lazy mode (Level 1 budget). If the agent declares only legacy `skills:`, that list populates `coreSkills`. */
  coreSkills: string[];
  /** Skills not preloaded — accessible on-demand via `skill-loader` MCP server (`list_skills` / `load_skill`). Empty unless the agent uses the new `core_skills:` / `extended_skills:` schema. */
  extendedSkills: string[];
  mcpServers: string[];
  filePath: string;
}

export type AgentCategory =
  | 'core'
  | 'frontend'
  | 'backend'
  | 'database'
  | 'testing'
  | 'infrastructure'
  | 'messaging'
  | 'security'
  | 'quality';

// MCP Server types
export interface McpServer {
  name: string;
  description: string;
  shortDescription?: string;
  category: string;
  tools: string[];
  envVars: EnvVarConfig[];
  recommendedFor: string[];
  detectedWhen: string[];
  path: string;
  /** Built-in capability of dev-suite: always installed, hidden from the wizard checkbox. Used for `skill-loader` so agents can always reach the MCP-side skill catalog. */
  isDefault?: boolean;
}

export interface EnvVarConfig {
  name: string;
  description: string;
  required: boolean;
  default: string;
  detectedValue?: string;
  source?: string;
  mcpServer?: string;
}

// Installation types
export interface InstallConfig {
  projectPath: string;
  agents: string[];
  mcpServers: string[];
  envVars: Record<string, string>;
  rules?: string[];
  detectedStack?: DetectionResult;
  /**
   * Controls how skill files are delivered to the target project.
   *
   * - `'lazy'` (default when `skill-loader` is installed, which now happens
   *   automatically): copy only each agent's `core_skills:` (or legacy
   *   `skills:` for unmigrated agents) under flattened native names
   *   (`.claude/skills/<flat-name>/SKILL.md`) so Claude Code auto-discovers
   *   them and loads only descriptions at boot — bodies stay on demand.
   *   `extended_skills:` and the wider dev-suite catalog remain reachable
   *   via `skill-loader` MCP (`list_skills`, `load_skill`). `DEV_SUITE_ROOT`
   *   is auto-prefilled by the dashboard.
   * - `'eager'` (`@deprecated`): copy every referenced SKILL.md into
   *   `.claude/skills/<path>/SKILL.md` at install time. Kept as an escape
   *   hatch for environments without `DEV_SUITE_ROOT` (CI, container).
   *   Not exposed in the dashboard UI.
   *
   * @deprecated `'eager'` value will be removed in a future major version;
   *   prefer `'lazy'` (now built-in via `skill-loader`).
   */
  skillLoadingMode?: 'eager' | 'lazy';
}

export interface InstallManifest {
  version: string;
  installedAt: string;
  projectPath: string;
  agents: string[];
  mcpServers: string[];
  rules: string[];
  files: InstalledFile[];
}

export interface InstalledFile {
  path: string;
  type: 'agent' | 'skill' | 'mcp-server' | 'config';
  source: string;
}

// Job types (for orchestrator)
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  title: string;
  status: JobStatus;
  projectPath: string;
  prompt: string;
  agentId?: string;
  result?: string;
  error?: string;
  cost?: number;
  createdAt: string;
  completedAt?: string;
}

// WebSocket message types
export type WsMessageType =
  | 'chat_message'
  | 'submit_job'
  | 'cancel_job'
  | 'get_status'
  | 'job_started'
  | 'job_complete'
  | 'job_error'
  | 'job_cancelled'
  | 'chat_output'
  | 'chat_complete'
  | 'status'
  | 'input_required'
  | 'permission_required';

export interface WsMessage {
  type: WsMessageType;
  payload?: unknown;
  jobId?: string;
  sessionId?: string;
}

// Environment detection
export interface EnvironmentFile {
  name: string;
  label: string;
  databaseUrl: string;
  source: string;
}

// Git repository info
export interface GitRepoInfo {
  path: string;
  name: string;
  branch?: string;
  remote?: string;
  remoteUrl?: string;
}

// Hooks types

// Git Hook Actions
export interface HookAction {
  name: string;
  description: string;
  npmScript: string | null;
  altScripts?: string[];
  fallback: string | null;
  detectPackages: string[];
  isClaudeAction?: boolean;
}

// Git Hook Type
export interface HookType {
  name: string;
  description: string;
  category: 'client' | 'server' | 'email' | 'other';
  suggestedActions: string[];
}

// Husky status
export interface HuskyStatus {
  installed: boolean;
  version?: string;
}

// Hook info from detection
export interface HookInfo {
  exists: boolean;
  path: string;
  isDevSuite: boolean;
  content?: string;
  actions?: string[];
}

// Available action info
export interface AvailableAction extends HookAction {
  available: boolean;
  command: string | null;
}

// Git hooks status
export interface GitHooksStatus {
  hasGit: boolean;
  husky: HuskyStatus;
  nativeHooks: Record<string, HookInfo>;
  huskyHooks: Record<string, HookInfo>;
  installedHooks: Record<string, HookInfo>;
  availableActions: Record<string, AvailableAction>;
  hookTypes: Record<string, HookType>;
}

// Hook installation config
export interface HookConfig {
  enabled: boolean;
  actions?: string[];
  conventional?: boolean;
  pattern?: string;
  script?: string;
  protectedBranches?: string;
}

export interface HooksInstallConfig {
  useHusky?: boolean;
  [hookType: string]: HookConfig | boolean | undefined;
}

// Hook installation result
export interface HookInstallResult {
  success: boolean;
  installed?: string[];
  removed?: string[];
  errors?: Array<{ hook: string; error: string }>;
  error?: string;
  huskyInstalled?: boolean;
  repoPath?: string;
}

// Repository with hooks info
export interface RepoWithHooks {
  path: string;
  name: string;
  branch?: string;
  remote?: string;
  remoteUrl?: string;
  hasGit: boolean;
  hasHusky: boolean;
  installedHooksCount: number;
  devSuiteHooksCount: number;
  hasDevSuiteHooks: boolean;
}

// Claude Code Hook Events
export interface ClaudeHookEvent {
  name: string;
  description: string;
  hasMatcher: boolean;
  matcherType?: 'tool' | 'type';
  matcherDescription?: string;
}

// Claude Code Hook Template
export interface ClaudeHookTemplate {
  id: string;
  name: string;
  description: string;
  hooks: Array<{
    matcher?: string;
    hooks: string[];
  }>;
  event: string;
  /** Relative path inside templates/hooks/ for PreToolUse output-filter scripts */
  scriptFile?: string;
  /** Human-readable token-savings estimate (approximate) */
  tokenSavingsEstimate?: string;
  /** Template category for UI grouping */
  category?: 'quality' | 'security' | 'output-filter';
}

// Claude Code Hook command - can be a string (shell command) or an object (prompt hook)
export interface ClaudePromptHook {
  type: 'prompt';
  prompt: string;
  timeout?: number;
}

export type ClaudeHookCommand = string | ClaudePromptHook;

// Claude Code Hook (for UI)
export interface ClaudeHookUI {
  id: string;
  event: string;
  matcher: string;
  commands: ClaudeHookCommand[];
  timeout?: number;
}

// Claude hooks status
export interface ClaudeHooksStatus {
  hasClaudeDir: boolean;
  hasSettings: boolean;
  settingsPath: string;
  hooks: ClaudeHookUI[];
  hookCount: number;
  availableEvents: Record<string, ClaudeHookEvent>;
  templates: Record<string, ClaudeHookTemplate>;
  rawHooks?: Record<string, unknown>;
}

// Claude hook add/update config
export interface ClaudeHookConfig {
  event: string;
  matcher?: string;
  commands: string[];
  timeout?: number;
}

// Export result
export interface ClaudeHooksExport {
  version: string;
  exportedAt: string;
  hooks: Record<string, unknown>;
}
