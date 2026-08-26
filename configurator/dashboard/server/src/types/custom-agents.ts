// SPDX-License-Identifier: MIT
/**
 * Custom Agents Types
 *
 * Types for project-specific custom agents that can be created via AI generation
 * or manual upload.
 */

// ============================================
// CUSTOM AGENT TYPES
// ============================================

/**
 * Model options for custom agents
 */
export type CustomAgentModel = 'sonnet' | 'opus' | 'haiku';

/**
 * YAML frontmatter structure for custom agents
 */
export interface CustomAgentFrontmatter {
  /** Agent name (lowercase-with-dashes) */
  name: string;
  /** Description of agent capabilities */
  description: string;
  /** Model to use (sonnet, opus, haiku) */
  model?: CustomAgentModel;
  /**
   * Set when the file declares a `model:` that is not one of the three
   * supported values — the parser used to drop it silently, so the UI showed
   * the default and a typo was invisible.
   */
  modelWarning?: string;
  /** Allowed tools (comma-separated) */
  'allowed-tools'?: string;
  /** Skills referenced by this agent */
  skills?: string[];
  /** MCP servers required by this agent */
  mcp_servers?: string[];
}

/**
 * Custom agent with full metadata
 */
export interface CustomAgent {
  /** Unique identifier (filename without .md) */
  id: string;
  /** Display name */
  name: string;
  /** Description of capabilities */
  description: string;
  /** Model preference */
  model: CustomAgentModel;
  /** Allowed tools list */
  allowedTools: string[];
  /** Referenced skills (can be built-in or custom) */
  skills: string[];
  /** Required MCP servers */
  mcpServers: string[];
  /** Full markdown content */
  content: string;
  /** Category (always 'custom' for custom agents) */
  category: 'custom';
  /** Whether this is a custom agent */
  isCustom: true;
  /** File path relative to project */
  filePath: string;
  /** Creation timestamp */
  createdAt?: string;
  /** Last modified timestamp */
  modifiedAt?: string;
}

/**
 * Custom agent list item (lighter version for listings)
 */
export interface CustomAgentListItem {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Model preference */
  model: CustomAgentModel;
  /** Number of skills */
  skillCount: number;
  /** Number of MCP servers */
  mcpServerCount: number;
  /** Whether this is a custom agent */
  isCustom: true;
  /** Last modified timestamp */
  modifiedAt?: string;
}

// ============================================
// VALIDATION TYPES
// ============================================

/**
 * Severity levels for best practice warnings
 */
export type BestPracticeSeverity = 'warning' | 'info';

/**
 * Best practice validation rule result
 */
export interface BestPracticeWarning {
  /** Rule identifier */
  rule: string;
  /** Human-readable message */
  message: string;
  /** Severity level */
  severity: BestPracticeSeverity;
  /** Line number in the content (if applicable) */
  line?: number;
}

/**
 * Complete validation result for custom agents
 */
export interface CustomAgentValidationResult {
  /** Whether schema validation passed (blocking) */
  valid: boolean;
  /** Schema validation errors (blocking) */
  schemaErrors?: string[];
  /** Best practice warnings (bypassable) */
  bestPracticeWarnings: BestPracticeWarning[];
  /** Parsed frontmatter (if valid) */
  parsedFrontmatter?: CustomAgentFrontmatter;
}

// ============================================
// CREATION TYPES
// ============================================

/**
 * Mode for creating custom agents
 */
export type CustomAgentCreationMode = 'upload' | 'generate';

/**
 * Request to create a custom agent via upload
 */
export interface CreateCustomAgentUploadRequest {
  /** Project path */
  projectPath: string;
  /** Markdown content */
  content: string;
  /** Whether to bypass best practice warnings */
  bypassWarnings?: boolean;
}

/**
 * Request to create a custom agent via AI generation
 */
export interface CreateCustomAgentGenerateRequest {
  /** Project path */
  projectPath: string;
  /** Agent name */
  name: string;
  /** Agent description/purpose */
  description: string;
  /** Technology focus areas */
  techFocus?: string[];
  /** Selected skills to include */
  skills?: string[];
  /** Selected MCP servers */
  mcpServers?: string[];
  /** Preferred model */
  model?: CustomAgentModel;
}

/**
 * Request to update a custom agent
 */
export interface UpdateCustomAgentRequest {
  /** Project path */
  projectPath: string;
  /** Agent ID to update */
  agentId: string;
  /** New markdown content */
  content: string;
  /** Whether to bypass best practice warnings */
  bypassWarnings?: boolean;
}

/**
 * Request to delete a custom agent
 */
export interface DeleteCustomAgentRequest {
  /** Project path */
  projectPath: string;
  /** Agent ID to delete */
  agentId: string;
}

/**
 * Request to validate custom agent content
 */
export interface ValidateCustomAgentRequest {
  /** Markdown content to validate */
  content: string;
}

// ============================================
// RESPONSE TYPES
// ============================================

/**
 * Response for listing custom agents
 */
export interface CustomAgentsListResponse {
  /** List of custom agents */
  agents: CustomAgentListItem[];
  /** Total count */
  total: number;
}

/**
 * Response for getting a single custom agent
 */
export interface CustomAgentDetailResponse {
  /** Full agent details */
  agent: CustomAgent;
}

/**
 * Response for creating/updating a custom agent
 */
export interface CustomAgentOperationResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Created/updated agent */
  agent?: CustomAgentListItem;
  /** Error message if failed */
  error?: string;
  /** Validation result */
  validation?: CustomAgentValidationResult;
}

/**
 * Response for validation endpoint
 */
export interface CustomAgentValidationResponse {
  /** Validation result */
  validation: CustomAgentValidationResult;
}

// ============================================
// CUSTOM SKILLS TYPES
// ============================================

/**
 * Custom skill metadata
 */
export interface CustomSkill {
  /** Unique identifier (directory name) */
  id: string;
  /** Display name */
  name: string;
  /** Description from SKILL.md */
  description: string;
  /** Whether this is a custom skill */
  isCustom: true;
  /** File path relative to project */
  filePath: string;
  /** Last modified timestamp */
  modifiedAt?: string;
}

/**
 * Custom skill with full content (for detail/editor view)
 */
export interface CustomSkillDetail extends CustomSkill {
  /** Full SKILL.md content */
  content: string;
}

/**
 * Validation result for custom skills
 * Skills have no frontmatter schema, so valid is always true.
 * Only best practice warnings are reported.
 */
export interface CustomSkillValidationResult {
  /** Always true for skills (no schema validation) */
  valid: true;
  /** Best practice warnings (bypassable) */
  bestPracticeWarnings: BestPracticeWarning[];
}

/**
 * Request to create a custom skill
 */
export interface CreateCustomSkillRequest {
  /** Project path */
  projectPath: string;
  /** Skill name (will be used as directory name) */
  name: string;
  /** SKILL.md content */
  content: string;
  /** Whether to bypass best practice warnings */
  bypassWarnings?: boolean;
}

/**
 * Request to update a custom skill
 */
export interface UpdateCustomSkillRequest {
  /** Project path */
  projectPath: string;
  /** Skill ID (directory name) to update */
  skillId: string;
  /** New skill name (for rename) */
  name: string;
  /** New SKILL.md content */
  content: string;
  /** Whether to bypass best practice warnings */
  bypassWarnings?: boolean;
}

/**
 * Response for listing custom skills
 */
export interface CustomSkillsListResponse {
  /** List of custom skills */
  skills: CustomSkill[];
  /** Total count */
  total: number;
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if a value is a valid CustomAgentModel
 */
export function isCustomAgentModel(value: unknown): value is CustomAgentModel {
  return typeof value === 'string' && ['sonnet', 'opus', 'haiku'].includes(value);
}

/**
 * Check if a value is a valid CustomAgent
 */
export function isCustomAgent(value: unknown): value is CustomAgent {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    isCustomAgentModel(obj.model) &&
    Array.isArray(obj.skills) &&
    Array.isArray(obj.mcpServers) &&
    typeof obj.content === 'string' &&
    obj.category === 'custom' &&
    obj.isCustom === true
  );
}

/**
 * Check if a value is a valid BestPracticeSeverity
 */
export function isBestPracticeSeverity(value: unknown): value is BestPracticeSeverity {
  return typeof value === 'string' && ['warning', 'info'].includes(value);
}
