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
