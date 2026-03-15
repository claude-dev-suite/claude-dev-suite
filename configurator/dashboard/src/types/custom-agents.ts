// SPDX-License-Identifier: MIT
/**
 * Custom Agents Types (Frontend)
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
 * Parsed frontmatter from validation
 */
export interface ParsedFrontmatter {
  name: string;
  description?: string;
  model?: CustomAgentModel;
  skills?: string[];
  mcp_servers?: string[];
  'allowed-tools'?: string;
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
  parsedFrontmatter?: ParsedFrontmatter;
}

// ============================================
// CREATION TYPES
// ============================================

/**
 * Mode for creating custom agents
 */
export type CustomAgentCreationMode = 'upload' | 'generate' | 'ai-chat';

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
  /** Created/updated agent (full details) */
  agent?: CustomAgent;
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
 * Skill content extracted from AI generation output.
 * Used when Claude generates SKILL.md files alongside an agent.
 */
export interface GeneratedSkill {
  /** Skill name (kebab-case, used as directory name under custom/) */
  name: string;
  /** Full SKILL.md content */
  content: string;
}

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
 */
export interface CustomSkillValidationResult {
  /** Always true for skills (no schema validation) */
  valid: true;
  /** Best practice warnings (bypassable) */
  bestPracticeWarnings: BestPracticeWarning[];
}

/**
 * Mode for creating custom skills
 */
export type CustomSkillCreationMode = 'upload' | 'generate' | 'ai-chat';

/**
 * Response for listing custom skills
 */
export interface CustomSkillsListResponse {
  /** List of custom skills */
  skills: CustomSkill[];
  /** Total count */
  total: number;
}

/**
 * Response for getting a single custom skill
 */
export interface CustomSkillDetailResponse {
  /** Full skill details */
  skill: CustomSkillDetail;
}

/**
 * Response for creating/updating a custom skill
 */
export interface CustomSkillOperationResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Created/updated skill */
  skill?: CustomSkill;
  /** Error message if failed */
  error?: string;
  /** Validation result */
  validation?: CustomSkillValidationResult;
}

/**
 * Response for validation endpoint
 */
export interface CustomSkillValidationResponse {
  /** Validation result */
  validation: CustomSkillValidationResult;
}

// ============================================
// UI STATE TYPES
// ============================================

/**
 * State for custom agents panel
 */
export interface CustomAgentsState {
  /** List of custom agents */
  agents: CustomAgentListItem[];
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Selected agent ID for editing */
  selectedAgentId: string | null;
  /** Modal open state */
  isCreateModalOpen: boolean;
  /** Editor modal open state */
  isEditorModalOpen: boolean;
  /** Creation mode */
  creationMode: CustomAgentCreationMode;
}

/**
 * Props for custom agent card
 */
export interface CustomAgentCardInfo {
  /** Agent data */
  agent: CustomAgentListItem;
  /** Whether agent is selected */
  selected: boolean;
  /** Action handlers */
  onEdit: () => void;
  onDelete: () => void;
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
 * Check if a value is a valid CustomAgentListItem
 */
export function isCustomAgentListItem(value: unknown): value is CustomAgentListItem {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    isCustomAgentModel(obj.model) &&
    typeof obj.skillCount === 'number' &&
    typeof obj.mcpServerCount === 'number' &&
    obj.isCustom === true
  );
}

/**
 * Check if a value is a valid BestPracticeSeverity
 */
export function isBestPracticeSeverity(value: unknown): value is BestPracticeSeverity {
  return typeof value === 'string' && ['warning', 'info'].includes(value);
}

/**
 * Check if a value is a valid CustomAgentCreationMode
 */
export function isCustomAgentCreationMode(value: unknown): value is CustomAgentCreationMode {
  return typeof value === 'string' && ['upload', 'generate', 'ai-chat'].includes(value);
}
