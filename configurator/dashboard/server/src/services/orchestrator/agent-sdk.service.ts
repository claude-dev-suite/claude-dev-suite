// SPDX-License-Identifier: MIT
/**
 * Agent SDK Service
 *
 * Wrapper for Claude Agent SDK functionality:
 * - Type guards for SDK messages
 * - Tool formatting and display
 * - Text truncation utilities
 * - Message processing helpers
 */

import type {
  SystemInitMessage,
  AssistantMessage,
  UserMessage,
  ResultMessage,
} from './types.js';

/**
 * Parsed API error information
 */
export interface ParsedAPIError {
  type: 'content_filter' | 'rate_limit' | 'overloaded' | 'invalid_request' | 'auth' | 'process_exit' | 'unknown';
  message: string;
  userMessage: string;
  retryable: boolean;
  suggestions: string[];
  originalError: string;
}

/**
 * API error patterns for classification
 */
const API_ERROR_PATTERNS = {
  contentFilter: /output blocked by content filtering policy/i,
  rateLimit: /rate[_\s]?limit|too many requests/i,
  overloaded: /overloaded|capacity|temporarily unavailable/i,
  invalidRequest: /invalid[_\s]?request/i,
  auth: /unauthorized|invalid[_\s]?api[_\s]?key|authentication/i,
  processExit: /process exited with code/i,
};

export class AgentSDKService {
  /**
   * Type guard for system init message
   */
  isSystemInitMessage(msg: unknown): msg is SystemInitMessage {
    if (typeof msg !== 'object' || msg === null) return false;
    const obj = msg as Record<string, unknown>;
    return (
      obj.type === 'system' &&
      obj.subtype === 'init' &&
      typeof obj.session_id === 'string'
    );
  }

  /**
   * Type guard for assistant message
   */
  isAssistantMessage(msg: unknown): msg is AssistantMessage {
    if (typeof msg !== 'object' || msg === null) return false;
    const obj = msg as Record<string, unknown>;
    return (
      obj.type === 'assistant' &&
      typeof obj.message === 'object' &&
      obj.message !== null &&
      Array.isArray((obj.message as Record<string, unknown>).content)
    );
  }

  /**
   * Type guard for user message
   */
  isUserMessage(msg: unknown): msg is UserMessage {
    if (typeof msg !== 'object' || msg === null) return false;
    const obj = msg as Record<string, unknown>;
    return (
      obj.type === 'user' &&
      typeof obj.message === 'object' &&
      obj.message !== null &&
      Array.isArray((obj.message as Record<string, unknown>).content)
    );
  }

  /**
   * Type guard for result message
   */
  isResultMessage(msg: unknown): msg is ResultMessage {
    if (typeof msg !== 'object' || msg === null) return false;
    const obj = msg as Record<string, unknown>;
    return obj.type === 'result' && typeof obj.is_error === 'boolean';
  }

  /**
   * Parse and classify API errors from error messages
   */
  parseAPIError(error: Error): ParsedAPIError {
    const errorMessage = error.message || '';
    const errorString = error.toString();
    const fullContext = `${errorMessage} ${errorString}`;

    if (API_ERROR_PATTERNS.contentFilter.test(fullContext)) {
      return {
        type: 'content_filter',
        message: 'Output blocked by content filtering policy',
        userMessage: 'The AI output was blocked by content filtering. This can happen with security-related code generation.',
        retryable: true,
        suggestions: [
          'Try breaking the task into smaller, more specific steps',
          'Rephrase the request to be more specific about the implementation',
          'Ask for pseudocode or documentation first, then implement manually',
          'Use a different approach that avoids triggering content filters',
        ],
        originalError: errorMessage,
      };
    }

    if (API_ERROR_PATTERNS.rateLimit.test(fullContext)) {
      return {
        type: 'rate_limit',
        message: 'Rate limit exceeded',
        userMessage: 'API rate limit reached. Please wait a moment before retrying.',
        retryable: true,
        suggestions: ['Wait 30-60 seconds before retrying', 'Reduce the frequency of requests'],
        originalError: errorMessage,
      };
    }

    if (API_ERROR_PATTERNS.overloaded.test(fullContext)) {
      return {
        type: 'overloaded',
        message: 'API is overloaded',
        userMessage: 'The API is currently overloaded. Please try again in a few minutes.',
        retryable: true,
        suggestions: ['Wait a few minutes and retry', 'Try during off-peak hours'],
        originalError: errorMessage,
      };
    }

    if (API_ERROR_PATTERNS.auth.test(fullContext)) {
      return {
        type: 'auth',
        message: 'Authentication failed',
        userMessage: 'API authentication failed. Please check your API key configuration.',
        retryable: false,
        suggestions: [
          'Open the Credentials tab and set an Anthropic API key (sk-ant-api…) or an OAuth token from `claude setup-token` (sk-ant-oat…)',
          'Use Verify in the Credentials tab to confirm the credential is accepted',
          'An Admin API key (sk-ant-admin…) cannot run the model — it only works for usage reporting',
        ],
        originalError: errorMessage,
      };
    }

    if (API_ERROR_PATTERNS.processExit.test(fullContext)) {
      return {
        type: 'process_exit',
        message: 'Claude Code process terminated unexpectedly',
        userMessage: 'The task was interrupted. This may be due to an API error or timeout.',
        retryable: true,
        suggestions: ['Check the task output for specific error messages', 'Try running the task again', 'If the error persists, try breaking the task into smaller parts'],
        originalError: errorMessage,
      };
    }

    return {
      type: 'unknown',
      message: errorMessage || 'Unknown error',
      userMessage: `An unexpected error occurred: ${errorMessage || 'Unknown error'}`,
      retryable: false,
      suggestions: ['Check the logs for more details', 'Try running the task again'],
      originalError: errorMessage,
    };
  }

  /**
   * Format parsed error for display in UI
   */
  formatErrorForDisplay(parsedError: ParsedAPIError): string {
    let output = `Error: ${parsedError.userMessage}\n`;
    if (parsedError.suggestions.length > 0) {
      output += '\nSuggestions:\n';
      parsedError.suggestions.forEach((suggestion, index) => {
        output += `  ${index + 1}. ${suggestion}\n`;
      });
    }
    return output;
  }

  /**
   * Check if an error is related to content filtering
   */
  isContentFilterError(error: Error): boolean {
    return this.parseAPIError(error).type === 'content_filter';
  }

  /**
   * Check if an error is retryable
   */
  isRetryableError(error: Error): boolean {
    return this.parseAPIError(error).retryable;
  }

  /**
   * Format tool use with icons
   */
  formatToolUse(name: string, input: Record<string, unknown>): string {
    const icons: Record<string, string> = {
      Read: '📖',
      Write: '✍️',
      Edit: '✏️',
      Bash: '💻',
      Glob: '🔍',
      Grep: '🔎',
      Task: '🤖',
      WebFetch: '🌐',
      WebSearch: '🔎',
      AskUserQuestion: '❓',
      TodoWrite: '📝',
      NotebookEdit: '📓',
      LSP: '🔗',
      KillShell: '🛑',
      TaskOutput: '📤',
      EnterPlanMode: '📋',
      ExitPlanMode: '✅',
      Skill: '⚡',
    };
    const icon = icons[name] || '🔧';

    switch (name) {
      case 'Read':
        return `${icon} Reading: ${input.file_path || ''}`;
      case 'Write':
        return `${icon} Writing: ${input.file_path || ''}`;
      case 'Edit':
        return `${icon} Editing: ${input.file_path || ''}`;
      case 'Bash': {
        const cmd = String(input.command || '');
        return `${icon} Running: ${cmd.length > 60 ? cmd.substring(0, 60) + '...' : cmd}`;
      }
      case 'Glob':
        return `${icon} Searching: ${input.pattern || ''}`;
      case 'Grep':
        return `${icon} Grep: ${input.pattern || ''}`;
      case 'Task':
        return `${icon} Delegating: ${input.description || input.subagent_type || ''}`;
      case 'NotebookEdit':
        return `${icon} Notebook: ${input.notebook_path || ''}`;
      case 'LSP':
        return `${icon} LSP: ${input.operation || ''}`;
      default:
        return `${icon} ${name}`;
    }
  }

  /**
   * Truncate text for display
   */
  truncateText(text: string, maxLen = 150): string {
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '...';
  }

  /**
   * Truncate output text to fit within token limits
   * Keeps first and last portions for context
   */
  truncateOutput(text: string, maxChars = 8000): string {
    if (!text || text.length <= maxChars) return text;
    const half = Math.floor(maxChars / 2);
    return text.slice(0, half) + '\n\n[... output truncated for brevity ...]\n\n' + text.slice(-half);
  }
}
