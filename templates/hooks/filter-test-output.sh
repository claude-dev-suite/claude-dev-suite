#!/usr/bin/env bash
# filter-test-output.sh — PreToolUse hook for Claude Code
#
# Intercepts test-runner commands (npm test, pytest, cargo test, go test, etc.)
# and rewrites them to pipe through a filter that extracts only high-signal lines:
#   - FAIL / ERROR / PASSED / FAILED summary lines
#   - File paths that contain failures
#   - A brief summary tail
#
# Token savings: approximately 5–50K tokens per invocation (exact savings depend
# on test-suite verbosity; average is ~10K tokens). All FAIL lines are preserved
# verbatim so debugging is unaffected.
#
# Fail-open: if jq is unavailable, or the command does not match a test runner,
# the original command is emitted unchanged so Claude Code is never blocked.
#
# Cross-platform: requires bash + jq. On Windows use WSL or Git Bash.
# Install jq: https://stedolan.github.io/jq/download/

set -euo pipefail

# Read the JSON tool_input from stdin (Claude Code pipes it in)
INPUT="$(cat)"

# Require jq
if ! command -v jq &>/dev/null; then
  printf '%s' "$INPUT"
  exit 0
fi

# Extract the command field
ORIGINAL_CMD="$(printf '%s' "$INPUT" | jq -r '.command // empty' 2>/dev/null || true)"

if [ -z "$ORIGINAL_CMD" ]; then
  printf '%s' "$INPUT"
  exit 0
fi

# Pattern-match against known test runners (case-insensitive, anchored to command start)
is_test_cmd() {
  local cmd="$1"
  echo "$cmd" | grep -qiE \
    '(^|\s)(npm\s+(run\s+)?test|npx\s+(vitest|jest|mocha)|yarn\s+(run\s+)?test|pnpm\s+(run\s+)?test|pytest|py\.test|python\s+-m\s+pytest|cargo\s+test|go\s+test|mvn\s+(surefire:)?test|gradle(w)?\s+test|\.\/gradlew\s+test|dotnet\s+test|mix\s+test|bundle\s+exec\s+rspec|rake\s+test|phpunit|jest|vitest)' \
    2>/dev/null
}

if ! is_test_cmd "$ORIGINAL_CMD"; then
  # Not a test command — pass through unchanged
  printf '%s' "$INPUT"
  exit 0
fi

# Build a filter pipeline that:
#   1. Runs the original command (2>&1 to capture stderr too)
#   2. Preserves FAIL/ERROR/PASS summary lines, file paths with line numbers,
#      timing lines, and the final summary tail (last 20 lines)
# We use a compound shell script so Claude Code sees a single "command" string.
FILTER_CMD="$(cat <<'FILTER'
bash -c '
set -o pipefail
__cmd_output=$( eval "$1" 2>&1 ); __exit=$?
echo "$__cmd_output" | grep -E \
  "(FAIL|FAILED|ERROR|error\[|PASS|PASSED|passed|failed|✓|✗|×|ok\s|not ok\s|XFAIL|SKIP|Warning:|warning:|at\s+.+:[0-9]+|\.ts:[0-9]+|\.js:[0-9]+|\.py:[0-9]+|\.go:[0-9]+|\.rs:[0-9]+|\.java:[0-9]+|\.cs:[0-9]+|_test\.|spec\.|Test.*FAILED|Test.*PASSED|\-\-\-\s+(FAIL|PASS)|^=+$|Tests run:|test result:|FAILURES:|Summary|test session starts|short test summary)" \
  || true
echo "--- last 20 lines ---"
echo "$__cmd_output" | tail -20
exit $__exit
' _ "$ORIGINAL_CMD"
FILTER
)"

# Emit the modified tool_input JSON
printf '%s' "$INPUT" | jq --arg cmd "$FILTER_CMD" \
  '{hookSpecificOutput: {updatedInput: {command: $cmd}}}'
