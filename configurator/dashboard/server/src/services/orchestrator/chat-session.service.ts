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

/** Callback to retrieve the server-side job context (never trust the client's copy) */
export type JobContextProvider = () => JobContextSummary | null;

export class ChatSessionService {
  private state: ChatState;
  private config: OrchestratorConfig;
  private validationService: ValidationService;
  private wsClientService: WebSocketClientService;
  private sdkService: AgentSDKService;
  private jobContextProvider: JobContextProvider;

  constructor(
    config: OrchestratorConfig,
    validationService: ValidationService,
    wsClientService: WebSocketClientService,
    sdkService: AgentSDKService,
    jobContextProvider: JobContextProvider = () => null
  ) {
    this.config = config;
    this.validationService = validationService;
    this.wsClientService = wsClientService;
    this.sdkService = sdkService;
    this.jobContextProvider = jobContextProvider;
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
You previously completed a task in this project. Here is the FULL report:

**Task:** ${jobContext.title} (${jobContext.action})
**Project:** ${jobContext.projectPath}
**Completed:** ${jobContext.completedAt}

**Complete Findings/Results:**
${jobContext.findings}

---
CRITICAL INSTRUCTIONS — READ CAREFULLY BEFORE PROCEEDING:

1. The report above contains issues from MULTIPLE agents/categories (e.g., Security, Performance, Architecture, Best Practices, Code Quality). You MUST address ALL categories, not just the first one.
2. Create a todo list with one task per CATEGORY to track your progress. Mark each category complete only after fixing ALL its issues.
3. After finishing fixes for one category, EXPLICITLY move to the NEXT category. Do NOT stop or say "Done" until every category has been addressed.
4. Work through issues by priority within each category: Critical → High → Medium → Low.
5. If a fix is not feasible, explain why and move on — do not skip the entire remaining category.

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
    // Job context: validate client-supplied jobId against server-side stored context.
    // SECURITY: Never trust the client's jobContext content (findings, title, etc.).
    // The client only signals intent; the server uses its own trusted copy.
    const clientJobContext = payload.jobContext as { jobId?: string } | undefined;
    let jobContext: JobContextSummary | undefined;
    if (clientJobContext?.jobId) {
      const serverContext = this.jobContextProvider();
      if (serverContext && serverContext.jobId === clientJobContext.jobId) {
        jobContext = serverContext;
      } else {
        wsLogger.warn('Job context rejected: jobId does not match server-side context', {
          correlationId,
          data: {
            clientJobId: clientJobContext.jobId,
            serverJobId: serverContext?.jobId || null,
          },
        });
      }
    }
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

    // When following up on a completed job (e.g., "fix all issues from code review"),
    // ALWAYS use context injection instead of session resume, even if resumeSession=true.
    // Session resume loads the full job history (~50k tokens) leaving almost no room
    // for Claude to actually apply fixes. Context injection uses a structured summary
    // (~5k tokens) giving Claude maximum room to work.
    const hasJobContext = !!jobContext;

    if (hasJobContext) {
      // Token-efficient path: inject context summary instead of resuming
      finalPrompt = this.formatJobContextAsPrompt(jobContext!) + text;
      useResume = undefined;  // Don't resume session, use fresh session with context
      if (explicitResume) {
        wsLogger.warn('Job context overrides explicit session resume — using context injection instead', {
          correlationId,
          data: { jobId: jobContext!.jobId, resumeSessionId },
        });
      }
      wsLogger.info('Using token-efficient context injection', {
        correlationId,
        data: {
          jobId: jobContext!.jobId,
          contextLength: jobContext!.findings.length,
          estimatedTokens: Math.ceil(jobContext!.findings.length / 4),  // ~4 chars per token
          permissionMode: 'acceptEdits',
        },
      });
    }

    // Track whether we've emitted any user-visible text/tool output during this iteration.
    // If false at the end, we emit a warning instead of leaving the user with a silent "Done".
    let hasEmittedAnyOutput = false;

    try {
      for await (const message of query({
        prompt: finalPrompt,
        options: {
          cwd: pathValidation.path!,
          resume: useResume,
          // Load CLAUDE.md and project settings from the target project.
          // Append a small instruction so the assistant doesn't silently drop
          // conversational/small-talk inputs (e.g. "ciao") under the strict
          // claude_code preset — without it the SDK can complete with zero
          // emitted text/tool blocks, leaving the UI showing only "Done".
          systemPrompt: {
            type: 'preset',
            preset: 'claude_code',
            append: 'Always reply to the user, even for greetings, small talk, or vague/open-ended messages. If the user is just chatting, respond briefly and conversationally as a helpful software engineering assistant working in this project. Never finish a turn without producing visible text.',
          },
          settingSources: ['project'],
          allowedTools: clientAllowedTools || ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep', 'Task', 'WebFetch', 'WebSearch'],
          permissionMode: (hasJobContext ? 'acceptEdits' : (this.config.chat.permissionMode === 'interactive' ? 'default' : this.config.chat.permissionMode)) as 'default' | 'acceptEdits' | 'bypassPermissions',
          abortController: this.state.abortController,
          ...(this.config.chat.maxTurns !== undefined && { maxTurns: this.config.chat.maxTurns }),
          ...(this.config.chat.maxBudgetUsd > 0 && { maxBudgetUsd: this.config.chat.maxBudgetUsd }),
          stderr: (data: string) => {
            wsLogger.error('Claude stderr', { correlationId, stderr: data });
          },
        },
      })) {
        // Diagnostic INFO log of every SDK message — top-level keys + type +
        // (when present) message subtype/role so we can see the real shape of
        // what comes out of @anthropic-ai/claude-agent-sdk in this runtime.
        {
          const m = message as Record<string, unknown>;
          const inner = m.message as Record<string, unknown> | undefined;
          wsLogger.info('SDK message received', {
            correlationId,
            data: {
              type: m.type ?? null,
              subtype: m.subtype ?? null,
              topLevelKeys: Object.keys(m),
              innerType: inner ? (inner.type ?? null) : null,
              innerRole: inner ? (inner.role ?? null) : null,
              innerKeys: inner ? Object.keys(inner) : null,
              hasContent: inner ? Array.isArray(inner.content) : false,
              contentLen: inner && Array.isArray(inner.content) ? inner.content.length : 0,
            },
          });
        }
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
          // Diagnostic: log content block summary so we can see WHY a turn
          // emits nothing (text empty? thinking block? unsupported type?)
          wsLogger.info('Assistant message content', {
            correlationId,
            data: {
              blockCount: message.message.content.length,
              blockTypes: message.message.content.map((b: { type?: string }) => b.type ?? 'unknown'),
              firstTextPreview: message.message.content
                .find((b: { type?: string; text?: string }) => b.type === 'text')
                ?.text?.slice(0, 100) ?? null,
            },
          });
          for (const block of message.message.content) {
            // Surface non-empty whitespace-only / thinking blocks as well
            if (block.type === 'text' && typeof block.text === 'string' && block.text.trim().length > 0) {
              hasEmittedAnyOutput = true;
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
              hasEmittedAnyOutput = true;
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

          // Diagnostic: dump every field on the result message — including the
          // `errors[]` array (when subtype === 'error_during_execution' the
          // SDK puts the cause here even with is_error === false).
          {
            const m = message as unknown as Record<string, unknown>;
            wsLogger.info('Result message detail', {
              correlationId,
              data: {
                resultSubtype: m.subtype ?? null,
                isError: m.is_error ?? null,
                permissionDenials: m.permission_denials ?? null,
                errors: m.errors ?? null,
                modelUsage: m.modelUsage ?? null,
                totalCostUsd: m.total_cost_usd ?? null,
                durationApiMs: m.duration_api_ms ?? null,
              },
            });
          }

          // If the SDK signaled an execution error via subtype, surface it to
          // the user instead of letting the generic "no response" warning run.
          const resultSubtype = (message as unknown as { subtype?: string }).subtype;
          if (!hasEmittedAnyOutput && resultSubtype && resultSubtype !== 'success') {
            const errs = (message as unknown as { errors?: unknown[] }).errors;
            const errSummary =
              Array.isArray(errs) && errs.length > 0
                ? errs
                    .map((e) =>
                      typeof e === 'string'
                        ? e
                        : (e as { message?: string; error?: string })?.message ??
                          (e as { message?: string; error?: string })?.error ??
                          JSON.stringify(e)
                    )
                    .join(' | ')
                : 'no error detail';
            this.wsClientService.broadcast({
              type: 'chat_output',
              payload: {
                text: `\x1b[31m✗ Claude SDK execution error (subtype: ${resultSubtype}): ${errSummary}\x1b[0m\n`,
                raw: true,
                contentType: 'text',
              } as ChatOutputPayload,
            });
            hasEmittedAnyOutput = true;  // suppress the generic warning that follows
          }

          // Silent-completion guard: if no output was emitted during the iteration,
          // surface either the result text (if present) or an explicit "no response"
          // warning so the user is never left with a bare "Done".
          if (!hasEmittedAnyOutput) {
            if (hasResult) {
              this.wsClientService.broadcast({
                type: 'chat_output',
                payload: {
                  text: message.result!,
                  raw: true,
                  contentType: 'text',
                } as ChatOutputPayload,
              });
            } else {
              this.wsClientService.broadcast({
                type: 'chat_output',
                payload: {
                  text: `\x1b[33m⚠️  Claude did not return any response. Possible causes: missing/invalid ANTHROPIC_API_KEY, network issue, or the prompt was too short for the 'claude_code' system preset (try a more concrete coding task).\x1b[0m\n`,
                  raw: true,
                  contentType: 'text',
                } as ChatOutputPayload,
              });
              wsLogger.warn('Claude SDK iteration finished with no emitted output', {
                correlationId,
                data: { numTurns, isError: message.is_error, hasResult: false },
              });
            }
          }

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
