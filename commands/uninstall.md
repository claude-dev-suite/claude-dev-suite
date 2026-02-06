---
name: uninstall
description: Alias for /uninstall-dev-suite. Removes dev-suite components preserving user content.
allowed-tools: Bash, Read, Glob, AskUserQuestion
argument-hint: [project-path]
---

# Uninstall Dev-Suite

This is an alias for `/uninstall-dev-suite`.

## Quick Reference

**What gets removed (with manifest):**
- Only files tracked in `.dev-suite-manifest.json`
- Only dev-suite servers from `.mcp.json` (user servers preserved)
- Only dev-suite section from `CLAUDE.md` (user content preserved)
- `.dev-suite.json`, `.dev-suite-manifest.json`, `.kb-cache/`

**What gets removed (without manifest):**
- Only `.dev-suite.json`, `.dev-suite-manifest.json`, `.kb-cache/`
- Dev-suite section from `CLAUDE.md`
- Everything else preserved (can't know what's user content)

## Usage

```bash
# Uninstall from current directory
/uninstall

# Uninstall from specific path
/uninstall ./my-project
```

## Full Documentation

See `/uninstall-dev-suite` for complete documentation and the removal script.
