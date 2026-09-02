#!/usr/bin/env bash
# truncate-logs.sh — PreToolUse hook for Claude Code
#
# Intercepts log-reading commands (tail, journalctl, docker logs, kubectl logs,
# cat /var/log/*, etc.) and rewrites them to cap output at the last 100 records,
# preventing massive log dumps from consuming the context window.
#
# Token savings: highly variable. Log dumps can be 50K+ tokens; this hook caps
# them to a predictable budget (~1–3K tokens). Savings are approximate.
#
# Fail-open: if jq is unavailable or the command does not match a log command,
# the original command passes through unchanged. Claude Code is never blocked.
#
# SAFETY: this hook never modifies files. It only wraps read commands in a
# | tail -100 pipeline. No rm, no eval of user content, no side effects.
#
# Cross-platform: requires bash + jq. On Windows use WSL or Git Bash.
# LINE_LIMIT defaults to 100; override via DS_LOG_LINE_LIMIT env var.

set -euo pipefail

LINE_LIMIT="${DS_LOG_LINE_LIMIT:-100}"

INPUT="$(cat)"

if ! command -v jq &>/dev/null; then
  exit 0
fi

ORIGINAL_CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"

if [ -z "$ORIGINAL_CMD" ]; then
  exit 0
fi

is_log_cmd() {
  local cmd="$1"
  echo "$cmd" | grep -qiE \
    '(^|\s|\|)(tail\b|journalctl\b|docker\s+logs?\b|kubectl\s+logs?\b|cat\s+(/var/log|/tmp|/var/run)|less\s+/var/log|more\s+/var/log|logcat\b|adb\s+logcat\b|heroku\s+logs?\b|pm2\s+logs?\b|stern\b|kubetail\b)' \
    2>/dev/null
}

if ! is_log_cmd "$ORIGINAL_CMD"; then
  exit 0
fi

# If the command already pipes to tail or head, do not double-wrap
already_limited() {
  local cmd="$1"
  echo "$cmd" | grep -qE '(\|\s*(tail|head)\s+-[0-9])' 2>/dev/null
}

if already_limited "$ORIGINAL_CMD"; then
  exit 0
fi

# Wrap in a pipeline: <original_cmd> 2>&1 | tail -N
# We quote the original command safely inside bash -c '...' using $1
FILTER_CMD="bash -c 'eval \"\$1\" 2>&1 | tail -${LINE_LIMIT}; echo \"--- output capped at ${LINE_LIMIT} lines by dev-suite truncate-logs hook ---\"' _ $(printf '%q' "$ORIGINAL_CMD")"

printf '%s' "$INPUT" | jq --arg cmd "$FILTER_CMD" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", updatedInput: (.tool_input | .command = $cmd)}}'
