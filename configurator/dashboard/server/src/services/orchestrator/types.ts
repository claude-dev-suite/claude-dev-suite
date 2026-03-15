// SPDX-License-Identifier: MIT
/**
 * Shared types for orchestrator services
 */

import type { WebSocket } from 'ws';
import type {
  Job,
  JobStatus,
} from '../../types/orchestrator.js';
// Re-export for convenience (used by other orchestrator services)
export type { SubTask, ChatSessionState } from '../../types/orchestrator.js';

// ============================================
// CONFIGURATION
// ============================================

export interface OrchestratorConfig {
  chat: {
    maxTurns: number | undefined;  // undefined = no limit
    maxBudgetUsd: number;  // 0 = no limit
    maxMessageLength: number;
    permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'interactive';
  };
  job: {
    maxTurns: number | undefined;  // undefined = no limit
    maxBudgetUsd: number;  // 0 = no limit
    permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'interactive';
  };
}

// ============================================
// STATE INTERFACES
// ============================================

export interface ChatState {
  sessionId: string | null;
  active: boolean;
  projectPath: string | null;
  abortController: AbortController | null;
}

export interface JobState {
  queue: Job[];
  current: (Job & {
    currentSubTaskIndex: number;
    completedSubTasks: Record<string, string>;
    currentOutputBuffer: string;
  }) | null;
  abortController: AbortController | null;
}

export interface ClientState {
  clients: Set<WebSocket>;
  clientMap: Map<string, WebSocket>;
}

// ============================================
// VALIDATION RESULTS
// ============================================

export interface PathValidationResult {
  valid: boolean;
  error?: string;
  path?: string;
}

export interface MessageValidationResult {
  valid: boolean;
  error?: string;
}

// ============================================
// AGENT SDK MESSAGE TYPES
// ============================================

export interface SystemInitMessage {
  type: 'system';
  subtype: 'init';
  session_id: string;
}

export interface AssistantMessage {
  type: 'assistant';
  message: {
    content: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>
    }>;
  };
}

export interface UserMessage {
  type: 'user';
  message: {
    content: Array<{
      type: string;
      content?: string
    }>;
  };
}

export interface ResultMessage {
  type: 'result';
  is_error: boolean;
  result?: string;
  total_cost_usd?: number;
  num_turns?: number;
  session_id?: string;
  usage?: { input_tokens: number; output_tokens: number };
}

export type AgentSDKMessage =
  | SystemInitMessage
  | AssistantMessage
  | UserMessage
  | ResultMessage;

// ============================================
// SERVICE INTERFACES
// ============================================

export interface IValidationService {
  validateProjectPath(projectPath: string): PathValidationResult;
  validateMessageLength(text: string): MessageValidationResult;
  validateAgentId(agentId: string): boolean;
}

export interface IWebSocketClientService {
  addClient(ws: WebSocket): void;
  replaceClient(clientId: string, ws: WebSocket): void;
  removeClient(ws: WebSocket, clientId?: string): void;
  broadcast(message: Record<string, unknown>): void;
  sendToClient(ws: WebSocket, message: Record<string, unknown>): void;
  getClientCount(): number;
}

export interface IAgentSDKService {
  isSystemInitMessage(msg: unknown): msg is SystemInitMessage;
  isAssistantMessage(msg: unknown): msg is AssistantMessage;
  isUserMessage(msg: unknown): msg is UserMessage;
  isResultMessage(msg: unknown): msg is ResultMessage;
  formatToolUse(name: string, input: Record<string, unknown>): string;
  truncateText(text: string, maxLen?: number): string;
  truncateOutput(text: string, maxChars?: number): string;
}

export interface IChatSessionService {
  handleChatMessage(ws: WebSocket, payload: Record<string, unknown>): Promise<void>;
  handleNewChat(): void;
  handleCancelChat(): void;
  getChatState(): ChatState;
}

export interface IJobQueueService {
  handleSubmitJob(payload: Record<string, unknown>): void;
  handleCancelJob(payload: Record<string, unknown>): void;
  processNextJob(): void;
  getJobState(): JobState;
  handlePermissionResponse(payload: Record<string, unknown>): void;
}

// ============================================
// STATUS PAYLOAD
// ============================================

export interface StatusPayload {
  connected: boolean;
  chatActive: boolean;
  chatSessionId: string | null;
  queueLength: number;
  currentJob: string | null;
  jobs: Array<{ id: string; title: string; status: JobStatus }>;
  config: {
    chatMaxTurns: number | undefined;  // undefined = no limit
    chatMaxBudget: number;
    jobMaxTurns: number | undefined;  // undefined = no limit
    jobMaxBudget: number;
  };
}

// ============================================
// SUB-TASK EXECUTION
// ============================================

export interface SubTaskExecutionResult {
  success: boolean;
  output: string;
}

export interface TrackedJob extends Job {
  currentSubTaskIndex: number;
  completedSubTasks: Record<string, string>;
  currentOutputBuffer: string;
}
