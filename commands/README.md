# Dev-Suite Slash Commands

Claude Code slash commands for project initialization and management.

---

## Available Commands

| Command | File | Description |
|---------|------|-------------|
| `/init-project` | `init-project.md` | Initialize dev-suite for a project (interactive wizard) |
| `/ui-wizard` | `ui-wizard.md` | Launch the graphical dashboard wizard |
| `/docs` | `docs.md` | Access documentation for a technology |
| `/generate` | `generate.md` | Generate code scaffolding (components, APIs, tests) |
| `/show-config` | `show-config.md` | Display current dev-suite configuration |
| `/reconfigure` | `reconfigure.md` | Modify existing configuration (add/remove agents, MCP servers) |
| `/health-check` | `health-check.md` | Validate installation and diagnose issues |
| `/sync-dev-suite` | `sync-dev-suite.md` | Update dev-suite components to latest version |
| `/uninstall` | `uninstall.md` | Remove dev-suite components (interactive, preserves user content) |
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
- Interactive multi-step wizard
- Auto-detects 66+ technologies from `package.json`, `pom.xml`, `Cargo.toml`, etc.
- Pre-selects agents and MCP servers based on detected stack
- Generates `.mcp.json`, `.dev-suite.json`, `CLAUDE.md`
- Creates `.dev-suite-backup/` before overwriting any user files

All questions use Claude Code's `AskUserQuestion` tool for interactivity.

---

### `/ui-wizard` - Dashboard UI Wizard

**Usage:**
```
/ui-wizard
```

Launches the graphical web dashboard wizard instead of the CLI-based wizard.

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

Opens an interactive wizard to add or remove agents, MCP servers, hooks, and other components from an existing installation.

---

### `/health-check` - Installation Validation

**Usage:**
```
/health-check
```

Validates the dev-suite installation: checks MCP server builds, config file syntax, absolute paths in `.mcp.json`, and agent file integrity.

---

### `/sync-dev-suite` - Sync Components

**Usage:**
```
/sync-dev-suite
```

Syncs the installed dev-suite components with the latest version from the dev-suite source repository. Equivalent to the **Updates** tab in the dashboard.

---

### `/uninstall` - Interactive Removal

**Usage:**
```
/uninstall
```

Interactively removes dev-suite components. Preserves user-created content and offers selective removal.

---

### `/uninstall-dev-suite` - Full Removal

**Usage:**
```
/uninstall-dev-suite
```

Performs a complete dev-suite removal including MCP servers, agents, skills, commands, and generated config files. Backs up user content before removal.

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
