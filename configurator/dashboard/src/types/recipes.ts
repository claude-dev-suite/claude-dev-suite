// SPDX-License-Identifier: MIT
/**
 * Automation Recipes Types for Frontend
 *
 * Types for the user-friendly automation recipes UI.
 */

// ============================================
// RECIPE TYPES
// ============================================

export type RecipeIcon = 'format' | 'shield' | 'typescript' | 'test' | 'api' | 'lint' | 'git' | 'security' | 'check' | 'code' | 'database';
export type RecipeCategory = 'code-quality' | 'security' | 'testing' | 'git-workflow' | 'validation';

export interface RecipeOption {
  id: string;
  label: string;
  type: 'checkbox' | 'select' | 'multiselect' | 'text';
  defaultValue: unknown;
  choices?: { value: string; label: string }[];
}

export interface AutomationRecipe {
  id: string;
  name: string;
  description: string;
  icon: RecipeIcon;
  category: RecipeCategory;
  recommendedFor: {
    frameworks?: string[];
    hasPackages?: string[];
    hasFiles?: string[];
  };
  options: RecipeOption[];
}

export interface RecipeCategoryGroup {
  category: RecipeCategory;
  label: string;
  recipes: AutomationRecipe[];
}

// ============================================
// ENABLED AUTOMATION TYPES
// ============================================

export interface EnabledAutomation {
  recipeId: string;
  enabled: boolean;
  customOptions: Record<string, unknown>;
  enabledAt: string;
  lastTested?: string;
  testResult?: 'success' | 'failure';
}

// ============================================
// DETECTED TOOLS TYPES
// ============================================

export interface DetectedTools {
  formatters: string[];
  linters: string[];
  testRunners: string[];
  packageManagers: string[];
  frameworks: string[];
  hasTypeScript: boolean;
  hasGit: boolean;
  hasHusky: boolean;
}

// ============================================
// RECOMMENDATION TYPES
// ============================================

export interface RecipeRecommendation {
  recipe: AutomationRecipe;
  reason: string;
  detectedPackage?: string;
  detectedFile?: string;
}

// ============================================
// OPERATION RESULT TYPES
// ============================================

export interface RecipeOperationResult {
  success: boolean;
  recipeId: string;
  error?: string;
  hookInstalled?: boolean;
  gitHookInstalled?: boolean;
}

export interface RecipeTestResult {
  success: boolean;
  output?: string;
  error?: string;
  duration?: number;
}

// ============================================
// UI STATE TYPES
// ============================================

export interface RecipesState {
  /** All available recipes */
  recipes: AutomationRecipe[];
  /** Recipes grouped by category */
  categories: RecipeCategoryGroup[];
  /** Recommended recipes for the project */
  recommendations: RecipeRecommendation[];
  /** Currently enabled automations */
  enabled: EnabledAutomation[];
  /** Detected tools in the project */
  detectedTools: DetectedTools | null;
  /** Loading states */
  isLoading: boolean;
  isEnabling: boolean;
  isDisabling: boolean;
  isTesting: boolean;
  /** Error message */
  error: string | null;
}

export interface RecipeCardInfo {
  recipe: AutomationRecipe;
  isEnabled: boolean;
  isRecommended: boolean;
  recommendationReason?: string;
  customOptions?: Record<string, unknown>;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

export interface EnableRecipeRequest {
  projectPath: string;
  recipeId: string;
  customOptions?: Record<string, unknown>;
}

export interface DisableRecipeRequest {
  projectPath: string;
  recipeId: string;
}

export interface CustomizeRecipeRequest {
  projectPath: string;
  recipeId: string;
  options: Record<string, unknown>;
}

export interface TestRecipeRequest {
  projectPath: string;
  recipeId: string;
  customOptions?: Record<string, unknown>;
}

export interface RecipesListResponse {
  recipes: AutomationRecipe[];
  categories: RecipeCategoryGroup[];
}

export interface RecommendationsResponse {
  recommendations: RecipeRecommendation[];
  enabled: EnabledAutomation[];
}

// ============================================
// ICON MAPPING
// ============================================

export const RECIPE_ICONS: Record<RecipeIcon, string> = {
  format: 'M4 6h16M4 12h16M4 18h7', // Lines icon
  shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  typescript: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  test: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  api: 'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z',
  lint: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  git: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
  security: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  check: 'M5 13l4 4L19 7',
  code: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
  database: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4',
};

export const CATEGORY_LABELS: Record<RecipeCategory, string> = {
  'code-quality': 'Code Quality',
  'security': 'Security',
  'testing': 'Testing',
  'git-workflow': 'Git Workflow',
  'validation': 'Validation',
};

export const CATEGORY_DESCRIPTIONS: Record<RecipeCategory, string> = {
  'code-quality': 'Keep your code clean, formatted, and type-safe',
  'security': 'Protect sensitive files and prevent security issues',
  'testing': 'Run tests automatically at key moments',
  'git-workflow': 'Enforce commit conventions and pre-commit checks',
  'validation': 'Validate API contracts and database schemas',
};

// ============================================
// TYPE GUARDS
// ============================================

export function isRecipeIcon(value: unknown): value is RecipeIcon {
  return (
    typeof value === 'string' &&
    ['format', 'shield', 'typescript', 'test', 'api', 'lint', 'git', 'security', 'check', 'code', 'database'].includes(value)
  );
}

export function isRecipeCategory(value: unknown): value is RecipeCategory {
  return (
    typeof value === 'string' &&
    ['code-quality', 'security', 'testing', 'git-workflow', 'validation'].includes(value)
  );
}

export function isAutomationRecipe(value: unknown): value is AutomationRecipe {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    isRecipeIcon(obj.icon) &&
    isRecipeCategory(obj.category) &&
    Array.isArray(obj.options)
  );
}
