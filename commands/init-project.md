---
name: init-project
description: Launch the dev-suite dashboard to configure a project for one or more AI coding assistants.
allowed-tools: Bash
argument-hint: "[project-path]"
---

# /init-project - Configure a project

Launches the dev-suite dashboard, which detects the project's stack and installs the
agents, skills, MCP servers and rules it needs — for whichever assistants you select.

## Usage

Run from the **dev-suite checkout**, pointing at the project you want to configure:

```bash
./init-project.sh /path/to/your-project
```

```powershell
.\init-project.ps1 C:\path\to\your-project
```

Omit the path to configure the current directory. The dashboard opens in your browser on
`http://localhost:3456`; if that port is taken both launchers scan upward until they find
a free one and print the URL they actually used.

> First run on a fresh clone installs dependencies and builds the MCP bundles and the
> dashboard. Budget a few minutes — it does not happen again.

There is also a pre-built desktop app (Windows / macOS / Linux) that skips the clone and
the build entirely. See **Desktop App Downloads** in the repository README.

## The wizard

Seven steps, defined in `configurator/dashboard/src/components/wizard/steps.ts`:

| # | Step | What it does |
|---|------|--------------|
| 1 | **Detection** | Scans the project for frameworks, languages, databases and Git provider; also detects which assistants the project already uses |
| 2 | **Agents** | Pick the specialized agents. Pre-selected from detection |
| 3 | **MCP Servers** | Pick the servers. Always optional — every agent works without them |
| 4 | **Environment** | Values the selected servers need. Anything credential-shaped is stored as a reference, never written literally into committed config |
| 5 | **Rules** | Project guidelines, installed as path-scoped rule files per assistant |
| 6 | **Assistants** | Which targets to write for: Claude Code, GitHub Copilot, Cursor, Gemini CLI, Codex CLI, Cline, Kimi Code. Several can coexist in one project |
| 7 | **Install** | Writes everything, after backing up anything it would overwrite |

Before step 1 there is a mode choice: configure an existing project, or scaffold a new one
from a template.

## What gets written

Always, whichever assistants you selected:

```
your-project/
├── AGENTS.md                  # Generated routing section (cross-assistant standard)
├── .dev-suite.json            # What is installed
├── .dev-suite-manifest.json   # Every written file, with hash and target
├── .claude/agents/            # Agent definitions (read directly by several assistants)
├── .claude/skills/            # Installed skills
└── .mcp-servers/              # Local MCP server bundles
```

Then, per selected assistant:

| Target | Files |
|--------|-------|
| `claude-code` | `CLAUDE.md`, `.mcp.json`, `.claude/rules/`, `.claude/commands/`, `.claude/settings.json` |
| `copilot` | `.vscode/mcp.json`, `.github/mcp.json`, `.github/instructions/` |
| `cursor` | `.cursor/mcp.json`, `.cursor/rules/` |
| `gemini` | `.gemini/settings.json`, `.gemini/agents/`, `.agents/skills/` |
| `codex` | `.codex/config.toml`, `.agents/skills/` |
| `cline` | `.clinerules/` |
| `kimi-code` | `.kimi-code/mcp.json`, `.kimi-code/agents/`, `.agents/skills/` |

`CLAUDE.md` and `.mcp.json` are written **only** if Claude Code is among the targets.
Routing lives in `AGENTS.md`; `CLAUDE.md` is a pointer that imports it with `@AGENTS.md`,
because Claude Code does not read `AGENTS.md` natively. Slash commands are Claude-Code-only.

Everything written is **committable**: no machine-specific absolute paths, no secret
literals. A teammate clones the repo and has the same setup.

## MCP servers

The catalog is the set of npm workspaces in `mcp-servers/package.json`, and each server's
`metadata.json` declares its tools, environment variables and the technologies that
suggest it. The wizard lists them from that source — it is not a fixed list, so run the
wizard to see what is currently available rather than trusting a table in a document.

## Troubleshooting

**The dashboard does not open** — Node.js 20 or newer is required; both launchers check and
say so. Open the URL printed by the launcher manually; it is not always 3456.

**MCP servers do not start in the assistant** — check that each server has a bundle:

```bash
ls mcp-servers/*/dist/index.js
```

If any are missing, `./init-project.sh` rebuilds them on the next run, or run
`./scripts/health-check.sh` for a full diagnosis of the checkout.

**Nothing was written for an assistant you selected** — some targets cannot express some
features; the installer reports every such gap at the end of the install rather than
failing. Re-read that summary.
