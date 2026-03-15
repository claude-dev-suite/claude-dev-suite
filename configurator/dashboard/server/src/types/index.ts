// SPDX-License-Identifier: MIT
/**
 * Dev-Suite Dashboard Types - Barrel Export
 *
 * This file re-exports all types from the types directory for convenient imports.
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
  StashEntry,
  // Request types
  StageFilesRequest,
  DiscardChangesRequest,
  CreateCommitRequest,
  CreateBranchRequest,
  CheckoutBranchRequest,
  DeleteBranchRequest,
  MergeBranchRequest,
  CherryPickRequest,
  RevertRequest,
  PushRequest,
  PullRequest,
  FetchRequest,
  LogRequest,
  CompareBranchesRequest,
  // Response types
  BranchComparison,
} from './git.js';

// ============================================
// UPGRADE TYPES
// ============================================

export type {
  // Feature types
  FeatureType,
  StackRequirements,
  HookMergeConfig,
  AgentReplaceConfig,
  SkillUpdateConfig,
  ConfigMergeConfig,
  FeatureApplyConfig,
  Feature,
  FeatureRegistry,
  // Manifest types
  AppliedFeature,
  TrackedFile,
  UpgradeHistoryEntry,
  CatalogSnapshot,
  ExtendedManifest,
  // New component types
  NewComponent,
  NewComponentsResult,
  // Conflict types
  ConflictType,
  ConflictInfo,
  // Upgrade operation types
  AvailableUpgrade,
  UpgradeCheckResult,
  ConflictResolution,
  ConflictResolutions,
  UpgradeExecuteRequest,
  FeatureUpgradeResult,
  UpgradeExecuteResult,
  UpgradePreviewResult,
} from './upgrade.js';

export {
  // Type guards
  isFeatureType,
  isFeature,
  isFeatureRegistry,
  isExtendedManifest,
  isConflictType,
} from './upgrade.js';

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
} from './templates.js';

export {
  // Type guards
  isTemplateCategory,
  isTemplateVariableType,
  isTemplateVariable,
  isTemplateInfo,
} from './templates.js';

// ============================================
// CUSTOM AGENTS TYPES
// ============================================

export type {
  // Model types
  CustomAgentModel,
  // Frontmatter types
  CustomAgentFrontmatter,
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
  DeleteCustomAgentRequest,
  ValidateCustomAgentRequest,
  // Response types
  CustomAgentsListResponse,
  CustomAgentDetailResponse,
  CustomAgentOperationResponse,
  CustomAgentValidationResponse,
  // Skill types
  CustomSkill,
  CreateCustomSkillRequest,
  CustomSkillsListResponse,
} from './custom-agents.js';

export {
  // Type guards
  isCustomAgentModel,
  isCustomAgent,
  isBestPracticeSeverity,
} from './custom-agents.js';

// ============================================
// CODE GENERATION TYPES
// ============================================

export type {
  CodeGenTechnology,
  CodeGenTargetLanguage,
  CodeGenComponent,
  RefinementOptions,
  ValidationResult as CodeGenValidationResult,
  GeneratedFile,
  RefinedFile,
  CodeGenResult,
  CodeGenPreview,
  ProjectConventions,
  RefinementProfile,
  CodeGenTargetInfo,
} from './codegen.js';

export {
  isCodeGenTechnology,
  isCodeGenTargetLanguage,
} from './codegen.js';

// ============================================
// USAGE MONITOR TYPES
// ============================================

export type {
  UsageConfig,
  AlertThreshold,
  UsageReport,
  ModelUsage,
  CostReport,
  CostBreakdown,
  UsageAlert,
  DeepLink,
  UsageSummary,
} from './usage.js';
