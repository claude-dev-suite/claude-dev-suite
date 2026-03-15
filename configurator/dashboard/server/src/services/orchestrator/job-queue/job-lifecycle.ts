// SPDX-License-Identifier: MIT
/**
 * Job Lifecycle Handlers
 *
 * Handles job completion, errors, and state transitions.
 */

import { wsLogger } from '../../../utils/logger.js';
import type {
  Job,
  JobCompletePayload,
  JobOutputPayload,
  JobErrorPayload,
  JobCancelledPayload,
  JobContextSummary,
} from '../../../types/orchestrator.js';
import type { JobState } from '../types.js';
import type { WebSocketClientService } from '../websocket-client.service.js';
import type { AgentSDKService } from '../agent-sdk.service.js';
import type { JobPromptService } from '../job-prompt.service.js';

export interface JobCompletionContext {
  job: Job;
  correlationId: string;
  jobStartTime: number;
  currentJobSessionId: string | null;
  currentJobOutputBuffer: string;
}

/**
 * Handle job completion and broadcast results
 */
export function handleJobCompletion(
  context: JobCompletionContext,
  wsClientService: WebSocketClientService,
  promptService: JobPromptService
): JobContextSummary {
  const { job, correlationId, jobStartTime, currentJobSessionId, currentJobOutputBuffer } = context;
  const duration = Date.now() - jobStartTime;

  // Generate token-efficient context summary
  const jobContext = promptService.generateJobContextSummary(job, currentJobOutputBuffer);

  // Broadcast job complete
  wsClientService.broadcast({
    type: 'job_complete',
    payload: {
      jobId: job.id,
      success: job.status === 'completed',
      exitCode: job.status === 'completed' ? 0 : 1,
      cost: job.cost || 0,
      batchId: job.batchId,
      sessionId: currentJobSessionId || undefined,
      jobContext,
    } as JobCompletePayload,
  });

  wsLogger.info('Job completed', {
    correlationId,
    data: {
      jobId: job.id,
      status: job.status,
      cost: job.cost || 0,
      duration,
      sessionId: currentJobSessionId,
      contextSummaryLength: jobContext.findings.length,
    },
    duration,
  });

  return jobContext;
}

export interface JobErrorContext {
  job: Job;
  error: Error;
  correlationId: string;
  abortController: AbortController | null;
}

/**
 * Handle job error (abort or failure)
 */
export function handleJobError(
  context: JobErrorContext,
  wsClientService: WebSocketClientService,
  sdkService: AgentSDKService,
  broadcastQueueStatus: () => void
): void {
  const { job, error, correlationId, abortController } = context;

  const isAbort = error.name === 'AbortError'
    || abortController?.signal?.aborted
    || (error.message && error.message.toLowerCase().includes('abort'));

  if (isAbort) {
    job.status = 'cancelled';
    wsLogger.info('Job cancelled', { correlationId, data: { jobId: job.id } });
    wsClientService.broadcast({
      type: 'job_cancelled',
      payload: { jobId: job.id, reason: 'Cancelled by user' } as JobCancelledPayload & { reason: string },
    });
    broadcastQueueStatus();
  } else {
    const parsedError = sdkService.parseAPIError(error);
    const formattedError = sdkService.formatErrorForDisplay(parsedError);

    job.status = 'failed';
    job.error = parsedError.userMessage;

    wsLogger.error('Job failed', {
      correlationId,
      data: {
        jobId: job.id,
        error: error.message,
        errorType: parsedError.type,
        retryable: parsedError.retryable,
      },
      error,
    });

    wsClientService.broadcast({
      type: 'job_output',
      payload: {
        jobId: job.id,
        text: `\x1b[31m\n${formattedError}\x1b[0m`,
        raw: true,
      } as JobOutputPayload,
    });

    wsClientService.broadcast({
      type: 'job_error',
      payload: {
        jobId: job.id,
        error: parsedError.userMessage,
        errorType: parsedError.type,
        retryable: parsedError.retryable,
        suggestions: parsedError.suggestions,
      } as JobErrorPayload & { errorType: string; retryable: boolean; suggestions: string[] },
    });
  }
}

/**
 * Validate job before execution
 * Returns validated project path or null if invalid
 */
export function validateJobPreExecution(
  job: Job,
  correlationId: string,
  defaultProjectPath: string,
  validationService: { validateProjectPath: (p: string) => { valid: boolean; error?: string; path?: string }; validateAgentId: (id: string) => boolean; getInstalledAgents: () => Set<string> },
  wsClientService: WebSocketClientService
): string | null {
  const projectPath = job.projectPath || defaultProjectPath;
  const pathValidation = validationService.validateProjectPath(projectPath);

  if (!pathValidation.valid) {
    wsLogger.error('Job failed: invalid project path', {
      correlationId,
      data: { jobId: job.id, projectPath, error: pathValidation.error },
    });
    wsClientService.broadcast({
      type: 'job_error',
      payload: { jobId: job.id, error: pathValidation.error } as JobErrorPayload,
    });
    return null;
  }

  // Validate agent IDs in subTasks
  const SPECIAL_AGENT_IDS = ['consolidator'];
  if (job.subTasks && job.subTasks.length > 0) {
    for (const subTask of job.subTasks) {
      if (!SPECIAL_AGENT_IDS.includes(subTask.agentId) && !validationService.validateAgentId(subTask.agentId)) {
        const installedAgents = Array.from(validationService.getInstalledAgents());
        wsClientService.broadcast({
          type: 'job_error',
          payload: {
            jobId: job.id,
            error: `Unknown agent: ${subTask.agentId}. Available agents: ${installedAgents.join(', ')}`,
          } as JobErrorPayload,
        });
        return null;
      }
    }
  }

  return pathValidation.path!;
}

/**
 * Get queue status for broadcasting
 */
export function getQueueStatus(state: JobState): {
  currentJob: { id: string; title: string; status: string } | null;
  queuedJobs: Array<{ id: string; title: string; status: string; createdAt: string }>;
  queueLength: number;
} {
  return {
    currentJob: state.current
      ? {
          id: state.current.id,
          title: state.current.title,
          status: state.current.status,
        }
      : null,
    queuedJobs: state.queue.map((j) => ({
      id: j.id,
      title: j.title,
      status: j.status,
      createdAt: j.createdAt,
    })),
    queueLength: state.queue.length,
  };
}
