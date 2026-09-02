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
    // Matched against the subagent's `agent_type`, not a tool name. This was
    // declared `false`, which made addClaudeHook/updateClaudeHook drop a matcher
    // the user had typed — the hook then fired for every subagent instead.
    hasMatcher: true,
    matcherType: 'agent',
    matcherDescription: 'Subagent type (e.g. "code-reviewer" or "a|b"); omit to match every subagent',
  },
};

// ============================================
// CLAUDE CODE HOOK TEMPLATES
// ============================================

/**
 * Claude Code hook templates
 */
/**
 * The two hook primitives every built-in template runs.
 *
 * These replaced inline shell that read the payload with `jq` — which a stock
 * Windows install does not have, so the templates were silently inert on the
 * primary platform. `block-env` was the sharp case: a PreToolUse guard whose
 * whole purpose is to exit 2 could never block, while the dashboard listed it
 * as active protection for .env files.
 *
 * Both scripts read the documented stdin payload, exit 0 on anything they do
 * not understand, and are installed into the project by
 * {@link ClaudeHooksService.installHookScript}.
 */
export const FILE_CHANGE_HOOK_SCRIPT = 'on-file-change.mjs';
export const BASH_COMMAND_HOOK_SCRIPT = 'on-bash-command.mjs';
export const STALE_DOCS_HOOK_SCRIPT = 'warn-stale-docs.mjs';

/** Every template's command starts with one of these. */
export const HOOK_SCRIPT_COMMANDS = {
  file: `node .claude/hooks/${FILE_CHANGE_HOOK_SCRIPT}`,
  bash: `node .claude/hooks/${BASH_COMMAND_HOOK_SCRIPT}`,
} as const;

/**
 * API integration validation — the two scripts that replace the old
 * `SubagentStop` prompt hook.
 *
 * The old design matched on agent *name*, so it never fired for generically
 * typed subagents, and when it did fire it spent one model call per subagent.
 * These two run instead:
 *
 *  - {@link INTEGRATION_VALIDATOR_MARK_SCRIPT} on `PostToolUse` — a path
 *    comparison per file write, no model call. Hooks in settings.json also run
 *    inside subagents, so this is agent-name independent by construction.
 *  - {@link INTEGRATION_VALIDATOR_DECIDE_SCRIPT} on `Stop` — one decision per
 *    turn, reading the marker the first script wrote. The marker is the
 *    debounce: a fan-out of parallel subagents collapses into a single check.
 */
/**
 * The file-write primitive the automation recipes run.
 *
 * Recipes used to inline shell that interpolated `$CLAUDE_FILE_PATHS`, which
 * Claude Code does not define — so the formatters formatted nothing and the
 * "block sensitive files" guard grepped an empty string and never blocked. One
 * Node helper replaces all of them; see templates/hooks/on-file-change.mjs.
 */
export const INTEGRATION_VALIDATOR_MARK_SCRIPT = 'mark-api-change.mjs';
export const INTEGRATION_VALIDATOR_DECIDE_SCRIPT = 'integration-validate.mjs';

/**
 * Hook scripts are invoked through Node, not bash.
 *
 * The bash hooks in this file need `jq`, which is not present on a stock
 * Windows install — and a hook that silently no-ops on the primary platform is
 * the failure this whole rewrite exists to fix. Node is already a hard
 * requirement for dev-suite's MCP servers, so it is always there.
 */
export const HOOK_SCRIPT_RUNNER = 'node';

/** Tools whose writes can change an API contract. */
export const INTEGRATION_VALIDATOR_TOOL_MATCHER = 'Write|Edit|MultiEdit|NotebookEdit';

/** Marker file written by the PostToolUse script, relative to the project. */
export const API_TOUCHED_MARKER_REL = '.claude/.ds-api-touched';

/**
 * How assertive the `Stop` check is.
 *  - `off`   — not installed at all
 *  - `warn`  — a note to the user through `systemMessage`; the model never sees
 *              it, so nothing is validated
 *  - `block` — exits 2 so Claude continues the turn and runs the validation
 *
 * The default is `block`, and that was decided by measurement rather than
 * taste. `warn` was the default on the theory that a Stop hook blocking on a
 * false positive costs a whole turn; a real headless session against a real
 * React + NestJS project showed the other side of that trade: under `warn` the
 * model edited a controller and validated nothing, and under `block` — same
 * prompt, same project — it performed the reconciliation and cited the hook.
 * An default that never fires is the exact failure this mechanism was rewritten
 * to fix, so the cost of a false positive is the one worth paying. The path
 * patterns were narrowed first (see mark-api-change.mjs) so there are fewer of
 * them to pay for.
 */
export type IntegrationValidationLevel = 'off' | 'warn' | 'block';

export const DEFAULT_INTEGRATION_VALIDATION_LEVEL: IntegrationValidationLevel = 'block';

export const CLAUDE_HOOK_TEMPLATES: Record<string, ClaudeHookTemplate> = {
  'auto-format': {
    id: 'auto-format',
    name: 'Auto-format on Write/Edit',
    description: 'Automatically run Prettier after file modifications',
    hooks: [{ matcher: 'Write|Edit|MultiEdit', hooks: [`${HOOK_SCRIPT_COMMANDS.file} -- npx prettier --write`] }],
    event: 'PostToolUse',
  },
  'block-env': {
    id: 'block-env',
    name: 'Block .env modifications',
    description: 'Prevent Claude from modifying .env files',
    hooks: [
      {
        matcher: 'Write|Edit',
        hooks: [`${HOOK_SCRIPT_COMMANDS.file} --match "(\\.env$|\\.env\\.)" --block "Cannot modify .env files"`],
      },
    ],
    event: 'PreToolUse',
  },
  'log-bash': {
    id: 'log-bash',
    name: 'Log Bash commands',
    description: 'Log all Bash commands to a file',
    hooks: [{ matcher: 'Bash', hooks: [`${HOOK_SCRIPT_COMMANDS.bash} --log .claude/bash-history.log`] }],
    event: 'PreToolUse',
  },
  'typecheck-on-write': {
    id: 'typecheck-on-write',
    name: 'Type-check TypeScript files',
    description: 'Run tsc --noEmit after TypeScript file changes',
    hooks: [{ matcher: 'Write|Edit|MultiEdit', hooks: [`${HOOK_SCRIPT_COMMANDS.file} --ext .ts,.tsx --no-file --strict -- npx tsc --noEmit`] }],
    event: 'PostToolUse',
  },
  'lint-on-write': {
    id: 'lint-on-write',
    name: 'Lint on Write',
    description: 'Run ESLint after file modifications',
    hooks: [{ matcher: 'Write|Edit|MultiEdit', hooks: [`${HOOK_SCRIPT_COMMANDS.file} --ext .js,.jsx,.ts,.tsx -- npx eslint --fix`] }],
    event: 'PostToolUse',
  },
  'doc-freshness': {
    id: 'doc-freshness',
    name: 'Doc freshness check on commit',
    description: 'Verify README documentation matches filesystem before git commits',
    hooks: [{
      matcher: 'Bash',
      hooks: [
        `${HOOK_SCRIPT_COMMANDS.bash} --match "git\\s+(commit|push)" -- node .claude/hooks/warn-stale-docs.mjs`,
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
