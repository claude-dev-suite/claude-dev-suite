// SPDX-License-Identifier: MIT
/**
 * Queue Handlers
 *
 * Handles queue operations: submit, cancel, clear, remove, unstick.
 */

import { getProjectPath } from '../../../utils/constants.js';
import { wsLogger, generateCorrelationId } from '../../../utils/logger.js';
import type {
  Job,
  SubTask,
  JobQueuedPayload,
  JobErrorPayload,
  JobCancelledPayload,
} from '../../../types/orchestrator.js';
import type { JobState } from '../types.js';
import type { WebSocketClientService } from '../websocket-client.service.js';

/**
 * Create a new job from payload
 */
export function createJobFromPayload(
  payload: Record<string, unknown>
): Job {
  const jobId = (payload.id as string) || `job-${Date.now()}`;
  const title = (payload.title as string) || 'Untitled Job';

  return {
    id: jobId,
    title,
    prompt: (payload.prompt as string) || '',
    context: payload.context as string | undefined,
    projectPath: (payload.projectPath as string) || getProjectPath(),
    status: 'pending',
    subTasks: payload.subTasks as SubTask[] | undefined,
    batchId: payload.batchId as string | undefined,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Validate job submission
 * Returns error message or null if valid
 */
export function validateJobSubmission(
  title: string,
  correlationId: string
): string | null {
  if (title.trim().length < 3) {
    wsLogger.warn('Job rejected: invalid title', {
      correlationId,
      data: { title },
    });
    return 'Job title must be at least 3 characters';
  }
  return null;
}

/**
 * Handle job submission
 */
export function handleSubmitJob(
  payload: Record<string, unknown>,
  state: JobState,
  wsClientService: WebSocketClientService,
  broadcastQueueStatus: () => void,
  processNextJob: () => void
): void {
  const correlationId = generateCorrelationId();
  const jobId = (payload.id as string) || `job-${Date.now()}`;
  const title = (payload.title as string) || 'Untitled Job';
  const receivedSubTasks = payload.subTasks as SubTask[] | undefined;

  wsLogger.info('Job submitted', {
    correlationId,
    data: {
      jobId,
      title,
      hasSubTasks: !!receivedSubTasks?.length,
      subTaskCount: receivedSubTasks?.length || 0,
    },
  });

  // Validate job title length
  const validationError = validateJobSubmission(title, correlationId);
  if (validationError) {
    wsClientService.broadcast({
      type: 'job_error',
      payload: { jobId, error: validationError } as JobErrorPayload,
    });
    return;
  }

  const job = createJobFromPayload(payload);

  state.queue.push(job);
  wsLogger.info('Job queued', {
    correlationId,
    data: {
      jobId: job.id,
      queueLength: state.queue.length,
      position: state.queue.length,
    },
  });

  wsClientService.broadcast({
    type: 'job_queued',
    payload: {
      jobId: job.id,
      position: state.queue.length,
      batchId: job.batchId,
    } as JobQueuedPayload,
  });

  broadcastQueueStatus();

  if (!state.current) {
    processNextJob();
  }
}

/**
 * Handle job cancellation
 */
export function handleCancelJob(
  payload: Record<string, unknown>,
  state: JobState,
  wsClientService: WebSocketClientService,
  broadcastQueueStatus: () => void
): void {
  const jobId = payload.jobId as string | undefined;

  // If jobId provided, try to remove from queue first
  if (jobId) {
    const queueIndex = state.queue.findIndex((j) => j.id === jobId);
    if (queueIndex !== -1) {
      state.queue.splice(queueIndex, 1);
      wsClientService.broadcast({
        type: 'job_cancelled',
        payload: { jobId, reason: 'Cancelled from queue before execution' } as JobCancelledPayload & { reason: string },
      });
      broadcastQueueStatus();
      return;
    }
  }

  // Cancel running job (if jobId matches or no jobId provided = cancel current)
  const shouldCancel = !jobId || state.current?.id === jobId;
  if (shouldCancel && state.current && state.abortController) {
    state.abortController.abort();
  }
}

/**
 * Handle queue clear
 */
export function handleClearQueue(
  state: JobState,
  wsClientService: WebSocketClientService,
  broadcastQueueStatus: () => void
): void {
  const clearedCount = state.queue.length;
  const clearedIds = state.queue.map((j) => j.id);

  wsLogger.info('Clearing job queue', {
    data: {
      clearedCount,
      clearedIds,
    },
  });

  state.queue = [];

  wsClientService.broadcast({
    type: 'queue_cleared',
    payload: { clearedCount, clearedIds },
  });

  broadcastQueueStatus();
}

/**
 * Handle remove job from queue
 */
export function handleRemoveFromQueue(
  payload: Record<string, unknown>,
  state: JobState,
  wsClientService: WebSocketClientService,
  broadcastQueueStatus: () => void
): void {
  const jobId = payload.jobId as string;
  const index = state.queue.findIndex((j) => j.id === jobId);

  if (index === -1) {
    wsLogger.warn('Job not found in queue for removal', { data: { jobId } });
    wsClientService.broadcast({
      type: 'error',
      payload: { message: `Job ${jobId} not found in queue` },
    });
    return;
  }

  state.queue.splice(index, 1);
  wsLogger.info('Job removed from queue', { data: { jobId } });

  wsClientService.broadcast({
    type: 'job_removed',
    payload: { jobId, remainingInQueue: state.queue.length },
  });

  broadcastQueueStatus();
}

/**
 * Handle force unstick
 */
export function handleForceUnstick(
  state: JobState,
  wsClientService: WebSocketClientService,
  processNextJob: () => void,
  broadcastQueueStatus: () => void
): void {
  const currentJobId = state.current?.id;
  const currentJobTitle = state.current?.title;

  wsLogger.warn('Force-unsticking job queue', {
    data: {
      currentJobId,
      currentJobTitle,
      queueLength: state.queue.length,
    },
  });

  // Abort if there's an abort controller
  if (state.abortController) {
    try {
      state.abortController.abort();
    } catch (e) {
      wsLogger.error('Error aborting current job', { error: e });
    }
  }

  // Clear current job state
  state.current = null;
  state.abortController = null;

  wsClientService.broadcast({
    type: 'queue_unstuck',
    payload: {
      previousJobId: currentJobId,
      previousJobTitle: currentJobTitle,
      message: 'Queue has been force-unstuck',
    },
  });

  processNextJob();
  broadcastQueueStatus();
}
