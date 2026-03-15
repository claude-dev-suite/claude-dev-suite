// SPDX-License-Identifier: MIT
/**
 * Dev-Suite Dashboard Types - Barrel Export
 *
 * This file re-exports all types from the types directory for convenient imports.
 *
 * Usage:
 * ```typescript
 * import { ProjectConfig, Agent, McpServer, Job, ApiResponse } from '@/types';
 * ```
 */

// ============================================
// CORE TYPES
// ============================================

export type {
  // Project types
  ProjectType,
  ProjectConfig,
  // Stack types
  StackInfo,
  FrameworkInfo,
  DatabaseInfo,
  TestingInfo,
  // Environment types
  EnvironmentInfo,
  EnvironmentMap,
  // Git types
  GitRepoInfo,
  // Installation types
  InstallManifest,
  DevSuiteConfig,
} from './core.js';

export {
  // Type guards
  isProjectType,
  isFrameworkInfo,
  isDatabaseInfo,
  isStackInfo,
} from './core.js';

// ============================================
// AGENT TYPES
// ============================================

export type {
  // Category types
  AgentCategory,
  // Agent types
  Agent,
  AgentWithSelection,
  // Routing types
  AgentRouting,
  AgentRoutingEntry,
  // Detection types
  AgentDetectionResult,
  // Recommendation types
  AgentRecommendation,
  AgentRecommendations,
  McpRecommendation,
} from './agents.js';

export {
  // Type guards
  isAgentCategory,
  isAgent,
} from './agents.js';

// ============================================
// MCP SERVER TYPES
// ============================================

export type {
  // Category types
  McpServerCategory,
  // Environment variable types
  EnvVarConfig,
  EnvVarWithDetection,
  // Server types
  McpServer,
  McpServerWithSelection,
  // Status types
  McpBuildStatus,
  McpPrepareResult,
  McpPrepareMultipleResult,
  // Configuration types
  McpJsonServerEntry,
  McpJsonConfig,
} from './mcp.js';

export {
  // Type guards
  isMcpServerCategory,
  isEnvVarConfig,
  isMcpServer,
} from './mcp.js';

// ============================================
// ORCHESTRATOR TYPES
// ============================================

export type {
  // Status types
  JobStatus,
  // Job types
  SubTask,
  Job,
  RecentJob,
  // Batch types
  JobBatch,
  CompletedBatchJob,
  BatchSummary,
  // Chat session types
  ChatSessionState,
  ChatCompletionResult,
  TokenUsage,
  // WebSocket message types
  WsClientMessageType,
  WsServerMessageType,
  WsMessageType,
  // WebSocket payload types
  ChatMessagePayload,
  SubmitJobPayload,
  CancelJobPayload,
  JobQueuedPayload,
  JobStartedPayload,
  JobOutputPayload,
  JobCompletePayload,
  JobContextSummary,
  JobErrorPayload,
  JobCancelledPayload,
  BatchCompletePayload,
  ChatOutputPayload,
  ChatCompletePayload,
  ChatSessionPayload,
  ChatAgentPayload,
  ErrorPayload,
  // WebSocket message wrapper
  WsMessage,
  // Permission types
  PermissionRequestPayload,
  PermissionResponsePayload,
  // Queue management types
  QueueStatusPayload,
  QueueClearedPayload,
  JobRemovedPayload,
  QueueUnstuckPayload,
} from './orchestrator.js';

export {
  // Type guards
  isJobStatus,
  isJob,
  isWsMessage,
} from './orchestrator.js';

// ============================================
// API TYPES
// ============================================

export type {
  // Generic response types
  ApiResponse,
  PaginatedResponse,
  // Security types
  SecurityTokensResponse,
  // Detection types
  DetectionResponse,
  EnvironmentsResponse,
  GitReposResponse,
  RecommendationsResponse,
  // Agents types
  AgentsResponse,
  McpServersResponse,
  EnvVarsRequest,
  EnvVarsResponse,
  // Installation types
  PrepareServersRequest,
  PrepareServersResponse,
  InstallRequest,
  InstallationResponse,
  InstallStatusResponse,
  UninstallResponse,
  // Management types
  InstalledComponentsResponse,
  NewComponent,
  NewComponentsResponse,
  AddAgentRequest,
  RemoveAgentRequest,
  AddMcpServerRequest,
  RemoveMcpServerRequest,
  ComponentOperationResponse,
  // Hooks types
  HookType,
  HookAction,
  HookConfig,
  HooksStatusResponse,
  InstallHooksRequest,
  // Claude hooks types
  ClaudeHookEvent,
  ClaudeHookConfig,
  ClaudeHookAction,
  ClaudePromptHook,
  ClaudeHookCommand,
  ClaudeHookUI,
  ClaudeHooksStatusResponse,
  ClaudeHookTemplate,
  // Code review types
  ReviewScope,
  ReviewType,
  CodeReviewOptions,
  CodeReviewFilesResponse,
  FileTreeNode,
  StartCodeReviewRequest,
  // Analytics types
  KBUsageEntry,
  KBUsageStats,
  TimelineEntry,
  KBUsageRequest,
  KBUsageResponse,
  // Update types
  CheckUpdatesResponse,
  PullUpdatesResponse,
} from './api.js';

export {
  // Type guards
  isApiResponse,
  isDetectionResponse,
  isInstallationResponse,
} from './api.js';

// ============================================
// GIT TYPES
// ============================================

export type {
  // Status types
  FileStatus,
  FileChange,
  GitRepoStatus,
  // Branch types
  Branch,
  // Commit types
  CommitInfo,
  FileDiff,
  // Remote types
  Remote,
  BranchComparison,
} from './git.js';

export {
  // UI Helpers
  getStatusLabel,
  getStatusColor,
  getStatusBadgeClass,
} from './git.js';

// ============================================
// UPGRADE TYPES
// ============================================

export type {
  // Feature types
  FeatureType,
  Feature,
  FeatureRegistry,
  // Conflict types
  ConflictType,
  ConflictInfo,
  ConflictResolution,
  // Operation types
  AppliedFeature,
  UpgradeHistoryEntry,
  ExtendedManifest,
  AvailableUpgrade,
  UpgradeCheckResult,
  UpgradePreviewResult,
  FeatureUpgradeResult,
  UpgradeExecuteResult,
  UpgradeExecuteRequest,
  // Prerequisite installation types
  InstallPackageRequest,
  InstallPackageResult,
  InstallAgentRequest,
  InstallAgentResult,
  // UI state types
  UpgradeState,
  FeatureCardInfo,
} from './upgrade.js';

export {
  // Type guards
  isFeatureType,
  isConflictType,
  isUpgradeCheckResult,
} from './upgrade.js';

// ============================================
// RECIPES/AUTOMATIONS TYPES
// ============================================

export type {
  // Recipe types
  RecipeIcon,
  RecipeCategory,
  RecipeOption,
  AutomationRecipe,
  RecipeCategoryGroup,
  // Enabled automation types
  EnabledAutomation,
  // Detected tools types
  DetectedTools,
  // Recommendation types
  RecipeRecommendation,
  // Operation result types
  RecipeOperationResult,
  RecipeTestResult,
  // UI state types
  RecipesState,
  RecipeCardInfo,
  // API request/response types
  EnableRecipeRequest,
  DisableRecipeRequest,
  CustomizeRecipeRequest,
  TestRecipeRequest,
  RecipesListResponse,
  RecommendationsResponse as RecipesRecommendationsResponse,
} from './recipes.js';

export {
  // Constants
  RECIPE_ICONS,
  CATEGORY_LABELS,
  CATEGORY_DESCRIPTIONS,
  // Type guards
  isRecipeIcon,
  isRecipeCategory,
  isAutomationRecipe,
} from './recipes.js';

// ============================================
// UPDATER TYPES
// ============================================

export type {
  // Status types
  UpdaterStatus,
  // Info types
  UpdateInfo,
  ReleaseNoteInfo,
  DownloadProgress,
  UpdateError,
  // IPC result types
  CheckUpdateResult,
  DownloadUpdateResult,
  InstallUpdateResult,
  // Store state
  UpdaterState,
  // API types
  UpdaterAPI,
  ElectronAPIWithUpdater,
} from './updater.js';

export {
  // Type guards
  isUpdaterStatus,
  isUpdateInfo,
  isDownloadProgress,
} from './updater.js';

// ============================================
// TEMPLATES TYPES
// ============================================

export type {
  // Variable types
  TemplateVariableType,
  TemplateAutoGenerate,
  TemplateVariableCondition,
  TemplateSelectOption,
  TemplateVariable,
  // Template types
  TemplateCategory,
  TemplateStructure,
  TemplateInfo,
  TemplateListItem,
  // Scaffold types
  ScaffoldConfig,
  ScaffoldResult,
  VariableValidationResult,
  // API types
  TemplatesListResponse,
  TemplateDetailResponse,
  ValidateVariablesRequest,
  ValidateVariablesResponse,
  ScaffoldRequest,
  ScaffoldResponse,
  // UI types
  WizardMode,
  TemplateCardInfo,
} from './templates.js';

export {
  // Type guards
  isTemplateCategory,
  isTemplateVariableType,
  isWizardMode,
  // Constants
  TEMPLATE_CATEGORY_LABELS,
  TEMPLATE_CATEGORY_COLORS,
  TEMPLATE_CATEGORY_BADGE_CLASSES,
} from './templates.js';

// ============================================
// CUSTOM AGENTS TYPES
// ============================================

export type {
  // Model types
  CustomAgentModel,
  // Agent types
  CustomAgent,
  CustomAgentListItem,
  // Validation types
  BestPracticeSeverity,
  BestPracticeWarning,
  CustomAgentValidationResult,
  // Creation types
  CustomAgentCreationMode,
  CreateCustomAgentUploadRequest,
  CreateCustomAgentGenerateRequest,
  UpdateCustomAgentRequest,
  // Response types
  CustomAgentsListResponse,
  CustomAgentDetailResponse,
  CustomAgentOperationResponse,
  CustomAgentValidationResponse,
  // Skill types
  CustomSkill,
  CustomSkillsListResponse,
  // UI state types
  CustomAgentsState,
  CustomAgentCardInfo,
} from './custom-agents.js';

export {
  // Type guards
  isCustomAgentModel,
  isCustomAgentListItem,
  isBestPracticeSeverity,
  isCustomAgentCreationMode,
} from './custom-agents.js';
