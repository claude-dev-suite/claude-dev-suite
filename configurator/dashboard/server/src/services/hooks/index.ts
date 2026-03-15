// SPDX-License-Identifier: MIT
/**
 * Hooks Module
 *
 * Re-exports all hooks-related services and constants.
 */

// Constants and utilities
export {
  HOOK_ACTIONS,
  HOOK_TYPES,
  CONVENTIONAL_COMMIT_PATTERN,
  CLAUDE_HOOK_EVENTS,
  CLAUDE_HOOK_TEMPLATES,
  escapeShellSingleQuote,
  isValidRegex,
  isValidAction,
} from './hooks.constants.js';

// Git Hooks Service
export { GitHooksService } from './git-hooks.service.js';

// Claude Code Hooks Service
export { ClaudeHooksService } from './claude-hooks.service.js';
