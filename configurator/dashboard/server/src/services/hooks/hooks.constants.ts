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
  'doc-freshness': {
    id: 'doc-freshness',
    name: 'Doc freshness check on commit',
    description: 'Verify README documentation matches filesystem before git commits',
    hooks: [{
      matcher: 'Bash',
      hooks: [
        'bash -c \'if ! echo "$CLAUDE_TOOL_INPUT" | grep -qiE "git\\s+(commit|push)"; then exit 0; fi; STAGED=$(git diff --cached --name-only 2>/dev/null); if echo "$STAGED" | grep -qE "^(agents/|skills/|mcp-servers/)"; then echo "WARNING: Key directories staged. Verify README.md docs match filesystem."; echo "Staged: $STAGED"; fi\'',
      ],
    }],
    event: 'PostToolUse',
  },
};

// ============================================
// OUTPUT-FILTER HOOK TEMPLATES (PreToolUse)
// ============================================

/**
 * PreToolUse hook templates that rewrite Bash tool inputs to filter verbose
 * output before it enters Claude Code's context window.
 *
 * Each template ships a companion shell script (templates/hooks/<scriptFile>)
 * that is copied to the target project's .claude/hooks/ directory at install
 * time.  The settings.json hook command references that local script.
 *
 * All scripts are fail-open: if filtering logic encounters an error the
 * original command is forwarded unchanged.
 *
 * Token-savings estimates are approximate and depend on project verbosity.
 */
export const CLAUDE_OUTPUT_FILTER_HOOKS: Record<string, ClaudeHookTemplate> = {
  'filter-test-output': {
    id: 'filter-test-output',
    name: 'Filter test output',
    description:
      'Intercepts npm test, pytest, cargo test, go test, mvn test, gradle test and ' +
      'similar runners. Rewrites the command to emit only FAIL/ERROR/PASS summary ' +
      'lines plus a 20-line tail, preserving all information needed for debugging.',
    event: 'PreToolUse',
    scriptFile: 'filter-test-output.sh',
    tokenSavingsEstimate: '~5–50K tokens per test run (average ~10K)',
    category: 'output-filter',
    hooks: [
      {
        matcher: 'Bash',
        hooks: ['.claude/hooks/filter-test-output.sh'],
      },
    ],
  },

  'filter-lint': {
    id: 'filter-lint',
    name: 'Filter lint output',
    description:
      'Intercepts eslint, pylint, flake8, ruff, cargo clippy, golangci-lint, ' +
      'prettier --check, detekt, ktlint and similar linters. Rewrites the command ' +
      'to emit only error-severity lines plus a suppressed-warning count.',
    event: 'PreToolUse',
    scriptFile: 'filter-lint.sh',
    tokenSavingsEstimate: '~5–20K tokens per lint run',
    category: 'output-filter',
    hooks: [
      {
        matcher: 'Bash',
        hooks: ['.claude/hooks/filter-lint.sh'],
      },
    ],
  },

  'truncate-logs': {
    id: 'truncate-logs',
    name: 'Truncate log output',
    description:
      'Intercepts tail, journalctl, docker logs, kubectl logs, cat /var/log/* ' +
      'and similar log-reading commands. Caps output at the last 100 lines ' +
      '(configurable via DS_LOG_LINE_LIMIT env var) to prevent large log dumps ' +
      'from consuming the context window.',
    event: 'PreToolUse',
    scriptFile: 'truncate-logs.sh',
    tokenSavingsEstimate: '~1K–50K+ tokens per invocation (highly variable)',
    category: 'output-filter',
    hooks: [
      {
        matcher: 'Bash',
        hooks: ['.claude/hooks/truncate-logs.sh'],
      },
    ],
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
