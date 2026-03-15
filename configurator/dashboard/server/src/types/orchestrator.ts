// SPDX-License-Identifier: MIT
/**
 * Orchestrator Types for Dev-Suite Dashboard
 *
 * These types represent job management, chat sessions, and WebSocket
 * communication for the Agent SDK-based orchestrator.
 *
 * NOTE: This implementation is Agent SDK-based only.
 * PTY-based orchestrator types have been removed.
 */

// ============================================
// JOB STATUS TYPES
// ============================================

/**
 * Job execution status
 */
export type JobStatus =
  | 'pending'    // Job is queued but not started
  | 'running'    // Job is currently executing
  | 'completed'  // Job finished successfully
  | 'failed'     // Job encountered an error
  | 'cancelled'; // Job was cancelled by user

// ============================================
// JOB TYPES
// ============================================

/**
 * Sub-task definition for multi-agent jobs
 */
export interface SubTask {
  /** Agent ID to execute this sub-task */
  agentId: string;
  /** Task description/prompt for the agent */
  task: string;
  /** IDs of subtasks that must complete before this one (for context carry-forward) */
  dependencies?: string[];
}

/**
 * Job definition for orchestrator execution
 */
export interface Job {
  /** Unique job identifier */
  id: string;
  /** Job title/display name */
  title: string;
  /** Current execution status */
  status: JobStatus;
  /** Project path where job executes */
  projectPath: string;
  /** Main prompt for the job */
  prompt: string;
  /** Optional context to prepend to prompt */
  context?: string;
  /** Sub-tasks for multi-agent execution */
  subTasks?: SubTask[];
  /** Batch ID for grouped jobs (e.g., code review) */
  batchId?: string;
  /** Result text when completed */
  result?: string;
  /** Error message if failed */
  error?: string;
  /** Total cost in USD */
  cost?: number;
  /** ISO timestamp of job creation */
  createdAt: string;
}

/**
 * Job stored in recent jobs for chat context
 */
export interface RecentJob {
  /** Job title */
  title: string;
  /** Job result text */
  result: string;
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Project path */
  projectPath: string;
  /** Optional batch ID */
  batchId?: string;
  /** Job ID */
  jobId: string;
}

// ============================================
// BATCH TYPES
// ============================================

/**
 * Batch tracking for grouped jobs (e.g., multiple code reviews)
 */
export interface JobBatch {
  /** Unique batch identifier */
  id: string;
  /** IDs of all jobs in this batch */
  jobIds: string[];
  /** Completed job results */
  completedJobs: CompletedBatchJob[];
  /** Timestamp when batch started */
  startTime: number;
}

/**
 * Completed job within a batch
 */
export interface CompletedBatchJob {
  /** Job ID */
  jobId: string;
  /** Job title */
  title: string;
  /** Result text */
  result?: string;
  /** Whether job succeeded */
  success: boolean;
  /** Cost in USD */
  cost?: number;
}

/**
 * Batch summary generated after all jobs complete
 */
export interface BatchSummary {
  /** Total number of jobs in batch */
  totalJobs: number;
  /** Number of successful jobs */
  successCount: number;
  /** Number of failed jobs */
  failedCount: number;
  /** Total cost formatted as string */
  totalCost: string;
  /** Aggregated results from all jobs */
  allResults: string;
  /** ISO timestamp of completion */
  completedAt: string;
}

// ============================================
// CHAT SESSION TYPES
// ============================================

/**
 * Chat session state
 */
export interface ChatSessionState {
  /** Session ID from Agent SDK */
  sessionId: string | null;
  /** Whether a chat is currently active */
  active: boolean;
  /** Project path for the session */
  projectPath: string | null;
}

/**
 * Chat completion result
 */
export interface ChatCompletionResult {
  /** Whether chat completed successfully */
  success: boolean;
  /** Result text */
  result: string;
  /** Cost in USD */
  cost: number;
  /** Number of turns */
  turns: number;
  /** Session ID */
  sessionId: string;
  /** Token usage */
  tokens: TokenUsage;
}

/**
 * Token usage statistics
 */
export interface TokenUsage {
  /** Input tokens */
  input?: number;
  /** Output tokens */
  output?: number;
  /** Total tokens */
  total?: number;
}

// ============================================
// WEBSOCKET MESSAGE TYPES
// ============================================

/**
 * WebSocket message types - Client to Server
 */
export type WsClientMessageType =
  | 'chat_message'      // Send a chat message
  | 'submit_job'        // Submit a new job
  | 'cancel_job'        // Cancel a running job
  | 'cancel_chat'       // Cancel running chat
  | 'get_status'        // Request current status
  | 'new_chat'          // Start new chat session
  | 'end_chat'          // End current chat session
  | 'clear_history'     // Clear chat history
  | 'get_queue_status'  // Get detailed queue status
  | 'clear_queue'       // Clear all jobs from queue
  | 'remove_from_queue' // Remove specific job from queue
  | 'force_unstick'     // Force-clear stuck job
  | 'permission_response'; // User response to a permission request

/**
 * WebSocket message types - Server to Client
 */
export type WsServerMessageType =
  | 'job_queued'        // Job added to queue
  | 'job_started'       // Job execution started
  | 'job_output'        // Job output chunk
  | 'job_complete'      // Job finished successfully
  | 'job_error'         // Job encountered error
  | 'job_cancelled'     // Job was cancelled
  | 'subtask_started'   // Subtask execution started (multi-agent jobs)
  | 'subtask_complete'  // Subtask finished (multi-agent jobs)
  | 'batch_complete'    // Batch of jobs completed
  | 'chat_started'      // Chat session started
  | 'chat_output'       // Chat output chunk
  | 'chat_complete'     // Chat finished
  | 'chat_error'        // Chat encountered error
  | 'chat_cancelled'    // Chat was cancelled
  | 'chat_session'      // Session ID update
  | 'chat_agent'        // Agent detection notification
  | 'chat_cleared'      // Chat session cleared
  | 'chat_response_complete' // Legacy compatibility
  | 'history_cleared'   // History was cleared
  | 'status'            // Status update
  | 'error'             // General error
  | 'queue_status'      // Queue status response
  | 'queue_cleared'     // Queue was cleared
  | 'job_removed'       // Job removed from queue
  | 'queue_unstuck'     // Queue was force-unstuck
  | 'permission_request'; // Permission required for a tool operation

/**
 * All WebSocket message types
 */
export type WsMessageType = WsClientMessageType | WsServerMessageType;

// ============================================
// WEBSOCKET MESSAGE PAYLOADS
// ============================================

/**
 * Chat message payload (client to server)
 */
export interface ChatMessagePayload {
  /** Message text */
  message: string;
  /** Optional session ID to resume */
  sessionId?: string;
  /** Whether to resume session (replay full history - expensive!) */
  resumeSession?: boolean;
  /** Optional context object */
  context?: {
    /** Project path override */
    projectPath?: string;
  };
  /** Job context for token-efficient continuity (preferred over resumeSession) */
  jobContext?: JobContextSummary;
}

/**
 * Submit job payload (client to server)
 */
export interface SubmitJobPayload {
  /** Optional custom job ID */
  id?: string;
  /** Job title */
  title: string;
  /** Main prompt */
  prompt: string;
  /** Optional context */
  context?: string;
  /** Project path */
  projectPath: string;
  /** Sub-tasks for multi-agent jobs */
  subTasks?: SubTask[];
}

/**
 * Cancel job payload (client to server)
 */
export interface CancelJobPayload {
  /** Job ID to cancel */
  jobId: string;
}

/**
 * Job queued payload (server to client)
 */
export interface JobQueuedPayload {
  /** Job ID */
  jobId: string;
  /** Position in queue */
  position: number;
  /** Batch ID if applicable */
  batchId?: string;
}

/**
 * Job started payload (server to client)
 */
export interface JobStartedPayload {
  /** Job ID */
  jobId: string;
  /** Job title */
  title: string;
}

/**
 * Job output payload (server to client)
 */
export interface JobOutputPayload {
  /** Job ID */
  jobId: string;
  /** Output text (may contain ANSI codes) */
  text: string;
  /** Whether text is raw (contains ANSI) */
  raw?: boolean;
}

/**
 * Structured job context for token-efficient chat continuity
 * This replaces session resume (~50k tokens) with a summary (~500 tokens)
 */
export interface JobContextSummary {
  /** Job ID for reference */
  jobId: string;
  /** Job title/type */
  title: string;
  /** What was analyzed/done */
  action: string;
  /** Key findings/results (truncated) */
  findings: string;
  /** Project path */
  projectPath: string;
  /** Timestamp */
  completedAt: string;
}

/**
 * Job complete payload (server to client)
 */
export interface JobCompletePayload {
  /** Job ID */
  jobId: string;
  /** Whether job succeeded */
  success: boolean;
  /** Exit code */
  exitCode: number;
  /** Cost in USD */
  cost: number;
  /** Batch ID if applicable */
  batchId?: string;
  /** Session ID for resuming in chat (enables job-to-chat continuity) */
  sessionId?: string;
  /** Structured context summary for token-efficient chat continuity */
  jobContext?: JobContextSummary;
}

/**
 * Job error payload (server to client)
 */
export interface JobErrorPayload {
  /** Job ID */
  jobId: string;
  /** Error message */
  error: string;
}

/**
 * Job cancelled payload (server to client)
 */
export interface JobCancelledPayload {
  /** Job ID */
  jobId: string;
}

/**
 * Batch complete payload (server to client)
 */
export interface BatchCompletePayload {
  /** Batch ID */
  batchId: string;
  /** Total jobs in batch */
  totalJobs: number;
  /** Batch summary */
  summary: BatchSummary;
  /** Individual job results */
  jobs: CompletedBatchJob[];
}

/**
 * Chat output payload (server to client)
 */
export interface ChatOutputPayload {
  /** Output text (may contain ANSI codes) */
  text: string;
  /** Whether text is raw (contains ANSI) */
  raw?: boolean;
  /** Content type hint */
  contentType?: 'text' | 'tool' | 'result' | 'error';
}

/**
 * Chat complete payload (server to client)
 */
export interface ChatCompletePayload {
  /** Whether chat succeeded */
  success: boolean;
  /** Result text */
  result: string;
  /** Cost in USD */
  cost: number;
  /** Number of turns */
  turns: number;
  /** Session ID */
  sessionId: string;
  /** Token usage */
  tokens: TokenUsage;
}

/**
 * Chat session payload (server to client)
 */
export interface ChatSessionPayload {
  /** Session ID */
  sessionId: string;
}

/**
 * Chat agent payload (server to client)
 */
export interface ChatAgentPayload {
  /** Detected agent ID */
  agent: string;
  /** Whether agent was explicitly mentioned */
  explicit: boolean;
  /** Display message */
  message: string;
}

/**
 * Error payload (server to client)
 */
export interface ErrorPayload {
  /** Error message */
  message: string;
  /** Error code */
  code?: string;
}

// ============================================
// WEBSOCKET MESSAGE WRAPPER
// ============================================

/**
 * Generic WebSocket message wrapper
 */
export interface WsMessage<T = unknown> {
  /** Message type */
  type: WsMessageType;
  /** Message payload */
  payload: T;
}

// ============================================
// PERMISSION PAYLOADS
// ============================================

/**
 * Permission request payload (server to client)
 */
export interface PermissionRequestPayload {
  /** Unique request ID */
  requestId: string;
  /** Job ID this request belongs to */
  jobId: string;
  /** Tool being requested */
  toolName: string;
  /** Tool input arguments */
  input: Record<string, unknown>;
  /** Risk classification */
  risk: 'low' | 'medium' | 'high' | 'critical';
  /** Human-readable risk category */
  category: string;
  /** Human-readable description of the operation */
  description: string;
  /** How long (ms) before auto-allow */
  timeoutMs: number;
}

/**
 * Permission response payload (client to server)
 */
export interface PermissionResponsePayload {
  /** Request ID to resolve */
  requestId: string;
  /** User decision */
  decision: 'allow' | 'deny';
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Type guard for JobStatus
 */
export function isJobStatus(value: unknown): value is JobStatus {
  return (
    typeof value === 'string' &&
    ['pending', 'running', 'completed', 'failed', 'cancelled'].includes(value)
  );
}

/**
 * Type guard for Job
 */
export function isJob(value: unknown): value is Job {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.title === 'string' &&
    isJobStatus(obj.status) &&
    typeof obj.projectPath === 'string' &&
    typeof obj.prompt === 'string' &&
    typeof obj.createdAt === 'string'
  );
}

/**
 * Type guard for WsMessage
 */
export function isWsMessage(value: unknown): value is WsMessage {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.type === 'string' && 'payload' in obj;
}
