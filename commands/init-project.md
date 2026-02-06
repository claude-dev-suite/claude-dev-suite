---
name: init-project
description: Initialize dev-suite for a project using the web dashboard.
allowed-tools: Bash
argument-hint: [project-path]
---

# /init-project - Initialize dev-suite

This command launches the dev-suite web dashboard for project configuration.

---

## Usage

```bash
# From the project directory
./dev-suite/init-project.sh .

# Or specify a target path
./dev-suite/init-project.sh /path/to/project
```

The dashboard will open in your browser at `http://localhost:3456`.

---

## Dashboard Features

The web dashboard provides:

1. **Auto-Detection** - Scans your project for frameworks, languages, and tools
2. **Smart Recommendations** - Suggests agents and MCP servers based on your stack
3. **Environment Configuration** - Configure database connections, API keys, etc.
4. **One-Click Installation** - Install all components with a single click

---

## What Gets Installed

After configuration:

```
project/
├── .mcp.json           # MCP server configuration
├── .dev-suite.json     # Stack configuration
├── CLAUDE.md           # Agent routing instructions
├── .claude/
│   ├── agents/         # Agent definition files
│   └── skills/         # Technology-specific skills
└── .mcp-servers/       # Local MCP server copies
```

---

## Available MCP Servers

| Server | Description |
|--------|-------------|
| **documentation** | Fetch docs for 121+ technologies |
| **api-tester** | Test REST endpoints |
| **api-explorer** | Explore OpenAPI/Swagger schemas |
| **database-query** | Execute SQL queries |
| **docker-manager** | Manage containers and compose |
| **log-analyzer** | Parse and analyze logs |
| **performance-profiler** | Profile code performance |
| **security-scanner** | Scan for vulnerabilities |
| **code-quality** | Analyze complexity and patterns |

---

## Troubleshooting

**Dashboard doesn't open:**
- Check that Node.js 18+ is installed
- Try opening `http://localhost:3456` manually

**Script not found:**
```bash
ls -la ./dev-suite/init-project.sh
chmod +x ./dev-suite/init-project.sh
```
