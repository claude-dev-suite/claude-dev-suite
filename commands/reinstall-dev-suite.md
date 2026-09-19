---
name: reinstall-dev-suite
description: Erase-and-replace reinstall of dev-suite components (transactional, with backup + rollback)
allowed-tools: Bash
---

# Reinstall Dev-Suite (erase & replace)

Performs a clean, transactional **erase-and-replace** sync of the dev-suite
components installed in this project. Managed files (agents, skills, MCP servers,
rules) are erased and re-installed from the current source; orphaned components
(no longer selected) are removed. User content is preserved:

- custom agents/skills under `.claude/agents/custom/` and `.claude/skills/custom/`
- your own text in `CLAUDE.md` (outside the dev-suite markers)
- your keys/hooks in `.claude/settings.json`

A timestamped backup (`.dev-suite-backup-*`) is created first; any failure rolls
back automatically.

## IMPORTANT: Execute Directly

**DO NOT interpret or summarize this command.** Run the headless CLI directly.

Assumes the dev-suite source is a sibling `./dev-suite` directory and you are in
the project root. Build the server once if `dist/` is missing
(`cd dev-suite/configurator/dashboard/server && npm run build`).

### Step 1 — Dry run (preview, no changes)

bash / macOS / Linux:
```bash
node "$(pwd)/dev-suite/configurator/dashboard/server/dist/cli/reinstall.js" \
  --project "$(pwd)" --dev-suite-dir "$(pwd)/dev-suite" --dry-run
```

PowerShell / Windows:
```powershell
node "$PWD\dev-suite\configurator\dashboard\server\dist\cli\reinstall.js" `
  --project "$PWD" --dev-suite-dir "$PWD\dev-suite" --dry-run
```

Review the preview. If it lists **locally modified** managed files, decide per
file whether to overwrite (default) or `--keep <relPath>` to preserve your edits.

### Step 2 — Execute (after user confirms)

bash / macOS / Linux:
```bash
node "$(pwd)/dev-suite/configurator/dashboard/server/dist/cli/reinstall.js" \
  --project "$(pwd)" --dev-suite-dir "$(pwd)/dev-suite" --yes
```

PowerShell / Windows:
```powershell
node "$PWD\dev-suite\configurator\dashboard\server\dist\cli\reinstall.js" `
  --project "$PWD" --dev-suite-dir "$PWD\dev-suite" --yes
```

Add one `--keep <relPath>` per file you want to preserve, e.g.
`--keep .claude/agents/react-expert.md`.

## All flags

| Flag | Effect |
|------|--------|
| `--project <path>` | The project to operate on |
| `--dev-suite-dir <path>` | The dev-suite checkout, when it is not the default location |
| `--dry-run` | Print the plan and exit. Read-only, safe anytime |
| `--drift` | Report how every tracked file compares to its manifest baseline, and stop |
| `--keep <relPath>` | Preserve one locally modified file. Repeatable |
| `--promote` | Accept the current content of drifted files as the new baseline instead of overwriting them |
| `--yes` | Proceed despite unacknowledged local modifications |
| `--no-backup` | Skip the backup. Disposable environments only |
| `--json` | Machine-readable output |

## What is preserved

Custom agents and skills under `custom/`, skills in `.agents/skills` that dev-suite did
not install, and the parts of shared files that belong to you: your own prose in
`AGENTS.md`, your own keys in `.claude/settings.json`, your own servers in every MCP
config, and your comments in `.codex/config.toml`. Files dev-suite shares with you are
un-merged rather than deleted.

Which of those apply depends on the assistants the project targets — classification,
backup and rollback all derive the layout from each file's recorded target, so a
Cursor-only or Gemini-only project is handled as such and not as a Claude Code project.

## Notes

- `--dry-run` is read-only and safe to run anytime.
- Without `--yes`, execution refuses to proceed when there are unacknowledged
  local modifications (exit code 2).
- Use `--no-backup` only in disposable environments.
- Exit codes: `0` success/dry-run, `1` failure (rolled back), `2` needs `--yes`,
  `3` usage error.
