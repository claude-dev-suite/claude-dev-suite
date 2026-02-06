// SPDX-License-Identifier: MIT
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Job, WsMessage, QueueStatusPayload, JobContextSummary } from '@/types';
import { API_BASE } from '@/utils/api';
import { useComponentLogger } from '@/hooks/useComponentLogger';
import { config } from '@/config';

export interface UseOrchestratorWebSocketOptions {
  projectPath: string;
  onJobStarted?: (job: Job) => void;
  onJobComplete?: (sessionId: string | null, recap: any, jobContext?: JobContextSummary) => void;
  onJobError?: (error: string) => void;
  onJobCancelled?: () => void;
  onAgentStarted?: (agentId: string) => void;
  onAgentCompleted?: (agentId: string, success: boolean) => void;
  onOutput?: (text: string, isReasoning?: boolean) => void;
  onInputRequired?: (prompt: string, jobId: string) => void;
  onPermissionRequired?: (type: string, target: string, jobId: string) => void;
  onChatSession?: (sessionId: string) => void;
  onHistoryCleared?: () => void;
  onProgress?: (percent?: number, status?: string) => void;
  onToolUse?: (toolName: string, toolInput?: string) => void;
  onWarning?: (message: string) => void;
  onError?: (message: string) => void;
  onBatchComplete?: (summary: any) => void;
  onQueueStatus?: (status: QueueStatusPayload) => void;
  onQueueCleared?: (clearedCount: number) => void;
  onJobRemoved?: (jobId: string) => void;
  onQueueUnstuck?: (message: string) => void;
}

export interface UseOrchestratorWebSocketReturn {
  connected: boolean;
  wsStatusText: string;
  submitJob: (job: Partial<Job>, context?: string, subTasks?: Array<{ agentId: string; task: string }>) => void;
  /** Send chat message with optional token-efficient job context injection */
  sendChatMessage: (message: string, sessionId?: string | null, resumeSession?: boolean, jobContext?: JobContextSummary) => void;
  sendUserInput: (text: string, jobId: string) => void;
  sendPermissionResponse: (response: 'y' | 'a' | 'n', jobId: string) => void;
  cancelJob: (jobId?: string) => void;
  cancelChat: () => void;
  newChat: () => void;
  // Queue management
  getQueueStatus: () => void;
  clearQueue: () => void;
  removeFromQueue: (jobId: string) => void;
  forceUnstick: () => void;
  // Job context for token-efficient chat continuity
  /** Last completed job's context summary (~500 tokens vs ~50k for session resume) */
  lastJobContext: JobContextSummary | null;
  /** Clear the stored job context (e.g., when starting a new topic) */
  clearJobContext: () => void;
}

/**
 * Custom hook for managing WebSocket connection to orchestrator bridge
 */
export function useOrchestratorWebSocket(
  options: UseOrchestratorWebSocketOptions
): UseOrchestratorWebSocketReturn {
  const logger = useComponentLogger('useOrchestratorWebSocket', { logMount: false, logUnmount: false });

  const [connected, setConnected] = useState(false);
  const [wsStatusText, setWsStatusText] = useState('Not connected to orchestrator bridge');
  const [lastJobContext, setLastJobContext] = useState<JobContextSummary | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const shouldReconnectRef = useRef<boolean>(true);
  const wsTokenRef = useRef<string | null>(null);
  const wsPortRef = useRef<number>(config.websocket.port);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientIdRef = useRef<string>(crypto.randomUUID());

  // Store options in ref to avoid re-renders causing reconnection loops
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: WsMessage) => {
    const payload = message.payload as Record<string, unknown>;
    const opts = optionsRef.current;

    switch (message.type) {
      case 'status':
        if (payload.connected) {
          setWsStatusText('Connected to orchestrator bridge');
        }
        break;

      case 'job_queued':
        opts.onProgress?.(undefined, `Job queued (position: ${payload.position || 1})`);
        break;

      case 'job_started':
        opts.onProgress?.(undefined, `Executing: ${payload.title || 'Job'}`);
        if (opts.onJobStarted) {
          // Create a minimal job object from payload
          const job: Job = {
            id: payload.id as string || '',
            title: payload.title as string || '',
            prompt: payload.prompt as string || '',
            status: 'running',
            createdAt: new Date().toISOString(),
            projectPath: options.projectPath,
          };
          opts.onJobStarted(job);
        }
        break;

      case 'job_progress':
        if (payload.percent !== undefined) {
          opts.onProgress?.(payload.percent as number, `Progress: ${payload.percent}%`);
        }
        break;

      case 'job_output':
      case 'chat_output': {
        const text = payload.text as string;
        const isReasoning = payload.contentType === 'reasoning';
        if (text) {
          opts.onOutput?.(text, isReasoning);
        }
        break;
      }

      case 'job_complete':
      case 'chat_complete': {
        const sessionId = payload.sessionId as string || null;
        const recap = payload.recap;
        const jobContext = payload.jobContext as JobContextSummary | undefined;

        // Store job context for token-efficient chat continuity
        // This allows follow-up chats to use ~500 tokens instead of ~50k for session resume
        if (jobContext) {
          setLastJobContext(jobContext);
          logger.debug('Stored job context for chat continuity', {
            jobId: jobContext.jobId,
            findingsLength: jobContext.findings.length,
          });
        }

        opts.onJobComplete?.(sessionId, recap, jobContext);
        break;
      }

      case 'job_error':
      case 'chat_error': {
        const errorMsg = (payload.error || payload.message) as string;
        opts.onJobError?.(errorMsg);
        break;
      }

      case 'job_cancelled':
      case 'chat_cancelled':
        opts.onJobCancelled?.();
        break;

      case 'agent_started': {
        const agentId = payload.agentId as string;
        opts.onAgentStarted?.(agentId);
        break;
      }

      case 'agent_completed': {
        const agentId = payload.agentId as string;
        const success = payload.success !== false;
        opts.onAgentCompleted?.(agentId, success);
        break;
      }

      case 'chat_agent': {
        const agent = payload.agent as string;
        const agentMessage = payload.message as string;
        if (agent) {
          opts.onAgentStarted?.(agent);
        }
        if (agentMessage) {
          opts.onOutput?.(agentMessage);
        }
        break;
      }

      case 'chat_started':
        opts.onProgress?.(undefined, 'Claude is thinking...');
        break;

      case 'chat_session': {
        const sessionId = payload.sessionId as string;
        if (sessionId) {
          opts.onChatSession?.(sessionId);
        }
        break;
      }

      case 'chat_cleared':
      case 'history_cleared':
        opts.onHistoryCleared?.();
        break;

      case 'tool_use': {
        const toolName = payload.tool as string;
        const toolInput = payload.input as string;
        opts.onToolUse?.(toolName, toolInput);
        break;
      }

      case 'warning': {
        const warningText = payload.message as string;
        if (warningText) {
          opts.onWarning?.(warningText);
        }
        break;
      }

      case 'input_required':
        opts.onInputRequired?.(
          payload.prompt as string || 'Claude needs your input',
          payload.jobId as string || ''
        );
        break;

      case 'permission_required':
        opts.onPermissionRequired?.(
          payload.type as string || 'Unknown',
          payload.target as string || '',
          payload.jobId as string || ''
        );
        break;

      case 'error': {
        const errorMessage = payload.message as string;
        opts.onError?.(errorMessage);
        break;
      }

      case 'batch_complete': {
        const batchSummary = payload.summary as any;
        if (batchSummary) {
          opts.onBatchComplete?.(batchSummary);
        }
        break;
      }

      // Queue management events
      case 'queue_status': {
        opts.onQueueStatus?.(payload as unknown as QueueStatusPayload);
        break;
      }

      case 'queue_cleared': {
        const clearedCount = (payload.clearedCount as number) || 0;
        opts.onQueueCleared?.(clearedCount);
        opts.onOutput?.(`\x1b[33m⚡ Queue cleared: ${clearedCount} job(s) removed\x1b[0m`);
        break;
      }

      case 'job_removed': {
        const removedJobId = payload.jobId as string;
        opts.onJobRemoved?.(removedJobId);
        opts.onOutput?.(`\x1b[33m⚡ Job removed from queue: ${removedJobId}\x1b[0m`);
        break;
      }

      case 'queue_unstuck': {
        const message = (payload.message as string) || 'Queue unstuck';
        opts.onQueueUnstuck?.(message);
        opts.onOutput?.(`\x1b[32m✓ ${message}\x1b[0m`);
        break;
      }

      default:
        break;
    }
  }, []); // Empty deps - we use optionsRef to avoid reconnection loops

  // Connect to WebSocket
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      setWsStatusText('Connecting...');

      if (!wsTokenRef.current) {
        const tokenRes = await fetch(`${API_BASE}/api/tokens`);
        if (tokenRes.ok) {
          const response = await tokenRes.json();
          const data = response.data || response;
          if (data.wsToken) {
            wsTokenRef.current = data.wsToken;
          }
          if (data.wsPort) {
            wsPortRef.current = data.wsPort;
          }
        }
      }

      const wsUrl = `ws://localhost:${wsPortRef.current}?token=${wsTokenRef.current}&clientId=${clientIdRef.current}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setConnected(true);
        setWsStatusText('Connected to orchestrator bridge');
      };

      ws.onmessage = (event) => {
        try {
          const message: WsMessage = JSON.parse(event.data);
          handleMessage(message);
        } catch (err) {
          logger.error('Failed to parse WebSocket message', err);
        }
      };

      ws.onclose = () => {
        setConnected(false);

        if (wsRef.current) {
          wsRef.current.onmessage = null;
          wsRef.current.onerror = null;
          wsRef.current.onopen = null;
          wsRef.current.onclose = null;
        }
        wsRef.current = null;

        if (!shouldReconnectRef.current) {
          setWsStatusText('Disconnected');
          return;
        }

        setWsStatusText('Disconnected - Reconnecting in 5s...');
        reconnectTimeoutRef.current = setTimeout(connect, config.websocket.reconnectBaseDelay * 5);
      };

      ws.onerror = (error) => {
        logger.error('WebSocket error', error);
        setWsStatusText('Connection error');
      };

      wsRef.current = ws;
    } catch (err) {
      logger.error('Failed to connect to orchestrator', err);
      setWsStatusText('Failed to connect');
      reconnectTimeoutRef.current = setTimeout(connect, config.websocket.reconnectBaseDelay * 5);
    }
  }, [handleMessage, logger]);

  // Connect on mount
  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();

    return () => {
      shouldReconnectRef.current = false;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (wsRef.current) {
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onopen = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // Submit job
  const submitJob = useCallback((
    job: Partial<Job>,
    context?: string,
    subTasks?: Array<{ agentId: string; task: string }>
  ) => {
    if (!wsRef.current || !connected) return;

    const payload = {
      id: job.id,
      title: job.title,
      prompt: job.prompt,
      context: context || job.prompt,
      projectPath: job.projectPath || options.projectPath,
      subTasks: subTasks,
    };

    wsRef.current.send(JSON.stringify({
      type: 'submit_job',
      payload,
    }));
  }, [connected, options.projectPath]);

  // Send chat message with optional token-efficient job context injection
  const sendChatMessage = useCallback((
    message: string,
    sessionId?: string | null,
    resumeSession?: boolean,
    jobContext?: JobContextSummary
  ) => {
    if (!wsRef.current || !connected || !message.trim()) return;

    // Token-efficient continuity: If jobContext provided and not explicitly resuming,
    // the server will inject ~500 tokens of context instead of replaying ~50k tokens of history
    wsRef.current.send(JSON.stringify({
      type: 'chat_message',
      payload: {
        message: message,
        sessionId: sessionId || undefined,
        resumeSession: resumeSession || false,
        context: { projectPath: options.projectPath },
        // Include job context for token-efficient continuity
        jobContext: jobContext || undefined,
      },
    }));
  }, [connected, options.projectPath]);

  // Clear stored job context (e.g., when starting a new topic)
  const clearJobContext = useCallback(() => {
    setLastJobContext(null);
  }, []);

  // Send user input
  const sendUserInput = useCallback((text: string, jobId: string) => {
    if (!wsRef.current || !connected) return;

    wsRef.current.send(JSON.stringify({
      type: 'user_input',
      payload: { text, jobId },
    }));
  }, [connected]);

  // Send permission response
  const sendPermissionResponse = useCallback((response: 'y' | 'a' | 'n', jobId: string) => {
    if (!wsRef.current || !connected) return;

    wsRef.current.send(JSON.stringify({
      type: 'permission_response',
      payload: { response, jobId },
    }));
  }, [connected]);

  // Cancel job
  const cancelJob = useCallback((jobId?: string) => {
    if (!wsRef.current || !connected) return;

    wsRef.current.send(JSON.stringify({
      type: 'cancel_job',
      payload: { jobId },
    }));
  }, [connected]);

  // Cancel chat
  const cancelChat = useCallback(() => {
    if (!wsRef.current || !connected) return;

    wsRef.current.send(JSON.stringify({
      type: 'cancel_chat',
      payload: {},
    }));
  }, [connected]);

  // New chat
  const newChat = useCallback(() => {
    if (!wsRef.current || !connected) return;

    wsRef.current.send(JSON.stringify({
      type: 'new_chat',
      payload: {},
    }));
  }, [connected]);

  // Queue management: Get queue status
  const getQueueStatus = useCallback(() => {
    if (!wsRef.current || !connected) return;

    wsRef.current.send(JSON.stringify({
      type: 'get_queue_status',
      payload: {},
    }));
  }, [connected]);

  // Queue management: Clear entire queue
  const clearQueue = useCallback(() => {
    if (!wsRef.current || !connected) return;

    wsRef.current.send(JSON.stringify({
      type: 'clear_queue',
      payload: {},
    }));
  }, [connected]);

  // Queue management: Remove specific job from queue
  const removeFromQueue = useCallback((jobId: string) => {
    if (!wsRef.current || !connected) return;

    wsRef.current.send(JSON.stringify({
      type: 'remove_from_queue',
      payload: { jobId },
    }));
  }, [connected]);

  // Queue management: Force unstick (clear stuck current job)
  const forceUnstick = useCallback(() => {
    if (!wsRef.current || !connected) return;

    wsRef.current.send(JSON.stringify({
      type: 'force_unstick',
      payload: {},
    }));
  }, [connected]);

  return {
    connected,
    wsStatusText,
    submitJob,
    sendChatMessage,
    sendUserInput,
    sendPermissionResponse,
    cancelJob,
    cancelChat,
    newChat,
    // Queue management
    getQueueStatus,
    clearQueue,
    removeFromQueue,
    forceUnstick,
    // Job context for token-efficient chat continuity
    lastJobContext,
    clearJobContext,
  };
}
