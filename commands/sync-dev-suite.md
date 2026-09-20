---
name: sync-dev-suite
description: Deprecated alias for /reinstall-dev-suite. Updates installed components from the current dev-suite source.
allowed-tools: Bash
---

# /sync-dev-suite - Update installed components

**Deprecated.** Use `/reinstall-dev-suite`. This command now runs the same transactional
reinstall, because the shell script it used to call is not safe on a current installation.

## Why the old script is not used

`scripts/sync-dev-suite.sh` predates the multi-assistant work and only knows
`.claude/agents`, `.claude/skills`, `.claude/commands`, `.mcp-servers/` and `.mcp.json`.
It never touches `.cursor/`, `.vscode/`, `.github/`, `.gemini/`, `.codex/`, `.clinerules/`,
`.kimi-code/`, `.agents/skills` or `AGENTS.md`, and it **never updates
`.dev-suite-manifest.json`**.

Two consequences, both silent:

- On a Cursor-, Gemini- or Codex-only project it does almost nothing while reporting success.
- On any project it leaves the manifest hashes stale, so the next Sync or drift check
  reports the entire installation as locally modified.

It also runs `git reset --hard HEAD` inside the dev-suite checkout, discarding any local
edit there without a backup.

`reinstall.service.ts` does the same job correctly: it is target-aware, transactional,
takes a backup, rolls back on failure, removes orphans and rewrites the manifest.

## Use this instead

Preview first — this always prints the plan without writing anything:

```bash
cd ./dev-suite/configurator/dashboard/server
npm run reinstall -- --project "$OLDPWD" --dry-run
```

Then apply:

```bash
cd ./dev-suite/configurator/dashboard/server
npm run reinstall -- --project "$OLDPWD"
```

See `/reinstall-dev-suite` for `--keep`, `--drift`, `--promote`, `--no-backup` and the
exit codes. The dashboard's **Updates → Reinstall / Sync** tab is the same operation.

## If you need the old script anyway

It is still on disk at `scripts/sync-dev-suite.sh` and still carries its own warnings.
Only reach for it on a Claude-Code-only project, and expect to repair the manifest
afterwards with a `--dry-run` reinstall to see what it left inconsistent.
