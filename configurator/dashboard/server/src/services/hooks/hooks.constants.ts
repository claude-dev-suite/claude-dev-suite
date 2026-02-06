// SPDX-License-Identifier: MIT
/**
 * Hooks Constants
 *
 * Configuration constants for Git hooks and Claude Code hooks.
 */

import type {
  HookAction,
  HookType,
  ClaudeHookEvent,
  ClaudeHookTemplate,
} from '../../types.js';

// ============================================
// GIT HOOK ACTIONS
// ============================================

/**
 * Available hook actions with their commands
 */
export const HOOK_ACTIONS: Record<string, HookAction> = {
  format: {
    name: 'Format',
    description: 'Run code formatter (Prettier/Biome)',
    npmScript: 'format',
    fallback: 'npx prettier --write "**/*.{js,jsx,ts,tsx,json,css,md}" --ignore-path .gitignore',
    detectPackages: ['prettier', '@biomejs/biome', 'biome'],
  },
  lint: {
    name: 'Lint',
    description: 'Run linter (ESLint/Biome)',
    npmScript: 'lint',
    fallback: 'npx eslint . --fix',
    detectPackages: ['eslint', '@biomejs/biome', 'biome'],
  },
  typecheck: {
    name: 'Type Check',
    description: 'Run TypeScript type checker',
    npmScript: 'typecheck',
    altScripts: ['type-check', 'types', 'tsc'],
    fallback: 'npx tsc --noEmit',
    detectPackages: ['typescript'],
  },
  test: {
    name: 'Test',
    description: 'Run test suite',
    npmScript: 'test',
    fallback: 'npm test',
    detectPackages: ['vitest', 'jest', 'mocha', '@testing-library/react'],
  },
  build: {
    name: 'Build',
    description: 'Run build process',
    npmScript: 'build',
    fallback: 'npm run build',
    detectPackages: [],
  },
  security: {
    name: 'Security Scan',
    description: 'Run security audit',
    npmScript: 'audit',
    fallback: 'npm audit --audit-level=high',
    detectPackages: [],
  },
};

// ============================================
// GIT HOOK TYPES
// ============================================

/**
 * Hook types with their Git event names
 */
export const HOOK_TYPES: Record<string, HookType> = {
  preCommit: {
    name: 'pre-commit',
    description: 'Runs before each commit - use to check code quality',
    category: 'client',
    suggestedActions: ['format', 'lint', 'typecheck'],
  },
  prepareCommitMsg: {
    name: 'prepare-commit-msg',
    description: 'Runs before commit message editor - use to modify default message',
    category: 'client',
    suggestedActions: [],
  },
  commitMsg: {
    name: 'commit-msg',
    description: 'Validates commit message format',
    category: 'client',
    suggestedActions: [],
  },
  postCommit: {
    name: 'post-commit',
    description: 'Runs after commit is made - use for notifications',
    category: 'client',
    suggestedActions: [],
  },
  preMergeCommit: {
    name: 'pre-merge-commit',
    description: 'Runs before merge commit - use to validate merges',
    category: 'client',
    suggestedActions: ['lint', 'typecheck'],
  },
  prePush: {
    name: 'pre-push',
    description: 'Runs before pushing to remote - use for final checks',
    category: 'client',
    suggestedActions: ['test', 'security'],
  },
  preRebase: {
    name: 'pre-rebase',
    description: 'Runs before rebase - use to prevent rebasing certain branches',
    category: 'client',
    suggestedActions: [],
  },
  postCheckout: {
    name: 'post-checkout',
    description: 'Runs after checkout - use to setup environment',
    category: 'client',
    suggestedActions: [],
  },
  postMerge: {
    name: 'post-merge',
    description: 'Runs after merge - use to restore data or notify',
    category: 'client',
    suggestedActions: [],
  },
  postRewrite: {
    name: 'post-rewrite',
    description: 'Runs after rewrite (amend, rebase) - use to update related data',
    category: 'client',
    suggestedActions: [],
  },
  preReceive: {
    name: 'pre-receive',
    description: 'Server: runs before refs are updated - use to enforce policies',
    category: 'server',
    suggestedActions: [],
  },
  update: {
    name: 'update',
    description: 'Server: runs once per branch being updated',
    category: 'server',
    suggestedActions: [],
  },
  postReceive: {
    name: 'post-receive',
    description: 'Server: runs after all refs updated - use for CI/CD triggers',
    category: 'server',
    suggestedActions: [],
  },
  applypatchMsg: {
    name: 'applypatch-msg',
    description: 'Email: validates patch commit message (git am)',
    category: 'email',
    suggestedActions: [],
  },
  preApplypatch: {
    name: 'pre-applypatch',
    description: 'Email: runs before patch is applied (git am)',
    category: 'email',
    suggestedActions: [],
  },
  postApplypatch: {
    name: 'post-applypatch',
    description: 'Email: runs after patch is applied (git am)',
    category: 'email',
    suggestedActions: [],
  },
};

/**
 * Conventional commit message pattern
 */
export const CONVENTIONAL_COMMIT_PATTERN = '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\\(.+\\))?: .{1,}$';

// ============================================
// CLAUDE CODE HOOK EVENTS
// ============================================

/**
 * Claude Code hook events
 */
export const CLAUDE_HOOK_EVENTS: Record<string, ClaudeHookEvent> = {
  PreToolUse: {
    name: 'PreToolUse',
    description: 'Runs before a tool is used',
    hasMatcher: true,
    matcherType: 'tool',
    matcherDescription: 'Tool name regex (e.g., "Write|Edit" or "Bash")',
  },
  PostToolUse: {
    name: 'PostToolUse',
    description: 'Runs after a tool is used',
    hasMatcher: true,
    matcherType: 'tool',
    matcherDescription: 'Tool name regex',
  },
  Notification: {
    name: 'Notification',
    description: 'Runs when Claude sends a notification',
    hasMatcher: true,
    matcherType: 'type',
    matcherDescription: 'Notification type',
  },
  Stop: {
    name: 'Stop',
    description: 'Runs when Claude finishes responding',
    hasMatcher: false,
  },
  SubagentStop: {
    name: 'SubagentStop',
    description: 'Runs when a subagent finishes',
    hasMatcher: false,
  },
};

// ============================================
// CLAUDE CODE HOOK TEMPLATES
// ============================================

/**
 * Claude Code hook templates
 */
export const CLAUDE_HOOK_TEMPLATES: Record<string, ClaudeHookTemplate> = {
  'auto-format': {
    id: 'auto-format',
    name: 'Auto-format on Write/Edit',
    description: 'Automatically run Prettier after file modifications',
    hooks: [{ matcher: 'Write|Edit', hooks: ['npx prettier --write "$CLAUDE_FILE_PATHS"'] }],
    event: 'PostToolUse',
  },
  'block-env': {
    id: 'block-env',
    name: 'Block .env modifications',
    description: 'Prevent Claude from modifying .env files',
    hooks: [
      {
        matcher: 'Write|Edit',
        hooks: ['test ! -f "$CLAUDE_FILE_PATHS" || [[ ! "$CLAUDE_FILE_PATHS" =~ \\.env ]] || (echo "Blocked: Cannot modify .env files" && exit 2)'],
      },
    ],
    event: 'PreToolUse',
  },
  'log-bash': {
    id: 'log-bash',
    name: 'Log Bash commands',
    description: 'Log all Bash commands to a file',
    hooks: [{ matcher: 'Bash', hooks: ['echo "[$(date)] $CLAUDE_TOOL_INPUT" >> .claude/bash-history.log'] }],
    event: 'PreToolUse',
  },
  'typecheck-on-write': {
    id: 'typecheck-on-write',
    name: 'Type-check TypeScript files',
    description: 'Run tsc --noEmit after TypeScript file changes',
    hooks: [{ matcher: 'Write|Edit', hooks: ['[[ "$CLAUDE_FILE_PATHS" =~ \\.(ts|tsx)$ ]] && npx tsc --noEmit || true'] }],
    event: 'PostToolUse',
  },
  'lint-on-write': {
    id: 'lint-on-write',
    name: 'Lint on Write',
    description: 'Run ESLint after file modifications',
    hooks: [{ matcher: 'Write|Edit', hooks: ['[[ "$CLAUDE_FILE_PATHS" =~ \\.(js|jsx|ts|tsx)$ ]] && npx eslint --fix "$CLAUDE_FILE_PATHS" || true'] }],
    event: 'PostToolUse',
  },
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

export function escapeShellSingleQuote(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/'/g, "'\\''");
}

export function isValidRegex(pattern: string): boolean {
  if (!pattern || typeof pattern !== 'string') return false;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

export function isValidAction(action: string): boolean {
  return Boolean(action && typeof action === 'string' && action in HOOK_ACTIONS);
}
