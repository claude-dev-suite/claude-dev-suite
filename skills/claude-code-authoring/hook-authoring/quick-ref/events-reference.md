# Hook Events — Complete Reference

## Common Input Fields (all events)

```json
{
  "session_id": "abc123",
  "cwd": "/path/to/project",
  "hook_event_name": "PreToolUse"
}
```

## Event Details

### SessionStart
- **Matcher**: `startup`, `resume`, `clear`, `compact`
- **Input**: `{ "source": "startup|resume|clear|compact" }`
- **Output**: stdout text added to Claude's context
- **Use**: Re-inject reminders after compaction

### UserPromptSubmit
- **Matcher**: none (always fires)
- **Input**: `{ "prompt": "user's message text" }`
- **Output**: stdout → `additionalContext` added to Claude's context; exit 2 blocks prompt
- **Use**: Validate/transform user input, inject dynamic context

### PreToolUse
- **Matcher**: Tool name (`Bash`, `Edit|Write`, `mcp__github__.*`)
- **Input**: `{ "tool_name": "Bash", "tool_input": { "command": "npm test" } }`
- **Output**: exit 0 = allow, exit 2 = block (stderr → Claude feedback)
- **JSON output**: `{ "hookSpecificOutput": { "hookEventName": "PreToolUse", "permissionDecision": "allow|deny|ask", "permissionDecisionReason": "..." } }`
- **Use**: Block dangerous commands, validate file paths, enforce rules

### PermissionRequest
- **Matcher**: Tool name
- **Input**: `{ "tool_name": "Bash", "tool_input": {...} }`
- **Output**: JSON `{ "hookSpecificOutput": { "decision": { "behavior": "allow|deny|ask" } } }`
- **Note**: Does NOT fire in headless/non-interactive mode (`-p`). Use PreToolUse instead.

### PostToolUse
- **Matcher**: Tool name (`Edit|Write`, `Bash`)
- **Input**: `{ "tool_name": "Edit", "tool_input": { "file_path": "..." }, "tool_output": "..." }`
- **Output**: Cannot undo. stdout text added to Claude's context
- **Use**: Auto-format files, logging, notifications

### PostToolUseFailure
- **Matcher**: Tool name
- **Input**: Same as PostToolUse but `tool_output` contains error
- **Use**: Error tracking, retry logic

### Notification
- **Matcher**: `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`
- **Input**: `{ "type": "idle_prompt", "message": "..." }`
- **Use**: Desktop notifications, Slack alerts

### SubagentStart / SubagentStop
- **Matcher**: Agent type name (`Explore`, `Plan`, custom agent names)
- **Input**: `{ "agent_type": "code-reviewer" }`
- **Use**: Setup/cleanup around agent execution

### Stop
- **Matcher**: none (always fires)
- **Input**: `{ "stop_hook_active": false, "stop_reason": "end_turn" }`
- **Output**: JSON `{ "decision": "block", "reason": "Tests not passing yet" }` to keep Claude working
- **CRITICAL**: Always check `stop_hook_active` to prevent infinite loops

### ConfigChange
- **Matcher**: `user_settings`, `project_settings`, `local_settings`, `policy_settings`, `skills`
- **Input**: `{ "source": "project_settings", "file_path": ".claude/settings.json" }`
- **Output**: `{ "decision": "block" }` to reject the change
- **Use**: Audit logging, block unauthorized config changes

### PreCompact
- **Matcher**: `manual`, `auto`
- **Input**: `{ "trigger": "auto" }`
- **Use**: Save important context before compaction

### SessionEnd
- **Matcher**: `clear`, `logout`, `prompt_input_exit`, `other`
- **Use**: Cleanup temporary files, save state

### WorktreeCreate / WorktreeRemove
- **Matcher**: none
- **Use**: Custom worktree setup/teardown

### TaskCompleted
- **Matcher**: none
- **Use**: Notifications, post-task cleanup

### TeammateIdle
- **Matcher**: none
- **Use**: Agent team coordination

### InstructionsLoaded
- **Matcher**: none
- **Input**: `{ "file_path": ".claude/rules/security.md" }`
- **Use**: Track which instructions are active

## Exit Code Summary

| Code | Effect | stderr |
|------|--------|--------|
| 0 | Allow. stdout may be used (event-dependent) | Ignored |
| 2 | Block. Action cancelled | Sent to Claude as feedback |
| Other | Allow. Treated as non-fatal error | Logged (visible in verbose mode) |
