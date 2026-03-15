# plugin.json Manifest — Complete Schema

## Location

`.claude-plugin/plugin.json` inside the plugin root directory.

## All Fields

```json
{
  "name": "my-plugin",
  "description": "A code quality plugin with review skills and formatting hooks",
  "version": "1.0.0",
  "author": {
    "name": "Your Name",
    "email": "you@example.com",
    "url": "https://yoursite.com"
  },
  "homepage": "https://github.com/user/my-plugin",
  "repository": "https://github.com/user/my-plugin",
  "license": "MIT",
  "mcpServers": {
    "plugin-api": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/api-server",
      "args": ["--port", "8080"]
    }
  }
}
```

## Field Reference

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | Yes | string | Unique identifier and skill namespace prefix |
| `description` | Yes | string | Shown in plugin manager |
| `version` | Recommended | string | Semantic versioning (MAJOR.MINOR.PATCH) |
| `author` | No | object | Attribution info |
| `author.name` | No | string | Author name |
| `author.email` | No | string | Author email |
| `author.url` | No | string | Author website |
| `homepage` | No | string | Plugin homepage URL |
| `repository` | No | string | Git repository URL |
| `license` | No | string | SPDX license identifier |
| `mcpServers` | No | object | Inline MCP server definitions |

## name Field

- Becomes the skill namespace: `/my-plugin:hello`
- Must be unique across installed plugins
- Use lowercase with hyphens

## version Field

Follow semantic versioning:
- **MAJOR**: Breaking changes (skills renamed, removed features)
- **MINOR**: New features (added skills, new agents)
- **PATCH**: Bug fixes, docs updates

## mcpServers (inline)

Alternative to `.mcp.json` at plugin root. Use `${CLAUDE_PLUGIN_ROOT}` for relative paths:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "${CLAUDE_PLUGIN_ROOT}/bin/server",
      "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"],
      "env": {
        "DB_URL": "${DB_URL}"
      }
    }
  }
}
```

## Minimal Valid Manifest

```json
{
  "name": "my-plugin",
  "description": "Does X, Y, and Z"
}
```
