# @claude-dev-suite/cli

Point it at a repo and it configures your AI coding assistant for that stack: specialized agents, framework
skills, MCP servers and path-scoped rules, written in each assistant's own format — Claude Code, GitHub Copilot,
Cursor, Gemini CLI, Codex CLI, Cline and Kimi Code.

```bash
npx @claude-dev-suite/cli init            # the current directory
npx @claude-dev-suite/cli init ./my-app --dry-run
```

It reads the project's manifests (`package.json` and its workspaces, `pom.xml`, `pyproject.toml`, `go.mod`, …),
shows what it would install, and asks before writing anything. It is the same installer as the
[Dev-Suite desktop app](https://github.com/claude-dev-suite/claude-dev-suite#desktop-app-downloads), without the
window: use the app to pick components one by one, this to get the recommended set in one command, in CI, in a
container or over SSH.

## What it writes

- `AGENTS.md` with the routing section, and `CLAUDE.md` importing it when Claude Code is a target
- agents and skills under `.claude/`, mirrored to `.agents/skills/` for the assistants that read that
- each assistant's MCP config (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.codex/config.toml`, …),
  with project-relative paths and secrets as `${VAR}` references, never literals — the files are meant to be
  committed
- the MCP servers themselves, prebuilt, under `.mcp-servers/` — they need Node.js and nothing else
- `.dev-suite.json` and `.dev-suite-manifest.json`, which record the selection and every file written

Every file it would overwrite is copied to `.dev-suite-backup/` first, and a failed install restores them.

## Options

| Option | |
|--------|---|
| `-y`, `--yes` | Install without asking. Required when there is no terminal (CI). |
| `--dry-run` | Print the plan; write nothing. |
| `--json` | Machine-readable output on stdout. |
| `--targets a,b` | Assistants to configure. Default: the ones the project already uses, or Claude Code. |
| `--agents a,b` | Agents instead of the recommended ones. |
| `--mcp a,b` | MCP servers instead of the recommended ones; `none` for none. |
| `--rules a,b` | Rule templates instead of the recommended ones; `none` for none. |
| `--no-backup` | Skip the pre-install snapshot. |

Exit codes: `0` installed, previewed or declined; `1` the install failed (and was rolled back); `3` usage error.

## Requirements

Node.js 20 or newer.

## License

MIT
