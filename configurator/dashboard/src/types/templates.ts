// SPDX-License-Identifier: MIT
/**
 * Templates Types (Frontend)
 *
 * Types for project scaffolding from templates.
 * Mirrors backend types in server/src/types/templates.ts
 */

// ============================================
// TEMPLATE VARIABLE TYPES
// ============================================

/**
 * Types of template variables
 */
export type TemplateVariableType = 'text' | 'path' | 'select';

/**
 * Auto-generate strategies for template variables
 */
export type TemplateAutoGenerate = 'jwt_secret' | 'uuid' | 'timestamp';

/**
 * Conditional visibility for template variables
 */
export interface TemplateVariableCondition {
  /** Field name to check */
  field: string;
  /** Value that the field must equal for this variable to be shown */
  equals: string;
}

/**
 * Select option for select-type variables
 */
export interface TemplateSelectOption {
  /** Display label */
  label: string;
  /** Value to use when selected */
  value: string;
}

/**
 * Definition of a template variable that can be configured by the user
 */
export interface TemplateVariable {
  /** Variable name (used as key in substitution) */
  name: string;
  /** Display label for the form field */
  label: string;
  /** Type of input field */
  type: TemplateVariableType;
  /** Whether this field is required */
  required: boolean;
  /** Default value */
  default?: string;
  /** Description/help text for the field */
  description?: string;
  /** Placeholder text */
  placeholder?: string;
  /** If set, this variable's value is derived from another field */
  derivedFrom?: string;
  /** Transformation to apply when deriving */
  derivedTransform?: string;
  /** Auto-generate strategy */
  autoGenerate?: TemplateAutoGenerate;
  /** Conditional visibility */
  showWhen?: TemplateVariableCondition;
  /** Options for select type */
  options?: TemplateSelectOption[];
  /** Validation pattern (regex string) */
  pattern?: string;
  /** Validation error message */
  patternError?: string;
  /** Minimum length for text fields */
  minLength?: number;
  /** Maximum length for text fields */
  maxLength?: number;
}

// ============================================
// TEMPLATE INFO TYPES
// ============================================

/**
 * Template category
 */
export type TemplateCategory = 'frontend' | 'backend' | 'fullstack';

/**
 * Template structure definition for monorepos
 */
export interface TemplateStructure {
  frontend?: {
    path: string;
    framework?: string;
    features?: string[];
  };
  backend?: {
    path?: string;
    language?: string;
    version?: string;
    framework?: string;
    frameworkVersion?: string;
    database?: string;
    orm?: string;
    buildTool?: string;
    features?: string[];
  };
  shared?: {
    path: string;
    features?: string[];
  };
}

/**
 * Template metadata from template.json
 */
export interface TemplateInfo {
  /** Unique template identifier (folder name) */
  id: string;
  /** Display name */
  name: string;
  /** Description of what this template creates */
  description: string;
  /** Template version */
  version: string;
  /** Author/creator */
  author?: string;
  /** Tags for filtering/searching */
  tags: string[];
  /** Template category */
  category: TemplateCategory;
  /** Technologies used in this template */
  technologies: string[];
  /** Structure for monorepo templates */
  structure?: TemplateStructure;
  /** List of template files */
  files?: string[];
  /** Available scripts */
  scripts?: Record<string, string>;
  /** Template features */
  features?: string[];
  /** Based on existing projects */
  basedOn?: string[];
  /** Whether devcontainer is supported */
  devContainerSupport?: boolean;
  /** Variables that can be configured */
  variables: TemplateVariable[];
}

/**
 * Template list item (lighter version for list display)
 */
export interface TemplateListItem {
  /** Template ID */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Category */
  category: TemplateCategory;
  /** Tags for filtering */
  tags: string[];
  /** Technologies used */
  technologies: string[];
}

// ============================================
// SCAFFOLD CONFIG & RESULT TYPES
// ============================================

/**
 * Configuration for scaffolding a new project
 */
export interface ScaffoldConfig {
  /** Template to use */
  templateId: string;
  /** Target directory path for the new project */
  projectPath: string;
  /** Variable values provided by the user */
  variables: Record<string, string>;
}

/**
 * Result of a scaffolding operation
 */
export interface ScaffoldResult {
  /** Whether scaffolding was successful */
  success: boolean;
  /** Path where project was created */
  projectPath: string;
  /** List of files created (relative paths) */
  filesCreated: string[];
  /** List of directories created (relative paths) */
  directoriesCreated: string[];
  /** Any warnings that occurred during scaffolding */
  warnings?: string[];
  /** Error message if failed */
  error?: string;
}

/**
 * Validation result for template variables
 */
export interface VariableValidationResult {
  /** Whether all variables are valid */
  valid: boolean;
  /** Error messages per variable name */
  errors: Record<string, string>;
  /** Computed/derived variable values */
  computedValues: Record<string, string>;
}

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Response for GET /api/templates
 */
export interface TemplatesListResponse {
  templates: TemplateListItem[];
  count: number;
}

/**
 * Response for GET /api/templates/:id
 */
export interface TemplateDetailResponse {
  template: TemplateInfo;
}

/**
 * Request for POST /api/templates/validate
 */
export interface ValidateVariablesRequest {
  templateId: string;
  variables: Record<string, string>;
}

/**
 * Response for POST /api/templates/validate
 */
export interface ValidateVariablesResponse extends VariableValidationResult {}

/**
 * Request for POST /api/templates/scaffold
 */
export interface ScaffoldRequest extends ScaffoldConfig {}

/**
 * Response for POST /api/templates/scaffold
 */
export interface ScaffoldResponse extends ScaffoldResult {}

// ============================================
// UI STATE TYPES
// ============================================

/**
 * Wizard mode - whether configuring existing project or creating new
 */
export type WizardMode = 'configure' | 'create' | null;

/**
 * Template card display info with selection state
 */
export interface TemplateCardInfo extends TemplateListItem {
  /** Whether this template is currently selected */
  selected?: boolean;
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Type guard for TemplateCategory
 */
export function isTemplateCategory(value: unknown): value is TemplateCategory {
  return typeof value === 'string' && ['frontend', 'backend', 'fullstack'].includes(value);
}

/**
 * Type guard for TemplateVariableType
 */
export function isTemplateVariableType(value: unknown): value is TemplateVariableType {
  return typeof value === 'string' && ['text', 'path', 'select'].includes(value);
}

/**
 * Type guard for WizardMode
 */
export function isWizardMode(value: unknown): value is WizardMode {
  return value === null || (typeof value === 'string' && ['configure', 'create'].includes(value));
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Labels for template categories
 */
export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  fullstack: 'Full Stack',
};

/**
 * Colors for template categories
 */
export const TEMPLATE_CATEGORY_COLORS: Record<TemplateCategory, string> = {
  frontend: 'text-blue-400',
  backend: 'text-green-400',
  fullstack: 'text-purple-400',
};

/**
 * Badge styles for template categories
 */
export const TEMPLATE_CATEGORY_BADGE_CLASSES: Record<TemplateCategory, string> = {
  frontend: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  backend: 'bg-green-500/20 text-green-400 border-green-500/30',
  fullstack: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};
