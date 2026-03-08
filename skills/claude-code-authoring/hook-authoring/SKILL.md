---
name: hook-authoring
description: |
  Creates and configures Claude Code hooks for lifecycle automation. Covers all
  17 hook events, 4 hook types (command, prompt, agent, http), matchers,
  input/output formats, and exit codes. Follows official Anthropic best practices.

  USE WHEN: user mentions "hook", "hooks", "auto-format", "pre tool use",
  "post tool use", "session start", "notification hook", "block command",
  "validate tool", "lifecycle event", "PostToolUse", "PreToolUse"

  DO NOT USE FOR: creating skills - use `skill-authoring`;
  creating agents - use `agent-authoring`; webhook endpoints - different concept
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Hook Authoring — Official Best Practices

## What Hooks Do

Hooks are deterministic shell commands (or LLM prompts) that execute at specific lifecycle points. They provide guaranteed behavior — not relying on the LLM to choose to run them.

## Configuration Locations

| Location | Scope | Shareable |
|----------|-------|-----------|
| `~/.claude/settings.json` | All projects | No |
| `.claude/settings.json` | Single project | Yes (commit) |
| `.claude/settings.local.json` | Single project | No (gitignored) |
| Agent/skill frontmatter | While component active | Yes |
| Plugin `hooks/hooks.json` | When plugin enabled | Yes |

## Hook Types

| Type | How it works | Use when |
|------|-------------|----------|
| `command` | Runs shell command, reads stdin JSON, uses exit codes | Deterministic validation, formatting, logging |
| `prompt` | Single-turn LLM call, returns `{ok, reason}` | Judgment-based decisions without tool access |
| `agent` | Multi-turn subagent with tool access | Verification requiring file reads or commands |
| `http` | POSTs event data to URL endpoint | External service integration, audit logging |

## Hook Events

See [quick-ref/events-reference.md](quick-ref/events-reference.md) for full input/output schemas.

| Event | Matcher input | Can block? | Common use |
|-------|--------------|------------|------------|
| `SessionStart` | startup/resume/clear/compact | No | Re-inject context after compaction |
| `UserPromptSubmit` | (none) | Yes | Validate/transform user input |
| `PreToolUse` | Tool name | Yes | Block commands, validate operations |
| `PermissionRequest` | Tool name | Yes | Auto-allow/deny permissions |
| `PostToolUse` | Tool name | No* | Auto-format files, logging |
| `PostToolUseFailure` | Tool name | No | Error handling |
| `Notification` | Notification type | No | Desktop alerts |
| `SubagentStart` | Agent type | No | Setup before agent runs |
| `SubagentStop` | Agent type | No | Cleanup after agent |
| `Stop` | (none) | Yes | Verify completeness |
| `ConfigChange` | Config source | Yes | Audit, block unauthorized changes |
| `PreCompact` | manual/auto | No | Save context before compaction |
| `SessionEnd` | Exit reason | No | Cleanup |

*PostToolUse `Stop` hooks can return `{"decision": "block"}` to keep Claude working.

## Configuration Format

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

## Input/Output Protocol

### Input (stdin JSON)
Every hook receives JSON on stdin with common fields + event-specific data:
```json
{
  "session_id": "abc123",
  "cwd": "/path/to/project",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" }
}
```

### Output (exit codes)
| Exit code | Effect |
|-----------|--------|
| `0` | Allow — action proceeds. Stdout added to context (SessionStart, UserPromptSubmit) |
| `2` | Block — action cancelled. Stderr sent to Claude as feedback |
| Other | Allow — stderr logged (visible in verbose mode Ctrl+O) |

### Structured JSON output (exit 0 + JSON on stdout)
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Use rg instead of grep"
  }
}
```

PreToolUse decisions: `"allow"`, `"deny"`, `"ask"`.

## Common Patterns

### Auto-format after edits
```json
{
  "PostToolUse": [{
    "matcher": "Edit|Write",
    "hooks": [{ "type": "command", "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write" }]
  }]
}
```

### Block protected files
```bash
#!/bin/bash
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
for pattern in ".env" "package-lock.json" ".git/"; do
  if [[ "$FILE" == *"$pattern"* ]]; then
    echo "Blocked: matches protected pattern '$pattern'" >&2
    exit 2
  fi
done
exit 0
```

### Re-inject context after compaction
```json
{
  "SessionStart": [{
    "matcher": "compact",
    "hooks": [{ "type": "command", "command": "echo 'Reminder: use Bun, not npm. Run tests before commits.'" }]
  }]
}
```

### Notification on idle
```json
{
  "Notification": [{
    "matcher": "",
    "hooks": [{ "type": "command", "command": "osascript -e 'display notification \"Claude needs attention\" with title \"Claude Code\"'" }]
  }]
}
```

## Stop Hook Infinite Loop Prevention

Always check `stop_hook_active` to avoid loops:
```bash
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0  # Let Claude stop
fi
# ... your logic
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Shell profile `echo` breaks JSON | Wrap in `if [[ $- == *i* ]]` |
| Stop hook without loop guard | Check `stop_hook_active` field |
| Using PostToolUse to undo actions | Too late — use PreToolUse to block instead |
| Relying on PermissionRequest in headless mode | Doesn't fire in `-p` mode. Use PreToolUse |

## Checklist

- [ ] Correct event chosen for the use case
- [ ] Matcher pattern tested (case-sensitive, regex)
- [ ] Script is executable (`chmod +x`)
- [ ] Uses `jq` for JSON parsing (or Python/Node)
- [ ] Exit code 2 for blocking, 0 for allowing
- [ ] Stop hooks check `stop_hook_active`
- [ ] Tested with sample JSON piped to stdin
- [ ] Hook script uses absolute paths or `$CLAUDE_PROJECT_DIR`

## Reference
- [All events with input/output schemas](quick-ref/events-reference.md)
- [Hook types comparison](quick-ref/hook-types.md)
