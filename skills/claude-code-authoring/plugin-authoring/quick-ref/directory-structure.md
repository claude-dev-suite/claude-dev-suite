# Plugin Directory Structure

## Complete Layout

```
my-plugin/
├── .claude-plugin/          # ONLY plugin.json goes here
│   └── plugin.json          # Manifest (name, description, version)
│
├── skills/                  # Agent Skills (SKILL.md per folder)
│   ├── code-review/
│   │   ├── SKILL.md         # Skill instructions
│   │   └── examples.md      # Optional bundled reference
│   └── deploy/
│       └── SKILL.md
│
├── commands/                # Simple skills as single .md files
│   └── quick-fix.md         # Becomes /my-plugin:quick-fix
│
├── agents/                  # Custom subagent definitions
│   ├── reviewer.md          # Code reviewer agent
│   └── tester.md            # Testing agent
│
├── hooks/
│   └── hooks.json           # Hook configurations (same format as settings.json hooks)
│
├── .mcp.json                # MCP server configurations
│
├── .lsp.json                # LSP server configurations
│
├── settings.json            # Default settings (only "agent" key)
│
└── README.md                # Documentation for users
```

## Critical Rules

1. **Only `plugin.json` inside `.claude-plugin/`**
   - skills/, agents/, hooks/, commands/ must be at plugin ROOT
   - Common mistake: putting components inside `.claude-plugin/`

2. **Skills use folder structure**
   - Each skill is a folder with `SKILL.md` inside
   - Folder name becomes the skill name (namespaced)

3. **Commands are single files**
   - Each `.md` file in `commands/` becomes a command
   - File name (without .md) becomes the command name

4. **Agents are .md files**
   - Same format as `.claude/agents/` files
   - YAML frontmatter + markdown body

## Namespacing

All skills are prefixed with the plugin name from `plugin.json`:

| Plugin name | Skill folder | Invocation |
|-------------|-------------|------------|
| `my-plugin` | `skills/review/` | `/my-plugin:review` |
| `my-plugin` | `commands/fix.md` | `/my-plugin:fix` |

Agents and hooks are NOT namespaced — they use their `name` field directly.

## MCP Servers in Plugins

Two ways to define:

### Option 1: .mcp.json at plugin root
```json
{
  "my-server": {
    "command": "${CLAUDE_PLUGIN_ROOT}/servers/my-server",
    "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"],
    "env": { "API_KEY": "${API_KEY}" }
  }
}
```

### Option 2: Inline in plugin.json
```json
{
  "name": "my-plugin",
  "mcpServers": {
    "my-server": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/my-server"
    }
  }
}
```

Use `${CLAUDE_PLUGIN_ROOT}` for plugin-relative paths.

## settings.json

Currently only supports the `agent` key to set a default active agent:

```json
{
  "agent": "reviewer"
}
```

This activates the `reviewer` agent from `agents/reviewer.md` as the main thread.

## Testing

```bash
# Load plugin locally
claude --plugin-dir ./my-plugin

# Verify
/help                    # Skills listed under namespace
/agents                  # Agents visible
/mcp                     # MCP servers running

# Multiple plugins
claude --plugin-dir ./plugin-one --plugin-dir ./plugin-two
```

Changes require Claude Code restart to take effect.
