// SPDX-License-Identifier: MIT
/**
 * Message Processor for Job Execution
 *
 * Handles SDK message parsing and WebSocket broadcasting during job execution.
 */

import type {
  JobOutputPayload,
  ChatAgentPayload,
} from '../../../types/orchestrator.js';
import type { WebSocketClientService } from '../websocket-client.service.js';
import type { AgentSDKService } from '../agent-sdk.service.js';

export interface MessageBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | unknown;
}

export interface ProcessMessageResult {
  text: string;
  sessionId?: string;
}

/**
 * Process an assistant message block and broadcast output
 */
export function processAssistantBlock(
  block: MessageBlock,
  jobId: string,
  wsClientService: WebSocketClientService,
  sdkService: AgentSDKService
): string {
  let outputText = '';

  if (block.type === 'text' && block.text) {
    outputText = block.text + '\n';
    wsClientService.broadcast({
      type: 'job_output',
      payload: {
        jobId,
        text: `\x1b[36m${block.text}\x1b[0m\n`,
        raw: true,
      } as JobOutputPayload,
    });
  } else if (block.type === 'tool_use' && block.name) {
    // Detect agent usage (Task tool with subagent_type)
    if (block.name === 'Task') {
      const input = block.input as Record<string, unknown> | undefined;
      const agentType = input?.subagent_type as string | undefined;
      const description = input?.description as string | undefined;
      if (agentType) {
        wsClientService.broadcast({
          type: 'chat_agent',
          payload: {
            agent: agentType,
            explicit: true,
            message: description || `Using ${agentType} agent`,
          } as ChatAgentPayload,
        });
      }
    }

    const toolText = sdkService.formatToolUse(block.name, block.input || {});
    outputText = toolText + '\n';
    wsClientService.broadcast({
      type: 'job_output',
      payload: {
        jobId,
        text: `\x1b[33m${toolText}\x1b[0m\n`,
        raw: true,
      } as JobOutputPayload,
    });
  }

  return outputText;
}

/**
 * Process a user message block (tool results) and broadcast output
 */
export function processUserBlock(
  block: MessageBlock,
  jobId: string,
  wsClientService: WebSocketClientService,
  sdkService: AgentSDKService
): void {
  if (block.type === 'tool_result') {
    const content = block.content || '';
    const preview =
      typeof content === 'string'
        ? sdkService.truncateText(content.replace(/\n/g, ' '), 150)
        : sdkService.truncateText(JSON.stringify(content), 150);
    wsClientService.broadcast({
      type: 'job_output',
      payload: {
        jobId,
        text: `\x1b[90m  → ${preview}\x1b[0m\n`,
        raw: true,
      } as JobOutputPayload,
    });
  }
}

/**
 * Broadcast subtask header
 */
export function broadcastSubtaskHeader(
  jobId: string,
  agentId: string,
  index: number,
  total: number,
  wsClientService: WebSocketClientService
): void {
  const displayAgentId = agentId === 'consolidator'
    ? '📊 Consolidator (Summary)'
    : `@${agentId}`;

  wsClientService.broadcast({
    type: 'job_output',
    payload: {
      jobId,
      text: `\n\x1b[1m\x1b[35m═══ Subtask ${index + 1}/${total}: ${displayAgentId} ═══\x1b[0m\n\n`,
      raw: true,
    } as JobOutputPayload,
  });
}

/**
 * Broadcast task completion message
 */
export function broadcastTaskComplete(
  jobId: string,
  taskCount: number | null,
  wsClientService: WebSocketClientService
): void {
  const message = taskCount && taskCount > 1
    ? `\x1b[32m\n━━━ All ${taskCount} Tasks Complete ━━━\x1b[0m\n`
    : `\x1b[32m\n━━━ Task Complete ━━━\x1b[0m\n`;

  wsClientService.broadcast({
    type: 'job_output',
    payload: {
      jobId,
      text: message,
      raw: true,
    } as JobOutputPayload,
  });
}
