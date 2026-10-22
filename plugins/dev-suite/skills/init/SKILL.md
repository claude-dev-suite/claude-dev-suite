---
name: init
description: Detect this project's stack and install the matching Dev-Suite agents, skills, MCP servers and rules for Claude Code and the other assistants the project uses. Shows the plan and asks before writing anything.
argument-hint: "[--targets claude-code,cursor] [--agents a,b] [--mcp a,b|none] [--rules a,b|none]"
disable-model-invocation: true
allowed-tools: Bash(npx -y @claude-dev-suite/cli@latest init:*)
# Plugin-only: keeps `npx skills add claude-dev-suite/claude-dev-suite` from installing it as a
# bare `init` skill, which would sit next to Claude Code's built-in /init.
metadata:
  internal: true
---

# Install Dev-Suite into this project

This runs the Dev-Suite installer (`@claude-dev-suite/cli` on npm) against the current project. It needs
Node.js 20 or newer. Extra options the user passed: `$ARGUMENTS`.

## 1. Preview — writes nothing

Run:

```bash
npx -y @claude-dev-suite/cli@latest init . --dry-run $ARGUMENTS
```

Show the user the plan it prints: the detected stack, then the assistants, agents, MCP servers and rules it
would install, and any required environment variables it could not fill in. Do not summarise it away — the
user is deciding on exactly that list.

If the command fails because `npx` or Node.js is missing, say so and stop: point them to
<https://nodejs.org/> or to the desktop app at
<https://github.com/claude-dev-suite/claude-dev-suite#desktop-app-downloads>. Exit code 3 means a bad option
or an unknown id; show the message and ask what they meant.

## 2. Ask

Ask whether to install this, or what to change. Map a change onto the options and preview again:

- other assistants → `--targets claude-code,cursor` (comma-separated)
- a different agent set → `--agents …` (replaces the recommended list; keep the ones they did not object to)
- no MCP servers or no rules → `--mcp none`, `--rules none`

Do not install without an explicit yes.

## 3. Install

With the same options as the approved preview:

```bash
npx -y @claude-dev-suite/cli@latest init . --yes $ARGUMENTS
```

Then tell the user:

- the new agents and skills load in a **new** Claude Code session — restart it, or run `/agents` to check;
- the MCP servers need approving the first time Claude Code sees `.mcp.json`;
- every file it overwrote has a copy under `.dev-suite-backup/`;
- for any variable listed as not set, which MCP server needs it, and that it belongs in their environment or a
  local `.env`, never in a committed file.

Do not edit the generated files to "fix" anything afterwards: re-run this with different options instead.
