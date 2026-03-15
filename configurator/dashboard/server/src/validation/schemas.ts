// SPDX-License-Identifier: MIT
/**
 * Zod validation schemas for all API request bodies
 */

import { z } from 'zod';

// ============================================
// DETECTION SCHEMAS
// ============================================

export const DetectRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

export const EnvironmentRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

export const GitReposRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

export const RecommendationsRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

// ============================================
// INSTALLATION SCHEMAS
// ============================================

export const PrepareServersRequestSchema = z.object({
  servers: z.array(z.string()).optional(),
  serverNames: z.array(z.string()).optional(),
}).refine(
  (data) => (data.servers && data.servers.length > 0) || (data.serverNames && data.serverNames.length > 0),
  { message: 'Either servers or serverNames array is required' }
);

// Detected stack schema for integration validator hook configuration
const DetectedStackSchema = z.object({
  projectType: z.string().optional(),
  frontend: z.object({
    framework: z.string().optional(),
    metaFramework: z.string().optional(),
    runtime: z.string().optional(),
    version: z.string().optional(),
  }).optional(),
  backend: z.object({
    framework: z.string().optional(),
    metaFramework: z.string().optional(),
    runtime: z.string().optional(),
    version: z.string().optional(),
  }).optional(),
  database: z.object({
    dbType: z.string().optional(),
    orm: z.string().optional(),
    version: z.string().optional(),
  }).optional(),
  testing: z.object({
    unit: z.string().optional(),
    e2e: z.string().optional(),
  }).optional(),
  isMonorepo: z.boolean().optional(),
  confidence: z.number().optional(),
}).passthrough();

export const InstallRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  agents: z.array(z.string()).optional().default([]),
  mcpServers: z.array(z.string()).optional().default([]),
  envVars: z.record(z.string(), z.string()).optional(),
  installCommands: z.boolean().optional(),
  updateClaude: z.boolean().optional(),
  detectedStack: DetectedStackSchema.optional(),
});

export const UninstallRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
});

export const InstallStatusRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

export const AvailableCommandsRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

// ============================================
// HOOKS SCHEMAS
// ============================================

export const HooksRepositoriesRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

export const HooksStatusRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

export const HooksInstallConfigSchema = z.object({
  useHusky: z.boolean().optional(),
  hooks: z.record(z.string(), z.boolean()).optional(),
  skipBackup: z.boolean().optional(),
}).passthrough(); // Allow hook config fields like preCommit, prePush, etc.

export const InstallHooksRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  config: HooksInstallConfigSchema.optional(),
});

export const UninstallHooksRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  useHusky: z.boolean().optional(),
});

export const ClaudeHookConfigSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['pre_tool_call', 'post_tool_call']),
  mcpServer: z.string().optional(),
  toolName: z.string().optional(),
  condition: z.string().optional(),
  action: z.string(),
  enabled: z.boolean().optional().default(true),
});

export const AddClaudeHookRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  hook: ClaudeHookConfigSchema,
});

export const UpdateClaudeHookRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  hookId: z.string().min(1, 'Hook ID is required'),
  config: ClaudeHookConfigSchema.partial(),
});

export const RemoveClaudeHookRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  hookId: z.string().min(1, 'Hook ID is required'),
});

export const ApplyTemplateRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  templateId: z.string().min(1, 'Template ID is required'),
});

export const ClearClaudeHooksRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
});

export const ExportClaudeHooksRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

export const ImportClaudeHooksRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  exported: z.object({
    version: z.string(),
    hooks: z.array(ClaudeHookConfigSchema),
  }),
  merge: z.boolean().optional().default(true),
});

// ============================================
// CODE REVIEW SCHEMAS
// ============================================

export const CodeReviewOptionsRequestSchema = z.object({});

export const CodeReviewFilesRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

export const CodeReviewDiffRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
  scope: z.enum(['uncommitted', 'full-project']).optional().default('uncommitted'),
  repo: z.string().optional(),
});

export const CodeReviewFullCodeRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
  maxFiles: z.number().int().positive().optional(),
  maxSize: z.number().int().positive().optional(),
});

export const BuildReviewJobRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  scope: z.enum(['uncommitted', 'full-project']),
  selectedAgents: z.array(z.string()).min(1, 'At least one agent is required'),
  paths: z.array(z.string()).optional(),
  repo: z.string().optional(),
});

export const ParseResultsRequestSchema = z.object({
  agentId: z.string().min(1, 'Agent ID is required'),
  output: z.string().min(1, 'Output is required'),
});

export const ShouldBlockRequestSchema = z.object({
  issues: z.array(z.object({
    severity: z.string(),
  })),
  threshold: z.enum(['critical', 'high', 'medium', 'low']).optional(),
});

// ============================================
// ORCHESTRATOR SCHEMAS
// ============================================

export const McpSuggestionsRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(50000, 'Prompt is too long'),
  selectedAgents: z.array(z.string()).optional().default([]),
});

export const WorkflowsRequestSchema = z.object({
  project_path: z.string().min(1, 'Project path is required'),
});

export const CreateWorkflowRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  workflow: z.object({
    id: z.string().min(1, 'Workflow ID is required'),
    name: z.string().min(1, 'Workflow name is required'),
  }).passthrough(),
});

export const DeleteWorkflowRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
});

// ============================================
// MANAGEMENT SCHEMAS
// ============================================

export const InstalledComponentsRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

export const AddAgentRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  agentId: z.string().min(1, 'Agent ID is required'),
});

export const RemoveAgentRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  agentId: z.string().min(1, 'Agent ID is required'),
});

export const AddMcpServerRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  serverName: z.string().min(1, 'Server name is required'),
  envVars: z.record(z.string(), z.string()).optional(),
});

export const RemoveMcpServerRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  serverName: z.string().min(1, 'Server name is required'),
});

// ============================================
// GIT SCHEMAS
// ============================================

export const GitReposStatusRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

export const GitStatusRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
  repo: z.string().min(1, 'Repo path is required'),
});

export const GitChangesRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
  repo: z.string().min(1, 'Repo path is required'),
});

export const GitDiffRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
  repo: z.string().min(1, 'Repo path is required'),
  file: z.string().min(1, 'File path is required'),
  staged: z.string().optional(),
});

export const StageFilesRequestSchema = z.object({
  repoPath: z.string().min(1, 'Repo path is required'),
  files: z.array(z.string()).min(1, 'At least one file is required'),
});

export const StageAllRequestSchema = z.object({
  repoPath: z.string().min(1, 'Repo path is required'),
});

export const UnstageFilesRequestSchema = z.object({
  repoPath: z.string().min(1, 'Repo path is required'),
  files: z.array(z.string()).min(1, 'At least one file is required'),
});

export const UnstageAllRequestSchema = z.object({
  repoPath: z.string().min(1, 'Repo path is required'),
});

export const DiscardChangesRequestSchema = z.object({
  repoPath: z.string().min(1, 'Repo path is required'),
  files: z.array(z.string()).min(1, 'At least one file is required'),
  staged: z.boolean().optional(),
});

export const CreateCommitRequestSchema = z.object({
  repoPath: z.string().min(1, 'Repo path is required'),
  message: z.string().min(1, 'Commit message is required'),
  amend: z.boolean().optional(),
});

export const GitLogRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
  repo: z.string().min(1, 'Repo path is required'),
  limit: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const GitCommitDetailsRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
  repo: z.string().min(1, 'Repo path is required'),
  hash: z.string().min(1, 'Commit hash is required'),
});

export const CherryPickRequestSchema = z.object({
  repoPath: z.string().min(1, 'Repo path is required'),
  commits: z.array(z.string()).min(1, 'At least one commit is required'),
  noCommit: z.boolean().optional(),
});

export const RevertRequestSchema = z.object({
  repoPath: z.string().min(1, 'Repo path is required'),
  commit: z.string().min(1, 'Commit hash is required'),
  noCommit: z.boolean().optional(),
});

export const GitBranchesRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
  repo: z.string().min(1, 'Repo path is required'),
});

export const CreateBranchRequestSchema = z.object({
  repoPath: z.string().min(1, 'Repo path is required'),
  branchName: z.string().min(1, 'Branch name is required'),
  startPoint: z.string().optional(),
  checkout: z.boolean().optional(),
});

export const CheckoutBranchRequestSchema = z.object({
  repoPath: z.string().min(1, 'Repo path is required'),
  branchName: z.string().min(1, 'Branch name is required'),
  create: z.boolean().optional(),
});

export const DeleteBranchRequestSchema = z.object({
  repoPath: z.string().min(1, 'Repo path is required'),
  branchName: z.string().min(1, 'Branch name is required'),
  force: z.boolean().optional(),
});

export const MergeBranchRequestSchema = z.object({
  repoPath: z.string().min(1, 'Repo path is required'),
  sourceBranch: z.string().min(1, 'Source branch is required'),
  noFastForward: z.boolean().optional(),
  message: z.string().optional(),
});

export const CompareBranchesRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
  repo: z.string().min(1, 'Repo path is required'),
  base: z.string().min(1, 'Base branch is required'),
  compare: z.string().min(1, 'Compare branch is required'),
});

export const GitRemotesRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
  repo: z.string().min(1, 'Repo path is required'),
});

export const FetchRequestSchema = z.object({
  repoPath: z.string().min(1, 'Repo path is required'),
  remote: z.string().optional(),
  prune: z.boolean().optional(),
  all: z.boolean().optional(),
});

export const PullRequestSchema = z.object({
  repoPath: z.string().min(1, 'Repo path is required'),
  remote: z.string().optional(),
  branch: z.string().optional(),
  rebase: z.boolean().optional(),
});

export const PushRequestSchema = z.object({
  repoPath: z.string().min(1, 'Repo path is required'),
  remote: z.string().optional(),
  branch: z.string().optional(),
  setUpstream: z.boolean().optional(),
  force: z.boolean().optional(),
  forceWithLease: z.boolean().optional(),
});

// ============================================
// WEBSOCKET MESSAGE SCHEMAS
// ============================================

// Job context schema for token-efficient chat continuity
export const JobContextSummarySchema = z.object({
  jobId: z.string(),
  title: z.string(),
  action: z.string(),
  findings: z.string(),
  projectPath: z.string(),
  completedAt: z.string(),
});

export const ChatMessagePayloadSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  sessionId: z.string().optional(),
  resumeSession: z.boolean().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  // Job context reference for token-efficient continuity.
  // SECURITY: Client only sends { jobId } as a signal; the server validates
  // the jobId against its own stored context and uses the server-side copy.
  // Full JobContextSummary fields are accepted for backwards compat but ignored.
  jobContext: z.object({ jobId: z.string() }).passthrough().optional(),
  allowedTools: z.array(z.string()).optional(),
});

// SubTask schema for multi-agent job execution
export const SubTaskSchema = z.object({
  agentId: z.string().min(1, 'Agent ID is required'),
  task: z.string().min(1, 'Task description is required'),
  dependencies: z.array(z.string()).optional(),
});

export const SubmitJobPayloadSchema = z.object({
  // Job identification
  id: z.string().optional(),
  title: z.string().optional(),
  // Prompt is required but can be empty for multi-subtask jobs where context provides the details
  prompt: z.string().max(50000, 'Prompt is too long').optional().default(''),
  context: z.string().max(100000, 'Context is too long').optional(),
  projectPath: z.string().min(1, 'Project path is required'),
  // Workflow execution (legacy)
  workflowId: z.string().optional(),
  agentTasks: z.array(z.object({
    agent: z.string().min(1, 'Agent is required'),
    task: z.string().min(1, 'Task is required'),
  })).optional(),
  // Multi-subtask execution (new)
  subTasks: z.array(SubTaskSchema).optional(),
  // Batch support
  batchId: z.string().optional(),
});

export const CancelJobPayloadSchema = z.object({
  // jobId is optional - if not provided, cancels the current running job
  jobId: z.string().optional(),
});

export const WsMessageSchema = z.object({
  type: z.enum([
    'chat_message',
    'new_chat',
    'end_chat',
    'clear_history',
    'cancel_chat',
    'submit_job',
    'cancel_job',
    'get_status',
    // Queue management
    'get_queue_status',
    'clear_queue',
    'remove_from_queue',
    'force_unstick',
    // Permission system
    'permission_response',
  ]),
  payload: z.unknown(),
});

// Type exports for TypeScript
export type DetectRequest = z.infer<typeof DetectRequestSchema>;
export type InstallRequest = z.infer<typeof InstallRequestSchema>;
export type UninstallRequest = z.infer<typeof UninstallRequestSchema>;
export type HooksInstallConfig = z.infer<typeof HooksInstallConfigSchema>;
export type ClaudeHookConfig = z.infer<typeof ClaudeHookConfigSchema>;
export type BuildReviewJobRequest = z.infer<typeof BuildReviewJobRequestSchema>;
export type McpSuggestionsRequest = z.infer<typeof McpSuggestionsRequestSchema>;
export type StageFilesRequest = z.infer<typeof StageFilesRequestSchema>;
export type CreateCommitRequest = z.infer<typeof CreateCommitRequestSchema>;
export type CreateBranchRequest = z.infer<typeof CreateBranchRequestSchema>;
export type ChatMessagePayload = z.infer<typeof ChatMessagePayloadSchema>;
export type SubTask = z.infer<typeof SubTaskSchema>;
export type SubmitJobPayload = z.infer<typeof SubmitJobPayloadSchema>;
export type CancelJobPayload = z.infer<typeof CancelJobPayloadSchema>;
export type WsMessage = z.infer<typeof WsMessageSchema>;

// ============================================
// UPGRADE SCHEMAS
// ============================================

export const UpgradeCheckRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

export const UpgradePreviewRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
  featureIds: z.array(z.string()).optional(),
});

export const ConflictResolutionSchema = z.record(
  z.string(),
  z.record(z.string(), z.enum(['skip', 'replace', 'backup-replace', 'merge']))
);

export const UpgradeExecuteRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  featureIds: z.array(z.string()).min(1, 'At least one feature ID is required'),
  resolutions: ConflictResolutionSchema.optional(),
  createBackup: z.boolean().optional().default(true),
  force: z.boolean().optional().default(false),
});

export const UpgradeHistoryRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

export type UpgradeCheckRequest = z.infer<typeof UpgradeCheckRequestSchema>;
export type UpgradePreviewRequest = z.infer<typeof UpgradePreviewRequestSchema>;
export type UpgradeExecuteRequest = z.infer<typeof UpgradeExecuteRequestSchema>;
export type UpgradeHistoryRequest = z.infer<typeof UpgradeHistoryRequestSchema>;

// ============================================
// TEMPLATES SCHEMAS
// ============================================

export const ListTemplatesRequestSchema = z.object({
  category: z.enum(['frontend', 'backend', 'fullstack']).optional(),
  search: z.string().optional(),
});

export const GetTemplateRequestSchema = z.object({
  id: z.string().min(1, 'Template ID is required'),
});

export const ValidateTemplateVariablesRequestSchema = z.object({
  templateId: z.string().min(1, 'Template ID is required'),
  variables: z.record(z.string(), z.string()),
});

export const ScaffoldProjectRequestSchema = z.object({
  templateId: z.string().min(1, 'Template ID is required'),
  projectPath: z.string().min(1, 'Project path is required'),
  variables: z.record(z.string(), z.string()),
});

export type ListTemplatesRequest = z.infer<typeof ListTemplatesRequestSchema>;
export type GetTemplateRequest = z.infer<typeof GetTemplateRequestSchema>;
export type ValidateTemplateVariablesRequest = z.infer<typeof ValidateTemplateVariablesRequestSchema>;
export type ScaffoldProjectRequest = z.infer<typeof ScaffoldProjectRequestSchema>;

// ============================================
// CUSTOM AGENTS SCHEMAS
// ============================================

/**
 * Valid agent name pattern: lowercase letters, numbers, and hyphens
 */
const agentNamePattern = /^[a-z0-9-]+$/;

/**
 * Custom agent frontmatter schema
 */
export const CustomAgentFrontmatterSchema = z.object({
  name: z
    .string()
    .min(1, 'Agent name is required')
    .max(50, 'Agent name must be 50 characters or less')
    .regex(agentNamePattern, 'Agent name must contain only lowercase letters, numbers, and hyphens'),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(500, 'Description must be 500 characters or less'),
  model: z.enum(['sonnet', 'opus', 'haiku']).optional().default('sonnet'),
  'allowed-tools': z.string().optional(),
  skills: z.array(z.string()).optional().default([]),
  mcp_servers: z.array(z.string()).optional().default([]),
});

/**
 * Request to list custom agents
 */
export const ListCustomAgentsRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

/**
 * Request to get a single custom agent
 */
export const GetCustomAgentRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
  id: z.string().min(1, 'Agent ID is required'),
});

/**
 * Request to create a custom agent via upload
 */
export const CreateCustomAgentUploadRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  content: z.string().min(1, 'Agent content is required'),
  bypassWarnings: z.boolean().optional().default(false),
});

/**
 * Request to create a custom agent via AI generation
 */
export const CreateCustomAgentGenerateRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  name: z
    .string()
    .min(1, 'Agent name is required')
    .max(50, 'Agent name must be 50 characters or less')
    .regex(agentNamePattern, 'Agent name must contain only lowercase letters, numbers, and hyphens'),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(1000, 'Description must be 1000 characters or less'),
  techFocus: z.array(z.string()).optional().default([]),
  skills: z.array(z.string()).optional().default([]),
  mcpServers: z.array(z.string()).optional().default([]),
  model: z.enum(['sonnet', 'opus', 'haiku']).optional().default('sonnet'),
});

/**
 * Request to update a custom agent
 */
export const UpdateCustomAgentRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  agentId: z.string().min(1, 'Agent ID is required'),
  content: z.string().min(1, 'Agent content is required'),
  bypassWarnings: z.boolean().optional().default(false),
});

/**
 * Request to delete a custom agent
 */
export const DeleteCustomAgentRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  agentId: z.string().min(1, 'Agent ID is required'),
});

/**
 * Request to validate custom agent content
 */
export const ValidateCustomAgentRequestSchema = z.object({
  content: z.string().min(1, 'Content is required'),
});

/**
 * Request to list custom skills
 */
export const ListCustomSkillsRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

/**
 * Request to get a single custom skill
 */
export const GetCustomSkillRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
  id: z.string().min(1, 'Skill ID is required'),
});

/**
 * Request to create a custom skill
 */
export const CreateCustomSkillRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  name: z
    .string()
    .min(1, 'Skill name is required')
    .max(50, 'Skill name must be 50 characters or less')
    .regex(agentNamePattern, 'Skill name must contain only lowercase letters, numbers, and hyphens'),
  content: z.string().min(1, 'Skill content is required'),
  bypassWarnings: z.boolean().optional().default(false),
});

/**
 * Request to update a custom skill
 */
export const UpdateCustomSkillRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  skillId: z.string().min(1, 'Skill ID is required'),
  name: z
    .string()
    .min(1, 'Skill name is required')
    .max(50, 'Skill name must be 50 characters or less')
    .regex(agentNamePattern, 'Skill name must contain only lowercase letters, numbers, and hyphens'),
  content: z.string().min(1, 'Skill content is required'),
  bypassWarnings: z.boolean().optional().default(false),
});

/**
 * Request to validate custom skill content
 */
export const ValidateCustomSkillRequestSchema = z.object({
  content: z.string().min(1, 'Content is required'),
});

/**
 * Request to delete a custom skill
 */
export const DeleteCustomSkillRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  skillId: z.string().min(1, 'Skill ID is required'),
});

// Type exports for custom agents
export type CustomAgentFrontmatter = z.infer<typeof CustomAgentFrontmatterSchema>;
export type ListCustomAgentsRequest = z.infer<typeof ListCustomAgentsRequestSchema>;
export type GetCustomAgentRequest = z.infer<typeof GetCustomAgentRequestSchema>;
export type CreateCustomAgentUploadRequest = z.infer<typeof CreateCustomAgentUploadRequestSchema>;
export type CreateCustomAgentGenerateRequest = z.infer<typeof CreateCustomAgentGenerateRequestSchema>;
export type UpdateCustomAgentRequest = z.infer<typeof UpdateCustomAgentRequestSchema>;
export type DeleteCustomAgentRequest = z.infer<typeof DeleteCustomAgentRequestSchema>;
export type ValidateCustomAgentRequest = z.infer<typeof ValidateCustomAgentRequestSchema>;
export type ListCustomSkillsRequest = z.infer<typeof ListCustomSkillsRequestSchema>;
export type GetCustomSkillRequest = z.infer<typeof GetCustomSkillRequestSchema>;
export type CreateCustomSkillRequest = z.infer<typeof CreateCustomSkillRequestSchema>;
export type UpdateCustomSkillRequest = z.infer<typeof UpdateCustomSkillRequestSchema>;
export type ValidateCustomSkillRequest = z.infer<typeof ValidateCustomSkillRequestSchema>;
export type DeleteCustomSkillRequest = z.infer<typeof DeleteCustomSkillRequestSchema>;

// ============================================
// CODE GENERATION SCHEMAS
// ============================================

export const CodeGenTechnologySchema = z.enum(['openapi', 'asyncapi', 'typespec', 'protobuf', 'bpmn']);

export const CodeGenTargetLanguageSchema = z.enum([
  'typescript-express', 'typescript-fastify', 'typescript-nestjs', 'typescript-koa',
  'java-spring', 'python-fastapi', 'python-flask', 'go-gin', 'go-echo',
]);

export const CodeGenComponentSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  enabled: z.boolean(),
});

export const RefinementOptionsSchema = z.object({
  enabled: z.boolean(),
  naming: z.boolean(),
  codeStyle: z.boolean(),
  errorHandling: z.boolean(),
  testStubs: z.boolean(),
});

export const CodeGenValidateRequestSchema = z.object({
  content: z.string().min(1, 'File content is required').max(5 * 1024 * 1024, 'File too large (max 5MB)'),
  fileName: z.string().min(1, 'File name is required'),
  technology: CodeGenTechnologySchema.optional(),
});

export const CodeGenPreviewRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  content: z.string().min(1, 'File content is required'),
  fileName: z.string().min(1, 'File name is required'),
  technology: CodeGenTechnologySchema,
  targetLanguage: CodeGenTargetLanguageSchema,
  components: z.array(CodeGenComponentSchema),
});

export const CodeGenGenerateRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  content: z.string().min(1, 'File content is required'),
  fileName: z.string().min(1, 'File name is required'),
  technology: CodeGenTechnologySchema,
  targetLanguage: CodeGenTargetLanguageSchema,
  outputDir: z.string().min(1, 'Output directory is required'),
  components: z.array(CodeGenComponentSchema),
});

export const CodeGenRefineRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  generatedFiles: z.array(z.object({
    path: z.string().min(1),
    content: z.string(),
    language: z.string(),
    size: z.number(),
  })),
  technology: CodeGenTechnologySchema,
  targetLanguage: CodeGenTargetLanguageSchema,
  refinementOptions: RefinementOptionsSchema,
});

export const CodeGenAcceptRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  files: z.array(z.object({
    path: z.string().min(1),
    content: z.string(),
    accepted: z.boolean(),
  })),
  outputDir: z.string().min(1, 'Output directory is required'),
});

export const CodeGenTargetsRequestSchema = z.object({
  technology: CodeGenTechnologySchema,
});

export const CodeGenConventionsRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
});

// Type exports
export type CodeGenValidateRequest = z.infer<typeof CodeGenValidateRequestSchema>;
export type CodeGenPreviewRequest = z.infer<typeof CodeGenPreviewRequestSchema>;
export type CodeGenGenerateRequest = z.infer<typeof CodeGenGenerateRequestSchema>;
export type CodeGenRefineRequest = z.infer<typeof CodeGenRefineRequestSchema>;
export type CodeGenAcceptRequest = z.infer<typeof CodeGenAcceptRequestSchema>;
export type CodeGenTargetsRequest = z.infer<typeof CodeGenTargetsRequestSchema>;
export type CodeGenConventionsRequest = z.infer<typeof CodeGenConventionsRequestSchema>;

// ============================================
// USAGE MONITOR SCHEMAS
// ============================================

export const AlertThresholdSchema = z.object({
  id: z.string().min(1, 'Threshold ID is required'),
  name: z.string().min(1, 'Threshold name is required'),
  metric: z.enum(['daily_cost', 'monthly_cost', 'daily_tokens', 'monthly_tokens']),
  operator: z.enum(['gt', 'gte']),
  value: z.number().nonnegative('Value must be non-negative'),
  severity: z.enum(['info', 'warning', 'critical']),
  enabled: z.boolean(),
});

export const UsageConfigSchema = z.object({
  adminApiKey: z.string().optional(),
  alertThresholds: z.array(AlertThresholdSchema),
  pollingIntervalMs: z.number().int().positive('Polling interval must be a positive integer'),
});

export const SaveUsageConfigRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  config: UsageConfigSchema,
});

// Type exports
export type AlertThresholdRequest = z.infer<typeof AlertThresholdSchema>;
export type UsageConfigRequest = z.infer<typeof UsageConfigSchema>;
export type SaveUsageConfigRequest = z.infer<typeof SaveUsageConfigRequestSchema>;
