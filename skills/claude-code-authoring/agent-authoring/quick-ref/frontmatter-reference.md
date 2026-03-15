# Agent Frontmatter — Complete Reference

## All Supported Fields

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `name` | Yes | string | — | Unique ID, lowercase + hyphens |
| `description` | Yes | string | — | When Claude should delegate to this agent |
| `tools` | No | string (CSV) | Inherit all | Allowlist of tools |
| `disallowedTools` | No | string (CSV) | None | Tools to remove from inherited/allowed list |
| `model` | No | string | `inherit` | `sonnet`, `opus`, `haiku`, or `inherit` |
| `permissionMode` | No | string | `default` | Permission handling mode |
| `maxTurns` | No | number | — | Max agentic turns before stopping |
| `skills` | No | list | — | Skills to preload into context at startup |
| `mcpServers` | No | list | — | MCP servers available to this agent |
| `hooks` | No | object | — | Lifecycle hooks scoped to this agent |
| `memory` | No | string | — | `user`, `project`, or `local` |
| `background` | No | boolean | `false` | Always run as background task |
| `isolation` | No | string | — | `worktree` for git worktree isolation |

## tools

Comma-separated list of tool names. If omitted, inherits all tools.

```yaml
# Read-only
tools: Read, Grep, Glob, Bash

# Full access (default when omitted)
tools: Read, Grep, Glob, Write, Edit, Bash

# Restrict which agents can be spawned
tools: Agent(worker, researcher), Read, Bash

# Allow any agent spawning
tools: Agent, Read, Bash
```

Available tools: `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `Agent`, `WebFetch`, `WebSearch`, `Skill`, `AskUserQuestion`, `NotebookEdit`, plus any `mcp__*` tools.

## disallowedTools

Remove specific tools from the inherited or allowed set:

```yaml
tools: Read, Grep, Glob, Bash, Write, Edit
disallowedTools: Write, Edit  # Makes it read-only even though Write/Edit listed
```

## model

| Value | Use for | Cost |
|-------|---------|------|
| `haiku` | Fast search, simple tasks | Lowest |
| `sonnet` | Balanced — code review, analysis | Medium |
| `opus` | Complex reasoning, architecture | Highest |
| `inherit` | Same as main conversation | Varies |

## permissionMode

| Mode | Behavior |
|------|----------|
| `default` | Standard permission checking with prompts |
| `acceptEdits` | Auto-accept file edits |
| `dontAsk` | Auto-deny all permission prompts |
| `bypassPermissions` | Skip ALL permission checks (use with caution) |
| `plan` | Read-only exploration mode |

If parent uses `bypassPermissions`, it takes precedence and cannot be overridden.

## skills

Full skill content is injected at startup (not just made available).

```yaml
skills:
  - api-conventions      # Loads .claude/skills/api-conventions/SKILL.md
  - error-handling       # Loads full content, not just description
```

Subagents do NOT inherit skills from parent — you must list them explicitly.

## mcpServers

Reference existing servers or define inline:

```yaml
# Reference by name
mcpServers:
  - slack
  - github

# Inline definition
mcpServers:
  my-db:
    command: "npx"
    args: ["-y", "@bytebase/dbhub", "--dsn", "postgresql://..."]
```

## hooks

Scoped to this agent's lifetime. Cleaned up when agent finishes.

```yaml
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate-command.sh"
  PostToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: "./scripts/run-linter.sh"
```

`Stop` hooks in frontmatter are auto-converted to `SubagentStop`.

## memory

Persistent directory that survives across conversations.

```yaml
memory: user     # ~/.claude/agent-memory/<name>/
memory: project  # .claude/agent-memory/<name>/ (committable)
memory: local    # .claude/agent-memory-local/<name>/ (gitignored)
```

When enabled: Read/Write/Edit tools auto-added, MEMORY.md first 200 lines loaded into context.

## CLI-Defined Agents

Pass as JSON with `--agents` flag (session-only, not saved):

```bash
claude --agents '{
  "reviewer": {
    "description": "Code reviewer",
    "prompt": "You are a senior code reviewer...",
    "tools": ["Read", "Grep", "Glob"],
    "model": "sonnet"
  }
}'
```

Use `prompt` field for the system prompt (equivalent to markdown body).
