// SPDX-License-Identifier: MIT
/**
 * Chat Session Service
 *
 * Manages chat sessions with Claude:
 * - Session lifecycle (create, resume, cancel)
 * - Message handling and streaming
 * - Session state management
 * - AbortController management
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { WebSocket } from 'ws';
import { getProjectPath } from '../../utils/constants.js';
import { wsLogger, generateCorrelationId } from '../../utils/logger.js';
import type {
  ChatOutputPayload,
  ChatCompletePayload,
  ChatSessionPayload,
  ChatAgentPayload,
  JobContextSummary,
} from '../../types/orchestrator.js';
// Re-export for convenience
export type { ChatMessagePayload } from '../../types/orchestrator.js';
import type {
  ChatState,
  OrchestratorConfig,
} from './types.js';
import type { ValidationService } from './validation.service.js';
import type { WebSocketClientService } from './websocket-client.service.js';
import type { AgentSDKService } from './agent-sdk.service.js';

export class ChatSessionService {
  private state: ChatState;
  private config: OrchestratorConfig;
  private validationService: ValidationService;
  private wsClientService: WebSocketClientService;
  private sdkService: AgentSDKService;

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
    this.state = {
      sessionId: null,
      active: false,
      projectPath: null,
      abortController: null,
    };
  }

  /**
   * Format job context as a prompt prefix for token-efficient continuity
   * This injects ~500 tokens instead of resuming full history (~50k tokens)
   */
  private formatJobContextAsPrompt(jobContext: JobContextSummary): string {
    return `## Previous Task Context
You previously completed a task in this project. Here is the summary:

**Task:** ${jobContext.title} (${jobContext.action})
**Project:** ${jobContext.projectPath}
**Completed:** ${jobContext.completedAt}

**Key Findings/Results:**
${jobContext.findings}

---
Use this context to understand what was done. The user is now following up on this work.

`;
  }

  /**
   * Handle incoming chat message
   */
  async handleChatMessage(ws: WebSocket, payload: Record<string, unknown>): Promise<void> {
    const correlationId = generateCorrelationId();
    // Extract message from payload (Zod schema uses 'message' field)
    const text = payload.message as string;
    // Extract projectPath from context object (Zod schema nests it in context)
    const context = payload.context as Record<string, unknown> | undefined;
    const projectPathInput = (context?.projectPath as string) || this.state.projectPath || getProjectPath();
    // Read sessionId from frontend payload for context persistence
    const clientSessionId = payload.sessionId as string | undefined;
    // Extract job context for token-efficient continuity
    const jobContext = payload.jobContext as JobContextSummary | undefined;
    // Optional per-session tool restriction (e.g., generation chats use read-only tools)
    const clientAllowedTools = Array.isArray(payload.allowedTools) ? payload.allowedTools as string[] : undefined;

    wsLogger.info('Chat message received', {
      correlationId,
      data: {
        messageLength: text?.length || 0,
        projectPath: projectPathInput,
        sessionId: clientSessionId || this.state.sessionId || 'new',
      },
    });

    if (!text) {
      wsLogger.warn('Chat message rejected: no text provided', { correlationId });
      this.wsClientService.sendToClient(ws, { type: 'error', payload: { message: 'No message provided' } });
      return;
    }

    // Validate message length
    const lengthValidation = this.validationService.validateMessageLength(text);
    if (!lengthValidation.valid) {
      wsLogger.warn('Chat message rejected: message too long', {
        correlationId,
        data: { length: text.length, maxLength: this.config.chat.maxMessageLength },
      });
      this.wsClientService.sendToClient(ws, { type: 'chat_error', payload: { error: lengthValidation.error } });
      return;
    }

    // Validate project path
    const pathValidation = this.validationService.validateProjectPath(projectPathInput);
    if (!pathValidation.valid) {
      wsLogger.warn('Chat message rejected: invalid project path', {
        correlationId,
        data: { projectPath: projectPathInput, error: pathValidation.error },
      });
      this.wsClientService.sendToClient(ws, { type: 'chat_error', payload: { error: pathValidation.error } });
      return;
    }

    // Cancel previous query with proper wait
    if (this.state.abortController) {
      this.state.abortController.abort();
      // Wait for the active flag to clear (max 2 seconds)
      const maxWait = 2000;
      const startTime = Date.now();
      while (this.state.active && Date.now() - startTime < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (this.state.active) {
        wsLogger.warn('Previous chat did not stop in time, proceeding anyway');
      }
    }

    this.state.abortController = new AbortController();
    this.state.active = true;
    this.state.projectPath = pathValidation.path!;

    this.wsClientService.broadcast({ type: 'chat_started', payload: { message: text } });

    // Only resume if explicitly requested via payload.resumeSession flag
    // This prevents auto-resume behavior - user must use /resume command
    const explicitResume = payload.resumeSession === true;
    const resumeSessionId = explicitResume ? (clientSessionId || this.state.sessionId || undefined) : undefined;

    wsLogger.info('Resume check', {
      correlationId,
      data: {
        explicitResume,
        clientSessionId,
        resumeSessionId,
        payloadResumeSession: payload.resumeSession,
      },
    });

    if (explicitResume && resumeSessionId) {
      wsLogger.info('Session explicitly resumed', {
        correlationId,
        data: { sessionId: resumeSessionId },
      });
      this.state.sessionId = resumeSessionId;
    } else if (!explicitResume) {
      // Start fresh session - clear previous session ID
      this.state.sessionId = null;
    }

    wsLogger.info('Chat session started', {
      correlationId,
      data: {
        sessionId: resumeSessionId || 'new',
        projectPath: pathValidation.path,
        messagePreview: text.substring(0, 100),
      },
    });

    const sessionStartTime = Date.now();

    // Job-to-chat continuity: Use token-efficient context injection
    // Instead of session resume (~50k tokens), inject a summary (~500 tokens)
    // This saves ~98% on token cost for job follow-up conversations
    //
    // Priority:
    // 1. If jobContext provided → inject context summary (token-efficient)
    // 2. If resumeSession=true → use full session resume (expensive but complete)
    // 3. Otherwise → fresh session

    // Build the prompt with optional job context prefix
    let finalPrompt = text;
    let useResume = resumeSessionId;

    if (jobContext && !explicitResume) {
      // Token-efficient path: inject context summary instead of resuming
      finalPrompt = this.formatJobContextAsPrompt(jobContext) + text;
      useResume = undefined;  // Don't resume session, use fresh session with context
      wsLogger.info('Using token-efficient context injection', {
        correlationId,
        data: {
          jobId: jobContext.jobId,
          contextLength: jobContext.findings.length,
          estimatedTokens: Math.ceil(jobContext.findings.length / 4),  // ~4 chars per token
        },
      });
    }

    try {
      for await (const message of query({
        prompt: finalPrompt,
        options: {
          cwd: pathValidation.path!,
          resume: useResume,
          // Load CLAUDE.md and project settings from the target project
          systemPrompt: { type: 'preset', preset: 'claude_code' },
          settingSources: ['project'],
          allowedTools: clientAllowedTools || ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep', 'Task', 'WebFetch', 'WebSearch'],
          permissionMode: this.config.chat.permissionMode,
          abortController: this.state.abortController,
          ...(this.config.chat.maxTurns !== undefined && { maxTurns: this.config.chat.maxTurns }),
          ...(this.config.chat.maxBudgetUsd > 0 && { maxBudgetUsd: this.config.chat.maxBudgetUsd }),
          stderr: (data: string) => {
            wsLogger.error('Claude stderr', { correlationId, stderr: data });
          },
        },
      })) {
        // Check if abort was signaled during iteration
        if (this.state.abortController?.signal?.aborted) {
          wsLogger.info('Abort signal detected during iteration');
          this.wsClientService.broadcast({ type: 'chat_cancelled', payload: {} });
          break;
        }

        // Handle system init message
        if (this.sdkService.isSystemInitMessage(message)) {
          this.state.sessionId = message.session_id;
          wsLogger.info('Chat session initialized', {
            correlationId,
            data: { sessionId: message.session_id },
          });
          this.wsClientService.broadcast({
            type: 'chat_session',
            payload: { sessionId: message.session_id } as ChatSessionPayload,
          });
        }

        // Handle assistant message
        if (this.sdkService.isAssistantMessage(message)) {
          for (const block of message.message.content) {
            if (block.type === 'text' && block.text) {
              // Claude output: white/default for readability (no heavy coloring)
              this.wsClientService.broadcast({
                type: 'chat_output',
                payload: {
                  text: block.text,
                  raw: true,
                  contentType: 'text',
                } as ChatOutputPayload,
              });
            } else if (block.type === 'tool_use' && block.name) {
              // Detect agent usage (Task tool with subagent_type)
              if (block.name === 'Task') {
                const input = block.input as Record<string, unknown> | undefined;
                const agentType = input?.subagent_type as string | undefined;
                const description = input?.description as string | undefined;
                if (agentType) {
                  this.wsClientService.broadcast({
                    type: 'chat_agent',
                    payload: {
                      agent: agentType,
                      explicit: true,
                      message: description || `Using ${agentType} agent`,
                    } as ChatAgentPayload,
                  });
                }
              }

              // Tool usage: yellow with lightning bolt
              const toolText = this.sdkService.formatToolUse(block.name, block.input || {});
              this.wsClientService.broadcast({
                type: 'chat_output',
                payload: {
                  text: `\x1b[33m⚡ ${toolText}\x1b[0m\n`,
                  raw: true,
                  contentType: 'tool',
                } as ChatOutputPayload,
              });
            }
          }
        }

        // Handle user message (tool results)
        if (this.sdkService.isUserMessage(message)) {
          for (const block of message.message.content) {
            if (block.type === 'tool_result') {
              const content = block.content || '';
              const preview =
                typeof content === 'string'
                  ? this.sdkService.truncateText(content.replace(/\n/g, ' '), 150)
                  : this.sdkService.truncateText(JSON.stringify(content), 150);
              // Tool results: dim gray
              this.wsClientService.broadcast({
                type: 'chat_output',
                payload: {
                  text: `\x1b[90m   → ${preview}\x1b[0m\n`,
                  raw: true,
                  contentType: 'result',
                } as ChatOutputPayload,
              });
            }
          }
        }

        // Handle result message
        if (this.sdkService.isResultMessage(message)) {
          const duration = Date.now() - sessionStartTime;
          const numTurns = message.num_turns || 0;
          const maxTurns = this.config.chat.maxTurns;
          const hitTurnLimit = maxTurns !== undefined && numTurns >= maxTurns;
          const hasResult = message.result && message.result.trim().length > 0;

          // Completion: green separator
          this.wsClientService.broadcast({
            type: 'chat_output',
            payload: {
              text: `\x1b[32m\n━━━ Done ━━━\x1b[0m\n`,
              raw: true,
            } as ChatOutputPayload,
          });

          // If task hit turn limit without a recap, show a warning
          // (This should rarely happen now that limits are removed by default)
          if (hitTurnLimit && !hasResult && maxTurns !== undefined) {
            this.wsClientService.broadcast({
              type: 'chat_output',
              payload: {
                text: `\x1b[33m⚠️ Task terminato per limite turni (${numTurns}/${maxTurns}). Claude non ha potuto completare il recap finale.\x1b[0m\n`,
                raw: true,
                contentType: 'text',
              } as ChatOutputPayload,
            });
          }

          this.wsClientService.broadcast({
            type: 'chat_complete',
            payload: {
              success: !message.is_error,
              result: message.result || '',
              cost: message.total_cost_usd || 0,
              turns: numTurns,
              sessionId: message.session_id || this.state.sessionId || '',
              tokens: message.usage || { input: 0, output: 0 },
            } as ChatCompletePayload,
          });

          wsLogger.info('Chat session completed', {
            correlationId,
            data: {
              sessionId: message.session_id || this.state.sessionId,
              success: !message.is_error,
              cost: message.total_cost_usd || 0,
              turns: message.num_turns || 0,
              duration,
              tokens: message.usage || { input: 0, output: 0 },
            },
            duration,
          });
        }
      }
    } catch (error) {
      const err = error as Error;
      // Check if this was a cancellation
      const isAbort = err.name === 'AbortError'
        || this.state.abortController?.signal?.aborted
        || (err.message && err.message.toLowerCase().includes('abort'));

      if (isAbort) {
        wsLogger.info('Chat session cancelled', {
          correlationId,
          data: { sessionId: this.state.sessionId },
        });
        this.wsClientService.broadcast({ type: 'chat_cancelled', payload: {} });
      } else {
        // Parse the error for better user feedback
        const parsedError = this.sdkService.parseAPIError(err);
        const formattedError = this.sdkService.formatErrorForDisplay(parsedError);

        wsLogger.error('Chat session error', {
          correlationId,
          data: {
            sessionId: this.state.sessionId,
            error: err.message,
            errorType: parsedError.type,
            retryable: parsedError.retryable,
          },
          error: err,
        });

        // Send detailed error output to the chat
        this.wsClientService.broadcast({
          type: 'chat_output',
          payload: {
            text: `\x1b[31m\n${formattedError}\x1b[0m`,
            raw: true,
            contentType: 'error',
          } as ChatOutputPayload,
        });

        this.wsClientService.broadcast({
          type: 'chat_error',
          payload: {
            error: parsedError.userMessage,
            errorType: parsedError.type,
            retryable: parsedError.retryable,
            suggestions: parsedError.suggestions,
          },
        });
      }
    } finally {
      this.state.active = false;
      this.state.abortController = null;
    }
  }

  /**
   * Start a new chat session (clear session)
   */
  handleNewChat(): void {
    // Abort any running query
    if (this.state.abortController) {
      this.state.abortController.abort();
    }

    // Clear session to start fresh
    const oldSessionId = this.state.sessionId;
    this.state.sessionId = null;
    this.state.active = false;
    this.state.abortController = null;

    wsLogger.info('New chat - cleared session', { oldSessionId });
    this.wsClientService.broadcast({ type: 'chat_cleared', payload: { previousSessionId: oldSessionId } });
  }

  /**
   * Cancel active chat session
   */
  handleCancelChat(): void {
    wsLogger.info('Cancel chat requested', {
      hasAbortController: !!this.state.abortController,
      active: this.state.active
    });
    if (this.state.abortController) {
      wsLogger.info('Cancelling chat');
      this.state.abortController.abort();
      this.wsClientService.broadcast({ type: 'chat_cancelled', payload: {} });
    } else {
      wsLogger.info('No active chat to cancel');
    }
  }

  /**
   * Get current chat state
   */
  getChatState(): ChatState {
    return this.state;
  }
}
