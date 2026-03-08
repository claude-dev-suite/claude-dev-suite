---
name: agent-authoring
description: |
  Creates and configures Claude Code subagents (custom agents). Covers frontmatter
  fields, tool restrictions, model selection, hooks, memory, skills preloading,
  and common patterns. Follows official Anthropic best practices.

  USE WHEN: user mentions "create agent", "subagent", "custom agent", ".claude/agents",
  "agent file", "delegate task", "isolated context", "agent memory", "agent hooks"

  DO NOT USE FOR: creating skills - use `skill-authoring`;
  creating hooks standalone - use `hook-authoring`;
  creating MCP servers - use `mcp-authoring`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Agent/Subagent Authoring — Official Best Practices

## File Structure

Agents are Markdown files with YAML frontmatter. The body becomes the system prompt.

```
.claude/agents/my-agent.md     # Project-scoped (commit to VCS)
~/.claude/agents/my-agent.md   # User-scoped (all projects)
```

## YAML Frontmatter — All Fields

See [quick-ref/frontmatter-reference.md](quick-ref/frontmatter-reference.md) for detailed field docs.

```yaml
---
name: code-reviewer                # Required. Lowercase + hyphens
description: |                     # Required. When Claude should delegate
  Expert code review specialist. Use proactively after code changes.
tools: Read, Grep, Glob, Bash     # Allowlist (inherits all if omitted)
disallowedTools: Write, Edit       # Denylist (removed from inherited/allowed)
model: sonnet                      # sonnet | opus | haiku | inherit (default)
permissionMode: default            # default | acceptEdits | dontAsk | bypassPermissions | plan
maxTurns: 50                       # Max agentic turns before stopping
skills:                            # Skills preloaded into context at startup
  - api-conventions
  - error-handling
mcpServers:                        # MCP servers available to this agent
  - slack                          # Reference existing server by name
memory: user                       # user | project | local — persistent memory
background: false                  # true = always run as background task
isolation: worktree                # Run in temporary git worktree
hooks:                             # Lifecycle hooks (scoped to this agent)
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate.sh"
---
```

## System Prompt (Body)

The markdown body IS the system prompt. Subagents receive ONLY this + basic env details (cwd, etc.), NOT the full Claude Code system prompt.

**Effective prompt structure:**
```markdown
You are a [role] specializing in [domain].

When invoked:
1. [First action]
2. [Second action]
3. [Third action]

[Domain-specific checklist or criteria]

Provide feedback organized by:
- Critical issues (must fix)
- Warnings (should fix)
- Suggestions (consider)

Include specific examples of how to fix issues.
```

## Description — Critical for Delegation

Claude delegates based on the description. Include "Use proactively" to encourage automatic delegation.

**Good:** `"Expert code review specialist. Use proactively after code changes."`
**Bad:** `"Reviews code"` — too vague, Claude won't know when to delegate.

## Key Design Decisions

### When to use agents vs skills vs main conversation

| Use Case | Mechanism |
|----------|-----------|
| Verbose output you don't need in main context | Agent |
| Enforce tool restrictions | Agent |
| Self-contained work returning a summary | Agent |
| Reusable knowledge/instructions inline | Skill |
| Frequent back-and-forth needed | Main conversation |
| Quick, targeted changes | Main conversation |

### Model selection

| Model | Use for |
|-------|---------|
| `haiku` | Fast exploration, simple search, low-cost |
| `sonnet` | Balanced — code review, analysis, most tasks |
| `opus` | Complex reasoning, architecture decisions |
| `inherit` | Same as main conversation (default) |

### Tool restrictions

- Read-only agent: `tools: Read, Grep, Glob, Bash`
- Full capabilities: omit `tools` (inherits all)
- Block specific tools: `disallowedTools: Write, Edit`
- Restrict spawning: `tools: Agent(worker, researcher), Read`

## Common Patterns

See [quick-ref/patterns.md](quick-ref/patterns.md) for detailed examples.

**Code reviewer** — Read-only, focused on quality
**Debugger** — Can edit, diagnosis-to-fix workflow
**Domain expert** — Specialized knowledge (data science, security)
**Parallel research** — Multiple agents exploring independently
**Chain** — Sequential agents, each building on previous results

## Memory

When `memory` is set, the agent gets a persistent directory across sessions.

| Scope | Location | Use when |
|-------|----------|----------|
| `user` | `~/.claude/agent-memory/<name>/` | Learnings across all projects |
| `project` | `.claude/agent-memory/<name>/` | Project-specific, shareable via VCS |
| `local` | `.claude/agent-memory-local/<name>/` | Project-specific, not committed |

The agent automatically gets Read/Write/Edit tools + instructions for managing MEMORY.md.

**Tip:** Include in prompt: "Update your agent memory as you discover patterns, codepaths, and architectural decisions."

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Too many responsibilities | One agent, one job. Create separate agents for different tasks |
| No description or vague description | Detailed description with "use proactively" |
| Overly permissive tools | Grant only what's needed |
| Expecting subagents to spawn subagents | Not supported. Use chains from main conversation |
| Forgetting subagents lose parent context | They start fresh. Preload skills or provide full instructions |

## Checklist

- [ ] `name` and `description` set (both required)
- [ ] Description explains WHEN to delegate, not just what
- [ ] Tools restricted to minimum necessary
- [ ] Model chosen based on task complexity
- [ ] System prompt has clear workflow steps
- [ ] Tested with real scenarios
- [ ] Committed to `.claude/agents/` (project) or `~/.claude/agents/` (user)

## Reference
- [All frontmatter fields](quick-ref/frontmatter-reference.md)
- [Common agent patterns](quick-ref/patterns.md)
