---
name: sync-dev-suite
description: Synchronize dev-suite components (agents, skills, MCP servers, commands)
allowed-tools: Bash
---

# Sync Dev-Suite

This command synchronizes all dev-suite components with the latest version.

## IMPORTANT: Execute Script Directly

**DO NOT interpret or summarize this command.** Execute the bash script directly:

```bash
bash ./dev-suite/scripts/sync-dev-suite.sh
```

**Note:** Always run from project root (the parent directory of `dev-suite`).

## Quick Execution

Run this exact command (from project root):

```bash
bash ./dev-suite/scripts/sync-dev-suite.sh
```

## What It Does

1. **Git Update** - Pulls latest changes from dev-suite repo
2. **Agents Sync** - Updates agent files
3. **Skills Sync** - Syncs skills referenced by agents
4. **Commands Sync** - Updates slash commands
5. **Knowledge Base Sync** - Syncs MCP documentation
6. **MCP Servers** - Rebuilds if source changed
7. **Config Cleanup** - Removes obsolete env placeholders from .mcp.json
8. **Integrity Check** - Verifies all dependencies

## Notes

- The full script is in `dev-suite/scripts/sync-dev-suite.sh`
- Always execute the script directly, never interpret it
- Custom agents are preserved
- Creates backups before modifying files
