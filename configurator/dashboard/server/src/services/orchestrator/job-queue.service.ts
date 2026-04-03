// SPDX-License-Identifier: MIT
/**
 * Job Queue Service
 *
 * Manages job queue and execution:
 * - Job queuing and lifecycle
 * - Single and multi-subtask execution
 * - Context carry-forward between subtasks
 * - Job cancellation
 * - Real-time output streaming
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { getProjectPath } from '../../utils/constants.js';
import { wsLogger, generateCorrelationId } from '../../utils/logger.js';
import type {
  Job,
  JobStartedPayload,
  JobContextSummary,
} from '../../types/orchestrator.js';
import type {
  JobState,
  OrchestratorConfig,
  TrackedJob,
  SubTaskExecutionResult,
} from './types.js';
import type { ValidationService } from './validation.service.js';
import type { WebSocketClientService } from './websocket-client.service.js';
import type { AgentSDKService } from './agent-sdk.service.js';
import { JobPromptService } from './job-prompt.service.js';
import { PermissionService } from './permission.service.js';
import {
  processAssistantBlock,
  processUserBlock,
  broadcastSubtaskHeader,
  broadcastTaskComplete,
  handleJobCompletion,
  handleJobError,
  validateJobPreExecution,
  getQueueStatus,
  handleSubmitJob as handleSubmitJobImpl,
  handleCancelJob as handleCancelJobImpl,
  handleClearQueue as handleClearQueueImpl,
  handleRemoveFromQueue as handleRemoveFromQueueImpl,
  handleForceUnstick as handleForceUnstickImpl,
} from './job-queue/index.js';

export class JobQueueService {
  private state: JobState;
  private config: OrchestratorConfig;
  private validationService: ValidationService;
  private wsClientService: WebSocketClientService;
  private sdkService: AgentSDKService;
  private promptService: JobPromptService;
  private permissionService: PermissionService;
  /** Session ID from current job execution (for chat continuity) */
  private currentJobSessionId: string | null = null;
  /** Output buffer for current job (for context summary generation) */
  private currentJobOutputBuffer: string = '';
  /** Whether the consolidator subtask has provided its output for the current job */
  private consolidatorOutputReceived: boolean = false;
  /** Last completed job context (for chat continuity) */
  private lastJobContext: JobContextSummary | null = null;

  constructor(
    config: OrchestratorConfig,
    validationService: ValidationService,
    wsClientService: WebSocketClientService,
    sdkService: AgentSDKService
  ) {
    this.config = config;
    this.validationService = validationService;
    this.wsClientService = wsClientService;
    this.sdkService = sdkService;
    this.promptService = new JobPromptService(sdkService);
    this.permissionService = new PermissionService();
    this.state = {
      queue: [],
      current: null,
      abortController: null,
    };
  }

  /**
   * Execute a single subtask and return its output
   */
  private async executeSubTask(
    job: TrackedJob,
    prompt: string,
    projectPath: string
  ): Promise<SubTaskExecutionResult> {
    let outputBuffer = '';

    for await (const message of query({
      prompt,
      options: {
        cwd: projectPath,
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        settingSources: ['project'],
        allowedTools: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep', 'Task', 'WebFetch', 'WebSearch'],
        permissionMode: (this.config.job.permissionMode === 'interactive' ? 'default' : this.config.job.permissionMode) as 'default' | 'acceptEdits' | 'bypassPermissions',
        abortController: this.state.abortController || undefined,
        ...(this.config.job.maxTurns !== undefined && { maxTurns: this.config.job.maxTurns }),
        ...(this.config.job.maxBudgetUsd > 0 && { maxBudgetUsd: this.config.job.maxBudgetUsd }),
        stderr: (data: string) => {
          wsLogger.error('Claude stderr', { jobId: job.id, stderr: data });
        },
      },
    })) {
      // Capture session ID for chat continuity
      if (this.sdkService.isSystemInitMessage(message) && !this.currentJobSessionId) {
        this.currentJobSessionId = message.session_id;
        wsLogger.info('Job session initialized (subtask)', { sessionId: message.session_id });
      }

      if (this.sdkService.isAssistantMessage(message)) {
        for (const block of message.message.content) {
          // Permission check for interactive mode
          if (
            block.type === 'tool_use' &&
            block.name &&
            this.config.job.permissionMode === 'interactive'
          ) {
            const input = (block.input || {}) as Record<string, unknown>;
            const risk = this.permissionService.classifyOperation(block.name, input);
            if (risk.risk === 'high' || risk.risk === 'critical') {
              const requestId = Math.random().toString(36).slice(2, 11);
              this.wsClientService.broadcast({
                type: 'permission_request',
                payload: {
                  requestId,
                  jobId: job.id,
                  toolName: block.name,
                  input,
                  ...risk,
                  timeoutMs: 30_000,
                },
              });
              const decision = await this.permissionService.createRequest(requestId, 30_000);
              if (decision === 'deny') {
                this.state.abortController?.abort();
                throw new Error(`Operation denied by user: ${risk.description}`);
              }
            }
          }

          const blockOutput = processAssistantBlock(
            block as { type: string; text?: string; name?: string; input?: Record<string, unknown> },
            job.id,
            this.wsClientService,
            this.sdkService
          );
          outputBuffer += blockOutput;
        }
      }

      if (this.sdkService.isUserMessage(message)) {
        for (const block of message.message.content) {
          processUserBlock(
            block as { type: string; content?: string | unknown },
            job.id,
            this.wsClientService,
            this.sdkService
          );
        }
      }

      if (this.sdkService.isResultMessage(message)) {
        job.cost = (job.cost || 0) + (message.total_cost_usd || 0);
        return { success: !message.is_error, output: outputBuffer };
      }
    }

    return { success: true, output: outputBuffer };
  }

  /**
   * Execute a single task job (no subtasks or single subtask)
   */
  private async executeSingleTask(
    job: TrackedJob,
    projectPath: string
  ): Promise<void> {
    const prompt = this.promptService.generateJobPrompt(job);
    const result = await this.executeSubTask(job, prompt, projectPath);

    this.currentJobOutputBuffer = result.output;
    job.status = result.success ? 'completed' : 'failed';

    broadcastTaskComplete(job.id, null, this.wsClientService);
  }

  /**
   * Execute a multi-subtask job sequentially
   */
  private async executeMultiSubTaskJob(
    job: TrackedJob,
    projectPath: string
  ): Promise<void> {
    wsLogger.info('Multi-subtask job', { subtaskCount: job.subTasks!.length });

    while (job.currentSubTaskIndex < job.subTasks!.length) {
      const currentTask = job.subTasks![job.currentSubTaskIndex];
      if (!currentTask) {
        throw new Error(`Subtask at index ${job.currentSubTaskIndex} is undefined`);
      }

      // Broadcast subtask starting
      this.wsClientService.broadcast({
        type: 'subtask_started',
        payload: {
          jobId: job.id,
          agentId: currentTask.agentId,
          subTaskIndex: job.currentSubTaskIndex,
          totalSubTasks: job.subTasks!.length,
        },
      });

      wsLogger.info('Subtask starting', {
        index: job.currentSubTaskIndex + 1,
        total: job.subTasks!.length,
        agentId: currentTask.agentId
      });

      broadcastSubtaskHeader(
        job.id,
        currentTask.agentId,
        job.currentSubTaskIndex,
        job.subTasks!.length,
        this.wsClientService
      );

      const prompt = this.promptService.generateSubTaskPrompt(job);
      const result = await this.executeSubTask(job, prompt, projectPath);

      job.completedSubTasks[currentTask.agentId] = result.output;

      // Accumulate output for job context summary generation.
      // The consolidator (final summary) replaces all prior output as the primary context.
      // Before the consolidator runs, accumulate all subtask outputs.
      if (currentTask.agentId === 'consolidator') {
        this.currentJobOutputBuffer = result.output;
        this.consolidatorOutputReceived = true;
      } else if (!this.consolidatorOutputReceived) {
        this.currentJobOutputBuffer += result.output;
      }

      this.wsClientService.broadcast({
        type: 'subtask_complete',
        payload: {
          jobId: job.id,
          agentId: currentTask.agentId,
          subTaskIndex: job.currentSubTaskIndex,
          success: result.success,
        },
      });

      wsLogger.info('Subtask completed', {
        index: job.currentSubTaskIndex + 1,
        success: result.success
      });

      job.currentSubTaskIndex++;
    }

    job.status = 'completed';
    broadcastTaskComplete(job.id, job.subTasks!.length, this.wsClientService);
  }

  /**
   * Execute a job
   */
  private async executeJob(job: Job): Promise<void> {
    const correlationId = generateCorrelationId();
    const jobStartTime = Date.now();

    wsLogger.info('Job started', {
      correlationId,
      data: {
        jobId: job.id,
        title: job.title,
        hasSubTasks: !!job.subTasks?.length,
        subTaskCount: job.subTasks?.length || 0,
      },
    });

    // Reset session ID and output buffer
    this.currentJobSessionId = null;
    this.currentJobOutputBuffer = '';
    this.consolidatorOutputReceived = false;

    // Initialize job tracking
    const trackedJob = job as TrackedJob;
    trackedJob.currentSubTaskIndex = 0;
    trackedJob.completedSubTasks = {};
    trackedJob.currentOutputBuffer = '';

    this.state.current = trackedJob;
    this.state.abortController = new AbortController();
    job.status = 'running';

    // Validate job
    const projectPath = validateJobPreExecution(
      job,
      correlationId,
      getProjectPath(),
      this.validationService,
      this.wsClientService
    );
    if (!projectPath) {
      this.state.current = null;
      this.processNextJob();
      return;
    }

    this.wsClientService.broadcast({
      type: 'job_started',
      payload: { jobId: job.id, title: job.title } as JobStartedPayload,
    });
    wsLogger.info('Job starting', { jobId: job.id, title: job.title });

    try {
      const hasMultipleSubTasks = job.subTasks && job.subTasks.length > 1;

      if (hasMultipleSubTasks) {
        await this.executeMultiSubTaskJob(trackedJob, projectPath);
      } else {
        await this.executeSingleTask(trackedJob, projectPath);
      }

      this.lastJobContext = handleJobCompletion(
        {
          job,
          correlationId,
          jobStartTime,
          currentJobSessionId: this.currentJobSessionId,
          currentJobOutputBuffer: this.currentJobOutputBuffer,
        },
        this.wsClientService,
        this.promptService
      );
    } catch (error) {
      handleJobError(
        {
          job,
          error: error as Error,
          correlationId,
          abortController: this.state.abortController,
        },
        this.wsClientService,
        this.sdkService,
        () => this.broadcastQueueStatus()
      );
    } finally {
      this.permissionService.clearAll();
      this.state.current = null;
      this.state.abortController = null;
      this.processNextJob();
      this.broadcastQueueStatus();
    }
  }

  /**
   * Process next job in queue
   */
  processNextJob(): void {
    wsLogger.debug('processNextJob called', {
      data: {
        hasCurrentJob: !!this.state.current,
        currentJobId: this.state.current?.id || null,
        queueLength: this.state.queue.length,
        queuedJobIds: this.state.queue.map(j => j.id),
      },
    });

    if (this.state.current) {
      wsLogger.info('processNextJob: blocked by current job', {
        data: {
          currentJobId: this.state.current.id,
          currentJobTitle: this.state.current.title,
          currentJobStatus: this.state.current.status,
          queueLength: this.state.queue.length,
        },
      });
      return;
    }

    if (this.state.queue.length === 0) {
      wsLogger.debug('processNextJob: queue is empty');
      return;
    }

    const job = this.state.queue.shift()!;
    wsLogger.info('processNextJob: starting job', {
      data: {
        jobId: job.id,
        jobTitle: job.title,
        remainingInQueue: this.state.queue.length,
      },
    });
    this.executeJob(job);
  }

  /**
   * Submit a new job
   */
  handleSubmitJob(payload: Record<string, unknown>): void {
    handleSubmitJobImpl(
      payload,
      this.state,
      this.wsClientService,
      () => this.broadcastQueueStatus(),
      () => this.processNextJob()
    );
  }

  /**
   * Cancel a job
   */
  handleCancelJob(payload: Record<string, unknown>): void {
    handleCancelJobImpl(
      payload,
      this.state,
      this.wsClientService,
      () => this.broadcastQueueStatus()
    );
  }

  /**
   * Get current job state
   */
  getJobState(): JobState {
    return this.state;
  }

  /**
   * Get detailed queue status for debugging/UI
   */
  getQueueStatus(): {
    currentJob: { id: string; title: string; status: string } | null;
    queuedJobs: Array<{ id: string; title: string; status: string; createdAt: string }>;
    queueLength: number;
  } {
    return getQueueStatus(this.state);
  }

  /**
   * Broadcast current queue status to all connected clients
   */
  private broadcastQueueStatus(): void {
    const status = this.getQueueStatus();
    this.wsClientService.broadcast({
      type: 'queue_status',
      payload: status,
    });
  }

  /**
   * Clear all jobs from the queue
   */
  handleClearQueue(): void {
    handleClearQueueImpl(
      this.state,
      this.wsClientService,
      () => this.broadcastQueueStatus()
    );
  }

  /**
   * Remove a specific job from the queue by ID
   */
  handleRemoveFromQueue(payload: Record<string, unknown>): void {
    handleRemoveFromQueueImpl(
      payload,
      this.state,
      this.wsClientService,
      () => this.broadcastQueueStatus()
    );
  }

  /**
   * Force-clear the current job (use when stuck)
   */
  handleForceUnstick(): void {
    handleForceUnstickImpl(
      this.state,
      this.wsClientService,
      () => this.processNextJob(),
      () => this.broadcastQueueStatus()
    );
  }

  /**
   * Handle a permission response from the client.
   */
  handlePermissionResponse(payload: Record<string, unknown>): void {
    const { requestId, decision } = payload as { requestId?: string; decision?: string };
    if (!requestId || (decision !== 'allow' && decision !== 'deny')) {
      wsLogger.warn('Invalid permission_response payload', { data: payload });
      return;
    }
    const resolved = this.permissionService.resolveRequest(requestId, decision as 'allow' | 'deny');
    if (!resolved) {
      wsLogger.warn('No pending permission request for requestId', { data: { requestId } });
    }
  }

  /**
   * Get the last completed job context summary
   */
  getLastJobContext(): JobContextSummary | null {
    return this.lastJobContext;
  }
}
