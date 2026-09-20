# Dev-Suite Slash Commands

Claude Code slash commands for project initialization and management.

---

## Available Commands

| Command | File | Description |
|---------|------|-------------|
| `/init-project` | `init-project.md` | Configure a project — launches the dashboard wizard |
| `/ui-wizard` | `ui-wizard.md` | Same dashboard, against the current directory |
| `/docs` | `docs.md` | Access documentation for a technology |
| `/generate` | `generate.md` | Generate code scaffolding (components, APIs, tests) |
| `/show-config` | `show-config.md` | Display current dev-suite configuration |
| `/reconfigure` | `reconfigure.md` | Add or remove agents, MCP servers and rules via the management API |
| `/health-check` | `health-check.md` | Validate the **dev-suite checkout** and diagnose build issues |
| `/sync-dev-suite` | `sync-dev-suite.md` | **Deprecated** — alias for `/reinstall-dev-suite` |
| `/reinstall-dev-suite` | `reinstall-dev-suite.md` | Transactional erase-and-replace reinstall/sync (backup + rollback, orphan removal, per-file opt-out) |
| `/uninstall` | `uninstall.md` | Alias for `/uninstall-dev-suite` (non-interactive) |
| `/uninstall-dev-suite` | `uninstall-dev-suite.md` | Full dev-suite removal with complete cleanup |
| `/release-promote` | `release-promote.md` | Generate all promotional content for a release (HN, Twitter, LinkedIn, Reddit, dev.to) |
| `/awesome-list-pr` | `awesome-list-pr.md` | Generate a PR for adding dev-suite to an awesome list |
| `/community-draft` | `community-draft.md` | Draft an authentic community reply for GitHub, Reddit, HN, or dev.to |

---

### `/init-project` - Project Initialization Wizard

**Usage:**
```
/init-project [project-path]
```

**Features:**
- Launches the dashboard; the configuration happens in the browser, not in the terminal
- Auto-detects the stack from `package.json`, `pom.xml`, `Cargo.toml`, `go.mod`, `pyproject.toml` and more, plus which assistants the project already uses
- Pre-selects agents and MCP servers based on the detected stack
- Seven steps, including **Rules** and **Assistants** — one install can target several assistants at once
- Writes `AGENTS.md`, `.dev-suite.json`, `.dev-suite-manifest.json` and each selected assistant's own files
- Creates `.dev-suite-backup/` before overwriting any user file

---

### `/ui-wizard` - Dashboard UI Wizard

**Usage:**
```
/ui-wizard
```

Launches the same dashboard as `/init-project`, against the current directory.

**Features:**
- No arguments required - uses current directory
- Visual step-by-step configuration
- Auto-detects project stack
- Interactive agent and MCP server selection
- Preview configuration before installation

---

### `/docs` - Documentation Access

**Usage:**
```
/docs <technology> [topic]
```

Fetches documentation for a technology from the knowledge base via the `documentation` MCP server.

---

### `/generate` - Code Scaffolding

**Usage:**
```
/generate <type>
```

Generates code scaffolding for components, APIs, tests, and more.

---

### `/show-config` - Configuration Display

**Usage:**
```
/show-config
```

Displays the current dev-suite configuration (`.dev-suite.json`, installed agents, MCP servers).

---

### `/reconfigure` - Modify Configuration

**Usage:**
```
/reconfigure
```

Adds or removes agents, MCP servers and rules from an existing installation, through the
dashboard's **Manage** tab or the `/api/management/*` endpoints behind it. It does **not**
hand-edit `.dev-suite.json`: that file is generated output and is rebuilt on every install.
There is no `hooks` key in it.

---

### `/health-check` - Installation Validation

**Usage:**
```
/health-check
```

Validates the **dev-suite checkout** — Node/npm versions, repository structure, npm
workspaces, MCP server builds and startup, and the documentation server. It does not
inspect a target project's installation; use `/show-config` or a `--dry-run` reinstall
for that.

---

### `/sync-dev-suite` - Sync Components

**Usage:**
```
/sync-dev-suite
```

**Deprecated.** Now delegates to `/reinstall-dev-suite`. The shell script it used to run
(`scripts/sync-dev-suite.sh`) only knows the Claude Code file layout and never updates
`.dev-suite-manifest.json`, so on a Cursor-, Gemini- or Codex-only project it did almost
nothing while reporting success, and on any project it left the manifest stale.

---

### `/reinstall-dev-suite` - Erase-and-Replace Reinstall

**Usage:**
```
/reinstall-dev-suite
```

Transactional **erase-and-replace** sync. Erases dev-suite-managed files (agents,
skills, MCP servers, rules) and re-installs them from the current source, removing
components no longer selected. Preserves custom agents/skills under `custom/`, your
`CLAUDE.md` notes, and your `settings.json` keys. Always previews first (`--dry-run`)
and lets you `--keep` specific locally modified files; creates a backup and rolls
back automatically on failure. Equivalent to the **Reinstall / Sync** tab in the
dashboard Updates view.

---

### `/uninstall` - Alias

**Usage:**
```
/uninstall
```

Alias for `/uninstall-dev-suite`. Not interactive: it runs the same non-interactive CLI,
whose only flags are `--project`, `--dry-run` and `--json`. Run it with `--dry-run` first
to see exactly what would be removed.

---

### `/uninstall-dev-suite` - Full Removal

**Usage:**
```
/uninstall-dev-suite
```

Removes everything recorded in `.dev-suite-manifest.json`: MCP servers, agents, skills,
commands and generated config, for every target the project uses.

**It takes no backup.** Files dev-suite shares with you — `AGENTS.md`, `.codex/config.toml`,
every MCP config — are un-merged rather than deleted, so your own prose, your own servers
and your own comments survive, as do `custom/` and any skill dev-suite did not install.
Run `--dry-run` first; that is the safety net, not a backup.

---

### `/release-promote` - Release Promotion Pipeline

**Usage:**
```
/release-promote [version]
```

Generates copy-paste-ready promotional content for a release across all channels. If no version is provided, uses the latest git tag.

**Output** (saved to `docs/release-promo/{VERSION}/`):
- `hacker-news.md` — Show HN post (technical, direct, ready to post)
- `twitter-thread.md` — X thread with hook, highlights, and CTA
- `linkedin.md` — LinkedIn post in storytelling format
- `reddit.md` — Separate posts for r/ClaudeAI and r/devtools
- `devto-outline.md` — dev.to article outline with sections
- `awesome-list-entry.md` — One-liner for awesome list submissions

---

### `/awesome-list-pr` - Awesome List PR Generator

**Usage:**
```
/awesome-list-pr [target-repo]
```

Generates a complete, guidelines-compliant pull request for adding dev-suite to an awesome list. Includes PR title, body, checklist, and the correctly formatted entry line.

---

### `/community-draft` - Community Reply Drafter

**Usage:**
```
/community-draft [url-or-pasted-text]
```

Drafts an authentic, helpful reply for a community discussion (GitHub, Reddit, HN, dev.to). Generates two variants: one without self-promotion, one with a natural mention of dev-suite where genuinely relevant. Claude recommends which to use.
