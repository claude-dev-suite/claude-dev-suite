# Hook Types Comparison

## Overview

| Type | Runs | Judgment | Tool access | Timeout |
|------|------|----------|-------------|---------|
| `command` | Shell command | No (deterministic) | No | 10 min default |
| `prompt` | Single LLM call | Yes | No | 10 min default |
| `agent` | Multi-turn subagent | Yes | Yes (Read, Bash, etc.) | 60 sec default |
| `http` | HTTP POST to URL | No (server decides) | No | 10 min default |

## command

Most common type. Runs a shell command, receives JSON on stdin, uses exit codes.

```json
{
  "type": "command",
  "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write",
  "timeout": 30
}
```

**Use when:** Deterministic validation, formatting, logging, file operations.

**Input:** JSON on stdin
**Output:** Exit code (0=allow, 2=block) + stdout/stderr

## prompt

Single-turn LLM evaluation. Sends your prompt + hook input to a Claude model.

```json
{
  "type": "prompt",
  "prompt": "Check if all tasks are complete. Return {\"ok\": false, \"reason\": \"...\"} if not.",
  "model": "haiku"
}
```

**Use when:** Decision requires judgment but not codebase inspection.

**Response format:** Model must return `{"ok": true}` or `{"ok": false, "reason": "..."}`.
- `ok: true` → action proceeds
- `ok: false` → action blocked, reason fed to Claude

**Model:** Defaults to Haiku. Set `model` for more capability.

## agent

Multi-turn subagent with tool access. Can read files, run commands, then decide.

```json
{
  "type": "agent",
  "prompt": "Verify all unit tests pass. Run the test suite and check results. $ARGUMENTS",
  "timeout": 120
}
```

**Use when:** Verification requires inspecting files or running commands.

**Response format:** Same as prompt (`{"ok": true/false, "reason": "..."}`).
**Tool access:** Read, Grep, Glob, Bash by default.
**Max turns:** 50 by default.

## http

POSTs event JSON to an HTTP endpoint. Response body uses same JSON format as command hooks.

```json
{
  "type": "http",
  "url": "http://localhost:8080/hooks/tool-use",
  "headers": {
    "Authorization": "Bearer $MY_TOKEN"
  },
  "allowedEnvVars": ["MY_TOKEN"]
}
```

**Use when:** External service should handle the logic (audit server, CI system).

**Headers:** Support `$VAR` interpolation. Only vars in `allowedEnvVars` are resolved.
**Response:** 2xx with JSON body. HTTP status codes alone cannot block actions.

## Decision Tree

```
Need to validate/block something?
├── Is the rule deterministic? → command
├── Needs judgment but not file access? → prompt
├── Needs to check files or run tests? → agent
└── External service should decide? → http
```

## Configuration in settings.json

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "./validate.sh" },
          { "type": "prompt", "prompt": "Is this command safe?" }
        ]
      }
    ]
  }
}
```

Multiple hooks per event run in parallel. Identical commands are deduplicated.
