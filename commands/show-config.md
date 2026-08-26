---
name: show-config
description: Display current dev-suite configuration with enabled components
allowed-tools: Read, Glob
---

# Show Configuration

Display what dev-suite has installed in this project.

## Process

1. Read `.dev-suite.json` — the installed selection
2. Read `.dev-suite-manifest.json` — every file written, with its target assistant
3. Read `AGENTS.md` — the generated routing section
4. Present a summary

## What each file actually contains

`.dev-suite.json` records the selection and nothing else:

```json
{
  "version": "1.12.0",
  "installedAt": "2026-08-24T10:00:00.000Z",
  "agents":     { "enabled": ["react-expert", "spring-boot-expert"] },
  "mcpServers": { "enabled": ["documentation", "database-query"] },
  "rules":      { "enabled": ["conventional-commits"] }
}
```

There is no stack, path, hook or documentation-strategy information in it. The detected
stack is not persisted — it is recomputed by the dashboard on each run.

`.dev-suite-manifest.json` is the authoritative record of what was written: `files[]`
(each with `path`, `hash`, `type`, `source` and the `target` assistant it belongs to),
`agents[]`, `mcpServers[]`, `installedRuleFiles[]`, and the `availableAtInstall` catalog
snapshot used to spot components added to dev-suite since the install.

## Output Format

```
Dev-suite {version}, installed {installedAt}

Agents ({n})
   - {agent} ...

MCP servers ({n})
   - {server} ...

Rules ({n})
   - {rule} ...

Assistants configured: {targets from the manifest's files[].target}
Files managed: {count}
```

Take "assistants configured" from the manifest's `targets` array, which is authoritative.
Do **not** derive it from the distinct `files[].target` values: that is lossy — Cline's only
artefact is rule files, which are recorded in `installedRuleFiles`, so it never appears there
at all.
