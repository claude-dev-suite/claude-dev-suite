---
name: reconfigure
description: Add or remove installed agents, MCP servers and rules through the dashboard's management API.
allowed-tools: Read, Bash
---

# /reconfigure - Change what is installed

Changes an existing dev-suite installation: which agents, MCP servers and rules are
present, and which assistants they are written for.

## Do not hand-edit `.dev-suite.json`

`.dev-suite.json` is **generated output, not an input file.** `installation.service.ts`
rebuilds it from the install request on every install and every Sync, so an edit made by
hand is silently discarded on the next run. The only key the installer deliberately
carries forward is `integrationValidation` (`USER_OWNED_CONFIG_KEYS`).

Editing it directly also bypasses `project-lock.ts`, `write-guard.ts`, `managed-file.ts`
and manifest tracking. The files on disk stop matching `.dev-suite-manifest.json`, and
`drift.service.ts` then reports the whole installation as modified.

What the file actually contains is only this:

```json
{
  "version": "…",
  "installedAt": "…",
  "agents":     { "enabled": ["react-expert", "…"] },
  "mcpServers": { "enabled": ["documentation", "…"] },
  "rules":      { "enabled": ["…"] },
  "targets":    ["claude-code", "cursor"]
}
```

There is no `hooks` key, no `documentation strategy` key, and no stack or path
information. If you are looking for those, they do not exist.

## Preferred route — the dashboard

Launch the dashboard and use the **Manage** tab, which drives the same API and keeps the
manifest, the backup and the lock intact:

```bash
./init-project.sh /path/to/your-project     # Windows: .\init-project.ps1 C:\path\to\project
```

## Scripted route — the management API

With the dashboard already running, these endpoints do the same work. Each one
re-installs the affected components and updates the manifest:

| Endpoint | Effect |
|----------|--------|
| `GET  /api/management/installed-components` | What is installed right now |
| `POST /api/management/add-agent` | Install one agent and its core skills |
| `POST /api/management/remove-agent` | Remove one agent |
| `POST /api/management/add-mcp-server` | Install one MCP server |
| `POST /api/management/remove-mcp-server` | Remove one MCP server |
| `GET  /api/management/new-components` | Components added to dev-suite since this install |

## Changing target assistants, or resetting to a clean state

Adding or dropping an assistant changes the file layout, not just a list, so it goes
through the reinstall path rather than the management API:

```bash
cd ./dev-suite/configurator/dashboard/server
npm run reinstall -- --project /path/to/your-project --dry-run   # preview first
npm run reinstall -- --project /path/to/your-project
```

`--dry-run` prints the plan without touching anything. See `/reinstall-dev-suite` for the
full flag list.

## After any change

Routing is regenerated into `AGENTS.md`; `CLAUDE.md` only imports it via `@AGENTS.md`.
**Never hand-write routing into `CLAUDE.md`** — the next regeneration overwrites it and
the two files disagree in the meantime.

Keep the selection coherent: enabling a backend-framework agent for a stack the project
does not have costs context on every turn and routes work to an agent with nothing to do.
