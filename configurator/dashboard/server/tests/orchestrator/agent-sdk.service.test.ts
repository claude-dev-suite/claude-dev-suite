/**
 * Agent SDK Service Unit Tests
 *
 * Tests for:
 * - Type guards for SDK message types
 * - Tool formatting and display
 * - Text truncation utilities
 * - Message processing helpers
 */

import { describe, it, expect } from 'vitest';
import { AgentSDKService } from '../../src/services/orchestrator/agent-sdk.service.js';
import type {
  SystemInitMessage,
  AssistantMessage,
  UserMessage,
  ResultMessage,
} from '../../src/services/orchestrator/types.js';

describe('AgentSDKService', () => {
  let sdkService: AgentSDKService;

  beforeEach(() => {
    sdkService = new AgentSDKService();
  });

  describe('isSystemInitMessage', () => {
    it('should return true for valid system init message', () => {
      const validMessage: SystemInitMessage = {
        type: 'system',
        subtype: 'init',
        session_id: 'session-123',
      };

      expect(sdkService.isSystemInitMessage(validMessage)).toBe(true);
    });

    it('should return false for message with wrong type', () => {
      const message = {
        type: 'user',
        subtype: 'init',
        session_id: 'session-123',
      };

      expect(sdkService.isSystemInitMessage(message)).toBe(false);
    });

    it('should return false for message with wrong subtype', () => {
      const message = {
        type: 'system',
        subtype: 'complete',
        session_id: 'session-123',
      };

      expect(sdkService.isSystemInitMessage(message)).toBe(false);
    });

    it('should return false for message without session_id', () => {
      const message = {
        type: 'system',
        subtype: 'init',
      };

      expect(sdkService.isSystemInitMessage(message)).toBe(false);
    });

    it('should return false for null', () => {
      expect(sdkService.isSystemInitMessage(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(sdkService.isSystemInitMessage(undefined)).toBe(false);
    });

    it('should return false for non-object types', () => {
      expect(sdkService.isSystemInitMessage('string')).toBe(false);
      expect(sdkService.isSystemInitMessage(123)).toBe(false);
      expect(sdkService.isSystemInitMessage(true)).toBe(false);
    });
  });

  describe('isAssistantMessage', () => {
    it('should return true for valid assistant message', () => {
      const validMessage: AssistantMessage = {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'tool_use', name: 'Read', input: { file_path: '/test' } },
          ],
        },
      };

      expect(sdkService.isAssistantMessage(validMessage)).toBe(true);
    });

    it('should return false for message with wrong type', () => {
      const message = {
        type: 'user',
        message: {
          content: [{ type: 'text', text: 'Hello' }],
        },
      };

      expect(sdkService.isAssistantMessage(message)).toBe(false);
    });

    it('should return false for message without content array', () => {
      const message = {
        type: 'assistant',
        message: {
          content: 'not an array',
        },
      };

      expect(sdkService.isAssistantMessage(message)).toBe(false);
    });

    it('should return false for message without message object', () => {
      const message = {
        type: 'assistant',
      };

      expect(sdkService.isAssistantMessage(message)).toBe(false);
    });

    it('should return false for null message object', () => {
      const message = {
        type: 'assistant',
        message: null,
      };

      expect(sdkService.isAssistantMessage(message)).toBe(false);
    });

    it('should return true for assistant message with empty content array', () => {
      const message: AssistantMessage = {
        type: 'assistant',
        message: {
          content: [],
        },
      };

      expect(sdkService.isAssistantMessage(message)).toBe(true);
    });
  });

  describe('isUserMessage', () => {
    it('should return true for valid user message', () => {
      const validMessage: UserMessage = {
        type: 'user',
        message: {
          content: [{ type: 'text', content: 'Hello' }],
        },
      };

      expect(sdkService.isUserMessage(validMessage)).toBe(true);
    });

    it('should return false for message with wrong type', () => {
      const message = {
        type: 'assistant',
        message: {
          content: [{ type: 'text', content: 'Hello' }],
        },
      };

      expect(sdkService.isUserMessage(message)).toBe(false);
    });

    it('should return false for message without content array', () => {
      const message = {
        type: 'user',
        message: {
          text: 'not an array',
        },
      };

      expect(sdkService.isUserMessage(message)).toBe(false);
    });

    it('should return true for user message with empty content array', () => {
      const message: UserMessage = {
        type: 'user',
        message: {
          content: [],
        },
      };

      expect(sdkService.isUserMessage(message)).toBe(true);
    });
  });

  describe('isResultMessage', () => {
    it('should return true for valid result message (success)', () => {
      const validMessage: ResultMessage = {
        type: 'result',
        is_error: false,
        result: 'Success',
        total_cost_usd: 0.05,
        num_turns: 3,
      };

      expect(sdkService.isResultMessage(validMessage)).toBe(true);
    });

    it('should return true for valid result message (error)', () => {
      const validMessage: ResultMessage = {
        type: 'result',
        is_error: true,
        result: 'Error occurred',
      };

      expect(sdkService.isResultMessage(validMessage)).toBe(true);
    });

    it('should return false for message with wrong type', () => {
      const message = {
        type: 'user',
        is_error: false,
      };

      expect(sdkService.isResultMessage(message)).toBe(false);
    });

    it('should return false for message without is_error', () => {
      const message = {
        type: 'result',
        result: 'Success',
      };

      expect(sdkService.isResultMessage(message)).toBe(false);
    });

    it('should return false for message with non-boolean is_error', () => {
      const message = {
        type: 'result',
        is_error: 'false',
      };

      expect(sdkService.isResultMessage(message)).toBe(false);
    });

    it('should return true for minimal valid result message', () => {
      const message: ResultMessage = {
        type: 'result',
        is_error: false,
      };

      expect(sdkService.isResultMessage(message)).toBe(true);
    });
  });

  describe('formatToolUse', () => {
    it('should format Read tool with file path', () => {
      const result = sdkService.formatToolUse('Read', { file_path: '/path/to/file.ts' });
      expect(result).toBe('📖 Reading: /path/to/file.ts');
    });

    it('should format Write tool with file path', () => {
      const result = sdkService.formatToolUse('Write', { file_path: '/path/to/file.ts' });
      expect(result).toBe('✍️ Writing: /path/to/file.ts');
    });

    it('should format Edit tool with file path', () => {
      const result = sdkService.formatToolUse('Edit', { file_path: '/path/to/file.ts' });
      expect(result).toBe('✏️ Editing: /path/to/file.ts');
    });

    it('should format Bash tool with command', () => {
      const result = sdkService.formatToolUse('Bash', { command: 'npm install' });
      expect(result).toBe('💻 Running: npm install');
    });

    it('should truncate long Bash commands', () => {
      const longCommand = 'npm install express typescript vitest playwright prisma dotenv';
      const result = sdkService.formatToolUse('Bash', { command: longCommand });
      expect(result).toContain('💻 Running:');
      expect(result.length).toBeLessThan(80);
      expect(result).toContain('...');
    });

    it('should format Glob tool with pattern', () => {
      const result = sdkService.formatToolUse('Glob', { pattern: '**/*.ts' });
      expect(result).toBe('🔍 Searching: **/*.ts');
    });

    it('should format Grep tool with pattern', () => {
      const result = sdkService.formatToolUse('Grep', { pattern: 'TODO' });
      expect(result).toBe('🔎 Grep: TODO');
    });

    it('should format Task tool with description', () => {
      const result = sdkService.formatToolUse('Task', { description: 'Analyze code' });
      expect(result).toBe('🤖 Delegating: Analyze code');
    });

    it('should format Task tool with subagent_type if no description', () => {
      const result = sdkService.formatToolUse('Task', { subagent_type: 'react-expert' });
      expect(result).toBe('🤖 Delegating: react-expert');
    });

    it('should format NotebookEdit tool with path', () => {
      const result = sdkService.formatToolUse('NotebookEdit', { notebook_path: '/notebook.ipynb' });
      expect(result).toBe('📓 Notebook: /notebook.ipynb');
    });

    it('should format LSP tool with operation', () => {
      const result = sdkService.formatToolUse('LSP', { operation: 'definition' });
      expect(result).toBe('🔗 LSP: definition');
    });

    it('should handle tools with missing input fields', () => {
      const result = sdkService.formatToolUse('Read', {});
      expect(result).toBe('📖 Reading: ');
    });

    it('should format unknown tools with default icon', () => {
      const result = sdkService.formatToolUse('CustomTool', { param: 'value' });
      expect(result).toBe('🔧 CustomTool');
    });

    it('should include correct icons for all predefined tools', () => {
      expect(sdkService.formatToolUse('WebFetch', {})).toContain('🌐');
      expect(sdkService.formatToolUse('WebSearch', {})).toContain('🔎');
      expect(sdkService.formatToolUse('AskUserQuestion', {})).toContain('❓');
      expect(sdkService.formatToolUse('TodoWrite', {})).toContain('📝');
      expect(sdkService.formatToolUse('KillShell', {})).toContain('🛑');
      expect(sdkService.formatToolUse('TaskOutput', {})).toContain('📤');
      expect(sdkService.formatToolUse('EnterPlanMode', {})).toContain('📋');
      expect(sdkService.formatToolUse('ExitPlanMode', {})).toContain('✅');
      expect(sdkService.formatToolUse('Skill', {})).toContain('⚡');
    });
  });

  describe('truncateText', () => {
    it('should not truncate text shorter than max length', () => {
      const text = 'Short text';
      const result = sdkService.truncateText(text);
      expect(result).toBe(text);
    });

    it('should truncate text longer than default max length (150)', () => {
      const text = 'x'.repeat(200);
      const result = sdkService.truncateText(text);
      expect(result.length).toBe(153); // 150 + '...'
      expect(result.endsWith('...')).toBe(true);
    });

    it('should truncate text at exact max length', () => {
      const text = 'x'.repeat(150);
      const result = sdkService.truncateText(text);
      expect(result).toBe(text); // Exactly 150, no truncation
    });

    it('should truncate text at custom max length', () => {
      const text = 'x'.repeat(100);
      const result = sdkService.truncateText(text, 50);
      expect(result.length).toBe(53); // 50 + '...'
      expect(result.endsWith('...')).toBe(true);
    });

    it('should handle empty string', () => {
      const result = sdkService.truncateText('');
      expect(result).toBe('');
    });

    it('should preserve content before ellipsis', () => {
      const text = 'This is a very long text that needs to be truncated';
      const result = sdkService.truncateText(text, 20);
      expect(result.startsWith('This is a very long')).toBe(true);
      expect(result.endsWith('...')).toBe(true);
    });
  });

  describe('truncateOutput', () => {
    it('should not truncate output shorter than max chars', () => {
      const text = 'Short output';
      const result = sdkService.truncateOutput(text);
      expect(result).toBe(text);
    });

    it('should not truncate output at exact max chars', () => {
      const text = 'x'.repeat(8000);
      const result = sdkService.truncateOutput(text);
      expect(result).toBe(text);
    });

    it('should truncate output longer than default max chars (8000)', () => {
      const text = 'x'.repeat(10000);
      const result = sdkService.truncateOutput(text);
      expect(result).toContain('[... output truncated for brevity ...]');
      expect(result.length).toBeLessThan(text.length);
    });

    it('should keep first and last portions of truncated output', () => {
      const start = 'START'.repeat(2000); // 10000 chars
      const end = 'END'.repeat(2000);
      const text = start + end;

      const result = sdkService.truncateOutput(text);

      expect(result).toContain('START');
      expect(result).toContain('END');
      expect(result).toContain('[... output truncated for brevity ...]');
    });

    it('should truncate output at custom max chars', () => {
      const text = 'x'.repeat(1000);
      const result = sdkService.truncateOutput(text, 500);

      expect(result).toContain('[... output truncated for brevity ...]');
      expect(result.length).toBeLessThan(text.length);
    });

    it('should split evenly between start and end', () => {
      const text = 'A'.repeat(5000) + 'B'.repeat(5000);
      const result = sdkService.truncateOutput(text, 1000);

      // Should have 500 chars from start (A's) + truncate message + 500 from end (B's)
      const firstHalf = result.split('[... output truncated for brevity ...]')[0];
      const secondHalf = result.split('[... output truncated for brevity ...]')[1];

      expect(firstHalf).toContain('A');
      expect(secondHalf).toContain('B');
      expect(firstHalf).not.toContain('B');
    });

    it('should handle empty string', () => {
      const result = sdkService.truncateOutput('');
      expect(result).toBe('');
    });

    it('should handle null/undefined gracefully', () => {
      // @ts-expect-error Testing edge case
      const result1 = sdkService.truncateOutput(null);
      expect(result1).toBeFalsy();

      // @ts-expect-error Testing edge case
      const result2 = sdkService.truncateOutput(undefined);
      expect(result2).toBeFalsy();
    });

    it('should add newlines around truncation message', () => {
      const text = 'x'.repeat(10000);
      const result = sdkService.truncateOutput(text);

      expect(result).toContain('\n\n[... output truncated for brevity ...]\n\n');
    });
  });

  describe('Type Guard Edge Cases', () => {
    it('should handle arrays as input', () => {
      expect(sdkService.isSystemInitMessage([])).toBe(false);
      expect(sdkService.isAssistantMessage([])).toBe(false);
      expect(sdkService.isUserMessage([])).toBe(false);
      expect(sdkService.isResultMessage([])).toBe(false);
    });

    it('should handle objects with extra properties', () => {
      const message = {
        type: 'system',
        subtype: 'init',
        session_id: 'session-123',
        extra: 'property',
      };

      expect(sdkService.isSystemInitMessage(message)).toBe(true);
    });

    it('should validate nested structures strictly', () => {
      const messageWithInvalidContent = {
        type: 'assistant',
        message: {
          content: 'not-an-array',
        },
      };

      expect(sdkService.isAssistantMessage(messageWithInvalidContent)).toBe(false);
    });

    it('should handle deeply nested null values', () => {
      const messageWithNullContent = {
        type: 'assistant',
        message: {
          content: null,
        },
      };

      expect(sdkService.isAssistantMessage(messageWithNullContent)).toBe(false);
    });
  });

  describe('formatToolUse Edge Cases', () => {
    it('should handle input with non-string values', () => {
      const result = sdkService.formatToolUse('Read', { file_path: 123 });
      expect(result).toContain('123');
    });

    it('should handle null input object', () => {
      // @ts-expect-error Testing edge case
      // This will throw because the code doesn't handle null input
      expect(() => {
        sdkService.formatToolUse('Read', null);
      }).toThrow();
    });

    it('should handle undefined input properties', () => {
      const result = sdkService.formatToolUse('Bash', { command: undefined });
      expect(result).toBe('💻 Running: ');
    });

    it('should convert input values to strings', () => {
      const result = sdkService.formatToolUse('Bash', { command: { nested: 'object' } });
      expect(result).toContain('[object Object]');
    });
  });
});
