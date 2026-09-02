#!/usr/bin/env bash
# filter-lint.sh — PreToolUse hook for Claude Code
#
# Intercepts linter commands (eslint, pylint, flake8, clippy, detekt, ktlint,
# golangci-lint, cargo fmt --check, prettier --check, etc.) and rewrites them
# to emit only error-severity (or high-severity) lines plus a warning count.
#
# Token savings: approximately 5–20K tokens per invocation. Warning-only runs
# that generate hundreds of lines are reduced to a single summary count while
# errors are preserved verbatim.
#
# Fail-open: if jq is unavailable or the command does not match a linter, the
# original command is emitted unchanged.
#
# Cross-platform: requires bash + jq. On Windows use WSL or Git Bash.

set -euo pipefail

INPUT="$(cat)"

if ! command -v jq &>/dev/null; then
  exit 0
fi

ORIGINAL_CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"

if [ -z "$ORIGINAL_CMD" ]; then
  exit 0
fi

is_lint_cmd() {
  local cmd="$1"
  echo "$cmd" | grep -qiE \
    '(^|\s)(eslint|npx\s+eslint|yarn\s+eslint|biome\s+(check|lint)|pylint|flake8|pyflakes|ruff(\s+check)?|mypy|cargo\s+(clippy|fmt(\s+--check)?)|cargo\s+check|clippy|detekt|ktlint|golangci-lint|staticcheck|golint|go\s+vet|prettier\s+--check|npx\s+prettier\s+--check|rubocop|standardrb|npm\s+run\s+lint|yarn\s+lint|pnpm\s+lint|swift-format|swiftlint)' \
    2>/dev/null
}

if ! is_lint_cmd "$ORIGINAL_CMD"; then
  exit 0
fi

# Build filter pipeline:
#   - Run linter, capture all output
#   - Print error-severity lines verbatim
#   - Print a single summary of warning count
FILTER_CMD="$(cat <<'FILTER'
bash -c '
set -o pipefail
__output=$( eval "$1" 2>&1 ); __exit=$?
__errors=$(echo "$__output" | grep -E \
  "(error(\[|\s)|Error:|ERROR|✖|✗|\berror\b|: error |E[0-9]{3,}|cannot find|undeclared|undefined|unused import|type error|SyntaxError|ParseError|Fatal|FATAL|\[error\]|\[E\])" \
  2>/dev/null || true)
__warn_count=$(echo "$__output" | grep -ciE \
  "(warning(\[|\s)|Warning:|WARNING|⚠|warn\b|\[warn\]|\[W\]|W[0-9]{3,})" \
  2>/dev/null || echo 0)
if [ -n "$__errors" ]; then
  echo "$__errors"
else
  echo "(no errors found)"
fi
echo "--- $__warn_count warning(s) suppressed ---"
exit $__exit
'
FILTER
)"

# Append the original command as a single quoted argument. This has to happen
# out here: inside the quoted heredoc above it would stay a literal and expand
# to nothing in the shell that finally runs the command.
FILTER_CMD="$FILTER_CMD _ $(printf '%q' "$ORIGINAL_CMD")"

printf '%s' "$INPUT" | jq --arg cmd "$FILTER_CMD" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", updatedInput: (.tool_input | .command = $cmd)}}'
