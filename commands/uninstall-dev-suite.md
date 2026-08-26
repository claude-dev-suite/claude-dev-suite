---
name: uninstall-dev-suite
description: Remove dev-suite components from a project. Only removes tracked components, preserves user content.
allowed-tools: Bash
---

# Uninstall Dev-Suite

Removes everything dev-suite installed into this project, using the installation
manifest as the record of what it wrote. Anything you authored yourself is left alone.

## Preview first

```bash
cd ./dev-suite/configurator/dashboard/server && npm run uninstall -- --project "$OLDPWD" --dry-run
```

This lists every tracked file and rule file that would be removed, and exits without
touching anything.

## Then remove

```bash
cd ./dev-suite/configurator/dashboard/server && npm run uninstall -- --project "$OLDPWD"
```

Add `--json` to either command for machine-readable output.

If the server has never been built, run `npm install && npm run build` in that directory
first — the launcher (`init-project.sh`) does this for you on its first run.

## What is removed

- Every file recorded in `.dev-suite-manifest.json` (`files[]`), which covers the
  installed agents, skills, MCP config, generated instructions and slash commands
- Path-scoped rule files tracked in `installedRuleFiles[]` — rules you wrote yourself
  in the same directory are kept
- `.mcp-servers/` and `.kb-cache/`, which dev-suite owns outright
- Inside `.claude/agents`, `.claude/skills` and `.agents/skills`: only what dev-suite
  itself put there. Those directories are walked file by file, not deleted wholesale.

## What is preserved

Files dev-suite *merged into* are un-merged, never deleted: its own entries come out
and everything else stays. The file is removed only when nothing of yours was left in it.

- Your prose in `AGENTS.md` and `CLAUDE.md` — only the marked dev-suite section goes
- Your own MCP servers in `.mcp.json`, `.vscode/mcp.json`, `.github/mcp.json`,
  `.cursor/mcp.json`, `.kimi-code/mcp.json` and `.gemini/settings.json`
- Everything else in `.codex/config.toml` — your model, your `[tui]` block, your comments
- `permissions` and the rest of `.claude/settings.json`
- `.claude/agents/custom/` and `.claude/skills/custom/`
- Skills you or another tool authored in `.claude/skills` or `.agents/skills` — dev-suite
  removes only the folders carrying its own ownership marker
- Your own `.claude/commands/*.md` and `.claude/rules/*.md`

## Requirements

A readable `.dev-suite-manifest.json` in the project root. Without it there is no record
of what was installed, and the command exits with an error rather than guessing.
