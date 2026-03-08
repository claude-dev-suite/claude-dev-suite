---
name: plugin-authoring
description: |
  Creates Claude Code plugins that package skills, agents, hooks, and MCP servers
  into distributable bundles. Covers plugin.json manifest, directory structure,
  namespacing, and distribution. Follows official Anthropic best practices.

  USE WHEN: user mentions "create plugin", "plugin", "plugin.json", "distribute skills",
  "share agents", "plugin marketplace", "package extension", ".claude-plugin"

  DO NOT USE FOR: creating standalone skills - use `skill-authoring`;
  creating standalone agents - use `agent-authoring`;
  creating standalone hooks - use `hook-authoring`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Plugin Authoring — Official Best Practices

## What Plugins Do

Plugins bundle skills, agents, hooks, and MCP servers into shareable packages. Skills get namespaced: `/plugin-name:skill-name`.

## Directory Structure

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json          # Manifest (ONLY file inside .claude-plugin/)
├── skills/                  # Agent Skills with SKILL.md
│   └── code-review/
│       └── SKILL.md
├── commands/                # Skills as simple Markdown files
│   └── review.md
├── agents/                  # Custom agent definitions
│   └── reviewer.md
├── hooks/
│   └── hooks.json           # Hook configurations
├── .mcp.json                # MCP server configurations
├── .lsp.json                # LSP server configurations
├── settings.json            # Default settings (only "agent" key supported)
└── README.md                # Documentation
```

**Critical:** skills/, agents/, hooks/ go at plugin root, NOT inside `.claude-plugin/`.

## plugin.json Manifest

See [quick-ref/manifest-schema.md](quick-ref/manifest-schema.md) for the complete schema.

```json
{
  "name": "my-plugin",
  "description": "A code quality plugin with review skills and formatting hooks",
  "version": "1.0.0",
  "author": {
    "name": "Your Name"
  },
  "homepage": "https://github.com/user/my-plugin",
  "repository": "https://github.com/user/my-plugin",
  "license": "MIT"
}
```

- `name`: unique identifier, becomes skill namespace prefix
- `version`: semantic versioning (MAJOR.MINOR.PATCH)
- Only `name` and `description` are required

## Namespacing

Plugin skills are prefixed: `/my-plugin:hello`, `/my-plugin:review`.
This prevents conflicts between plugins with same skill names.

## Plugin Components

### Skills in plugins
Same as standalone skills but in `plugin-root/skills/`. Each needs `SKILL.md` with frontmatter.

### Agents in plugins
Same Markdown format as `.claude/agents/`. Placed in `plugin-root/agents/`.

### Hooks in plugins
Create `hooks/hooks.json` — same format as `hooks` in settings.json:
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{ "type": "command", "command": "jq -r '.tool_input.file_path' | xargs prettier --write" }]
    }]
  }
}
```

### MCP servers in plugins
Configure in `.mcp.json` at plugin root. Use `${CLAUDE_PLUGIN_ROOT}` for relative paths:
```json
{
  "my-server": {
    "command": "${CLAUDE_PLUGIN_ROOT}/servers/my-server",
    "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"],
    "env": { "API_KEY": "${API_KEY}" }
  }
}
```

### Default settings
`settings.json` at plugin root — currently only `agent` key supported:
```json
{ "agent": "security-reviewer" }
```
This activates the named agent as main thread when plugin is enabled.

## Development & Testing

```bash
# Test locally (no install needed)
claude --plugin-dir ./my-plugin

# Multiple plugins
claude --plugin-dir ./plugin-one --plugin-dir ./plugin-two

# Verify components
/help                    # Skills listed under namespace
/agents                  # Agents visible
/mcp                     # MCP servers running
```

Changes require restart to take effect.

## Distribution

1. **Version control** — push to Git repository
2. **Plugin marketplace** — submit via claude.ai/settings/plugins/submit
3. **Team sharing** — configure team marketplace in `.claude/plugins.json`

## When Plugin vs Standalone

| Standalone | Plugin |
|------------|--------|
| Personal workflow | Sharing with team/community |
| Single project | Reusable across projects |
| Quick experiments | Versioned releases |
| Short names (`/hello`) | Namespaced (`/plugin:hello`) |

**Tip:** Start standalone in `.claude/`, convert to plugin when ready to share.

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Components inside `.claude-plugin/` | Only plugin.json goes there; rest at root |
| No description in plugin.json | Required for discovery |
| Hardcoded paths in MCP config | Use `${CLAUDE_PLUGIN_ROOT}` |
| Missing README | Add docs for users installing the plugin |

## Checklist

- [ ] `.claude-plugin/plugin.json` with name, description, version
- [ ] Components at plugin root (not inside .claude-plugin/)
- [ ] Skills have proper SKILL.md with frontmatter
- [ ] MCP configs use `${CLAUDE_PLUGIN_ROOT}` for paths
- [ ] Tested with `--plugin-dir`
- [ ] README.md with installation instructions
- [ ] Semantic versioning

## Reference
- [Full manifest schema](quick-ref/manifest-schema.md)
- [Directory structure details](quick-ref/directory-structure.md)
