// SPDX-License-Identifier: MIT
/**
 * Orchestrator Service - Main Coordinator
 *
 * High-level orchestration service that coordinates all orchestrator functionality:
 * - Initializes and manages specialized services
 * - Provides public API surface
 * - Delegates to specialized services
 * - Maintains configuration
 */

import type { WebSocket } from 'ws';
import { ORCHESTRATOR_PORT } from '../../utils/constants.js';
import type {
  OrchestratorConfig,
  StatusPayload,
} from './types.js';
import { ValidationService } from './validation.service.js';
import { WebSocketClientService } from './websocket-client.service.js';
import { AgentSDKService } from './agent-sdk.service.js';
import { ChatSessionService } from './chat-session.service.js';
import { JobQueueService } from './job-queue.service.js';

/**
 * Load configuration from environment variables
 */
function loadConfig(): OrchestratorConfig {
  // Parse maxTurns: 0 or empty = no limit (undefined)
  const chatMaxTurns = parseInt(process.env.ORCHESTRATOR_CHAT_MAX_TURNS || '0', 10);
  const jobMaxTurns = parseInt(process.env.ORCHESTRATOR_JOB_MAX_TURNS || '0', 10);

  return {
    chat: {
      maxTurns: chatMaxTurns > 0 ? chatMaxTurns : undefined,  // No limit by default
      maxBudgetUsd: parseFloat(process.env.ORCHESTRATOR_CHAT_MAX_BUDGET || '0'),  // 0 = no limit
      maxMessageLength: parseInt(process.env.ORCHESTRATOR_MAX_MESSAGE_LENGTH || '50000', 10),
      permissionMode: (process.env.ORCHESTRATOR_CHAT_PERMISSION_MODE as OrchestratorConfig['chat']['permissionMode']) || 'default',
    },
    job: {
      maxTurns: jobMaxTurns > 0 ? jobMaxTurns : undefined,  // No limit by default
      maxBudgetUsd: parseFloat(process.env.ORCHESTRATOR_JOB_MAX_BUDGET || '0'),  // 0 = no limit
      permissionMode: (process.env.ORCHESTRATOR_JOB_PERMISSION_MODE as OrchestratorConfig['job']['permissionMode']) || 'acceptEdits',
    },
  };
}

export class OrchestratorService {
  private config: OrchestratorConfig;
  private validationService: ValidationService;
  private wsClientService: WebSocketClientService;
  private sdkService: AgentSDKService;
  private chatService: ChatSessionService;
  private jobService: JobQueueService;

  constructor() {
    // Load configuration
    this.config = loadConfig();

    // Initialize services with dependency injection
    this.validationService = new ValidationService(this.config);
    this.wsClientService = new WebSocketClientService();
    this.sdkService = new AgentSDKService();
    // JobQueueService must be created first so we can pass its context provider to ChatSessionService
    this.jobService = new JobQueueService(
      this.config,
      this.validationService,
      this.wsClientService,
      this.sdkService
    );
    this.chatService = new ChatSessionService(
      this.config,
      this.validationService,
      this.wsClientService,
      this.sdkService,
      () => this.jobService.getLastJobContext()
    );
  }

  // ============================================
  // CLIENT MANAGEMENT
  // ============================================

  addClient(ws: WebSocket): void {
    this.wsClientService.addClient(ws);
  }

  replaceClient(clientId: string, ws: WebSocket): void {
    this.wsClientService.replaceClient(clientId, ws);
  }

  removeClient(ws: WebSocket, clientId?: string): void {
    this.wsClientService.removeClient(ws, clientId);
  }

  broadcast(message: Record<string, unknown>): void {
    this.wsClientService.broadcast(message);
  }

  sendToClient(ws: WebSocket, message: Record<string, unknown>): void {
    this.wsClientService.sendToClient(ws, message);
  }

  // ============================================
  // CHAT HANDLERS
  // ============================================

  async handleChatMessage(ws: WebSocket, payload: Record<string, unknown>): Promise<void> {
    return this.chatService.handleChatMessage(ws, payload);
  }

  handleNewChat(): void {
    this.chatService.handleNewChat();
  }

  handleCancelChat(): void {
    this.chatService.handleCancelChat();
  }

  // ============================================
  // JOB HANDLERS
  // ============================================

  handleSubmitJob(payload: Record<string, unknown>): void {
    this.jobService.handleSubmitJob(payload);
  }

  handleCancelJob(payload: Record<string, unknown>): void {
    this.jobService.handleCancelJob(payload);
  }

  processNextJob(): void {
    this.jobService.processNextJob();
  }

  handleClearQueue(): void {
    this.jobService.handleClearQueue();
  }

  handleRemoveFromQueue(payload: Record<string, unknown>): void {
    this.jobService.handleRemoveFromQueue(payload);
  }

  handleForceUnstick(): void {
    this.jobService.handleForceUnstick();
  }

  handlePermissionResponse(payload: Record<string, unknown>): void {
    this.jobService.handlePermissionResponse(payload);
  }

  getQueueStatus() {
    return this.jobService.getQueueStatus();
  }

  // ============================================
  // STATUS AND CONFIGURATION
  // ============================================

  getStatus(): StatusPayload {
    const chatState = this.chatService.getChatState();
    const jobState = this.jobService.getJobState();

    return {
      connected: true,
      chatActive: chatState.active,
      chatSessionId: chatState.sessionId,
      queueLength: jobState.queue.length,
      currentJob: jobState.current?.id || null,
      jobs: jobState.queue.map((j) => ({ id: j.id, title: j.title, status: j.status })),
      config: {
        chatMaxTurns: this.config.chat.maxTurns,
        chatMaxBudget: this.config.chat.maxBudgetUsd,
        jobMaxTurns: this.config.job.maxTurns,
        jobMaxBudget: this.config.job.maxBudgetUsd,
      },
    };
  }

  handleGetStatus(ws: WebSocket): void {
    this.sendToClient(ws, {
      type: 'status',
      payload: this.getStatus(),
    });
  }

  getConfig(): OrchestratorConfig {
    return this.config;
  }

  // ============================================
  // CONFIGURATION
  // ============================================

  setInstalledAgents(agents: string[]): void {
    this.validationService.setInstalledAgents(agents);
  }

  // ============================================
  // STATE ACCESS (for compatibility)
  // ============================================

  getState() {
    return {
      clients: this.wsClientService.getState().clients,
      clientMap: this.wsClientService.getState().clientMap,
      chat: this.chatService.getChatState(),
      jobQueue: this.jobService.getJobState().queue,
      currentJob: this.jobService.getJobState().current,
      jobAbortController: this.jobService.getJobState().abortController,
      installedAgents: this.validationService.getInstalledAgents(),
    };
  }

  // ============================================
  // PORT
  // ============================================

  get port(): number {
    return ORCHESTRATOR_PORT;
  }
}

// Export singleton instance
export const orchestratorService = new OrchestratorService();

// Export types
export type { OrchestratorConfig, StatusPayload };
