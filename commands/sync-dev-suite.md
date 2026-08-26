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

The script runs nine steps (`[n/9]` in its output):

0. **Pre-flight health check** - Verifies the dev-suite checkout and project layout
1. **Git update** - **Discards local changes in the dev-suite checkout with
   `git reset --hard HEAD`**, then fetches and pulls the current branch. Any edit you
   made inside `dev-suite/` is lost. Commit or stash it first.
2. **Analyze dependencies** - Works out which skills the installed agents need
3. **Sync agents** - Overwrites installed agent files that differ from source
4. **Sync skills** - Dependency-aware skill sync
5. **Sync commands** - Overwrites installed slash commands
6. **Sync knowledge bases** - Syncs MCP documentation content
7. **Verify/rebuild MCP servers** - Rebuilds when the source changed
   (7b) **Update `.mcp.json`** - Removes obsolete env placeholders, backing the file up first
8. **Integrity check** - Verifies dependencies resolve
9. **Analyze sibling projects** - Reports on neighbouring projects' CLAUDE.md

## Warning: this overwrites local edits without a backup

Only `.mcp.json` is backed up (to `.mcp.json.backup`, in step 7b). Agents, skills and
commands whose content differs from source are overwritten with a plain copy — **your
local modifications to those files are lost, with no backup and no prompt.**

If you have local edits, use `/reinstall-dev-suite` instead: it is transactional, takes a
full backup, supports `--dry-run`, and lets you keep individual files with `--keep`.

Custom agents (ones with no counterpart in the dev-suite source) are left alone by both.

## Notes

- The full script is in `dev-suite/scripts/sync-dev-suite.sh`
- Always execute the script directly, never interpret it
