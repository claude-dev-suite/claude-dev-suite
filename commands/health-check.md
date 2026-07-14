---
name: health-check
description: Run health checks on dev-suite installation
allowed-tools: Bash
argument-hint: "[--quick] [--verbose]"
---

# Health Check

This command performs sanity checks on the dev-suite installation to verify everything is working correctly.

## IMPORTANT: Execute Script Directly

**DO NOT interpret or summarize this command.** Execute the bash script directly.

## Quick Execution

Run this exact command:

```bash
# Determine dev-suite location and run health check
if [ -d "./dev-suite" ]; then
    bash ./dev-suite/scripts/health-check.sh "$@"
elif [ -d "../dev-suite" ]; then
    bash ../dev-suite/scripts/health-check.sh "$@"
elif [ -d "$(dirname "$(pwd)")/dev-suite" ]; then
    bash "$(dirname "$(pwd)")/dev-suite/scripts/health-check.sh" "$@"
else
    echo "Error: dev-suite not found"
    exit 1
fi
```

## Arguments

- `--quick` - Skip MCP server startup tests (faster)
- `--verbose` - Show detailed output

## What It Checks

1. **Node.js & npm versions** - Verifies Node.js >= 18 and npm >= 7 (required for workspaces)
2. **Dev-suite structure** - Checks essential directories and files exist
3. **npm workspaces** - Verifies workspace configuration and dependencies
4. **MCP server builds** - Checks all servers are built (dist/index.js exists)
5. **MCP server startup** - Tests that servers can start without crashing
6. **Knowledge base** - Verifies documentation files are present

## Exit Codes

- `0` - All checks passed
- `1` - Critical errors (dev-suite won't work)
- `2` - Warnings (dev-suite may have issues)

## Example Output

```
╔══════════════════════════════════════════════════════════════╗
║            Dev-Suite Health Check                            ║
╚══════════════════════════════════════════════════════════════╝

[1/6] Checking Node.js & npm...
  ✓ Node.js v20.10.0 (>= 18 required)
  ✓ npm v10.2.3 (>= 7 required for workspaces)

[2/6] Checking dev-suite structure...
  ✓ mcp-servers/ directory exists
  ✓ agents/ directory exists
  ...

Summary
══════════════════════════════════════════════════════════════
  Passed:   15
  Warnings: 0
  Errors:   0

╔════════════════════════════════════════════════════════════╗
║  HEALTH CHECK PASSED - All systems operational             ║
╚════════════════════════════════════════════════════════════╝
```

## When to Use

- After cloning dev-suite for the first time
- After running `npm install` or `npm run build`
- When MCP servers aren't starting
- Before running `/sync-dev-suite`
- When troubleshooting issues
