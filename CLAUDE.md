# Dev-Suite Development Guide

This document provides guidance for Claude Code when working with the dev-suite repository.

## What is Dev-Suite?

Dev-suite is a comprehensive development toolkit for Claude Code that extends its capabilities through:

- **11 MCP Servers** - Extend Claude with specialized tools (documentation, database, Docker, API testing, Git, logs, performance, security, etc.)
- **34 Specialized Agents** - Domain experts for React, Spring Boot, testing, security, DevOps, and more
- **240+ Skills** - Technology-specific knowledge bases with quick-reference guides
- **Dashboard** - Web UI for configuring projects via visual interface
- **Orchestrator** - Execute complex multi-agent tasks submitted from the dashboard
- **Analytics** - Track knowledge base usage and agent performance

**Critical Principle**: This is a **library/toolkit repository**. It contains only source files that downstream projects copy during initialization. There are NO active MCP servers or runtime configuration in this repository.

## Repository Purpose

Dev-suite is designed to be:
1. **Cloned alongside user projects** (not installed via npm)
2. **Used to initialize other projects** via `./init-project.sh <target-path>`
3. **A centralized resource** that multiple projects can reference

Projects initialize dev-suite by selecting agents and MCP servers through a web dashboard, which then copies the necessary files into the project's `.claude/` and `.mcp-servers/` directories.

## Architecture Overview

```
dev-suite/
├── agents/                      # 34 specialized agents
│   ├── backend/                # Spring Boot, NestJS, FastAPI, Rust, Go, Deno
│   ├── frontend/               # React, Next.js, Vue, Svelte, Electron
│   ├── database/               # Prisma, SQL, MongoDB
│   ├── testing/                # Vitest, Playwright, Spring Boot Tests, QA
│   ├── infrastructure/         # Docker, DevOps
│   ├── messaging/              # Kafka, RabbitMQ experts
│   ├── security/               # Security, OWASP
│   ├── quality/                # Code review
│   └── core/                   # Architect, TypeScript, Node.js, Logs, Perf, Docs, Accessibility
├── skills/                      # 240+ skill files with quick-refs
│   ├── frontend-*/             # React, Vue, Angular, Svelte, Solid
│   ├── backend-*/              # NestJS, Express, FastAPI, Spring Boot, Rust, Go, Deno
│   ├── databases/              # PostgreSQL, MySQL, MongoDB, Redis
│   ├── orm-odm/                # Prisma, Drizzle, TypeORM, SQLAlchemy
│   ├── testing/                # Vitest, Jest, Playwright, Cypress, pytest
│   ├── state-*/                # TanStack Query, Redux, Zustand, Pinia
│   ├── api-design/             # REST, GraphQL, tRPC, OpenAPI
│   ├── authentication/         # JWT, OAuth2, NextAuth
│   ├── infrastructure/         # Docker, Kubernetes
│   ├── ci-cd/                  # GitHub Actions
│   ├── messaging/              # Kafka, RabbitMQ, Redis Pub/Sub, SQS, NATS
│   ├── logging/                # Winston, Pino, Logback, slf4j
│   └── best-practices/         # Git, Clean Code, Performance, OWASP, Biome
├── mcp-servers/                 # 11 MCP server source code (TypeScript)
│   ├── documentation/          # Docs fetcher for 137 technologies
│   ├── database-query/         # SQL query executor
│   ├── docker-manager/         # Docker/Compose operations
│   ├── api-tester/             # HTTP testing, benchmarks, mock server
│   ├── api-explorer/           # OpenAPI schema explorer
│   ├── log-analyzer/           # Multi-format log parsing
│   ├── performance-profiler/   # CPU/memory profiling, benchmarks
│   ├── code-quality/           # Complexity, duplicates, dead code analysis
│   ├── security-scanner/       # Dependency audit, secrets, SAST
│   └── dashboard-bridge/       # Dashboard WebSocket integration
├── configurator/                # Project initialization system
│   └── dashboard/              # Web dashboard (React + TypeScript + Electron)
│       ├── src/                # React frontend (Vite + TailwindCSS + Zustand)
│       │   ├── components/     # React components
│       │   ├── hooks/          # Custom React hooks
│       │   ├── stores/         # Zustand state stores
│       │   └── App.tsx         # Main app component
│       ├── server/             # Express backend (TypeScript)
│       │   └── src/
│       │       ├── services/   # Business logic services
│       │       ├── routes/     # API routes
│       │       └── server.ts   # Express server entry
│       └── electron/           # Electron desktop app
│           ├── main.cjs        # Main process
│           ├── preload.cjs     # Preload scripts
│           └── updater.cjs     # Auto-updater
├── registry/                    # Dynamic configuration data
│   └── features.json           # Feature flags and optional enhancements
├── scripts/                     # Utility scripts
│   └── lib/
│       └── metadata-parser.sh  # Parse metadata.json & agent YAML
├── commands/                    # Slash commands
├── templates/                   # Project scaffolding templates
└── init-project.sh/ps1         # Entry point (launches dashboard)
```

## Initialization Flow

```
User runs: ./init-project.sh /path/to/target-project
                    ↓
    1. Check Node.js installation (v20+)
                    ↓
    2. Build MCP servers if needed (npm install && npm run build)
                    ↓
    3. Launch web dashboard at http://localhost:3456
                    ↓
   ┌────────────────────────────────────────────────┐
   │          Dashboard Web UI (5 Steps)           │
   ├────────────────────────────────────────────────┤
   │ Step 1: Project Detection                     │
   │   • Scan package.json, pom.xml, Cargo.toml    │
   │   • Detect frameworks (React, Spring, etc.)   │
   │   • Detect databases (PostgreSQL, MongoDB)    │
   │   • Detect Git provider (GitHub, GitLab)      │
   │   • Auto-recommend agents & MCP servers       │
   ├────────────────────────────────────────────────┤
   │ Step 2: Select Agents                         │
   │   • Pre-selected based on detected tech       │
   │   • Manual override available                 │
   ├────────────────────────────────────────────────┤
   │ Step 3: Select MCP Servers                    │
   │   • Pre-selected based on stack               │
   │   • Configure environment variables           │
   ├────────────────────────────────────────────────┤
   │ Step 4: Environment Configuration             │
   │   • Auto-detect from .env files               │
   │   • Database URL construction                 │
   │   • Git token setup                           │
   ├────────────────────────────────────────────────┤
   │ Step 5: Install                               │
   │   • Copy agents to .claude/agents/            │
   │   • Copy skills to .claude/skills/            │
   │   • Install MCP servers to .mcp-servers/      │
   │   • Generate .mcp.json                        │
   │   • Generate .dev-suite.json                  │
   │   • Generate CLAUDE.md with agent routing     │
   └────────────────────────────────────────────────┘
                    ↓
   Generated files in target project:
   • .mcp.json               # MCP server configuration
   • .dev-suite.json         # Stack configuration
   • CLAUDE.md               # Agent routing rules
   • .claude/agents/         # Selected agents
   • .claude/skills/         # Related skills
   • .claude/commands/       # Slash commands
   • .mcp-servers/*/         # Installed MCP servers
```

## Dashboard Services (`configurator/dashboard/server/src/services/`)

The dashboard backend is built with TypeScript services:

| Service | Purpose |
|---------|---------|
| **detection.service.ts** | Detect project stack (React, Spring Boot, databases, Git provider) |
| **agents.service.ts** | Load agent metadata from YAML frontmatter, load MCP metadata from metadata.json |
| **installation.service.ts** | Copy files, install MCP servers, generate configuration |
| **management.service.ts** | Generate CLAUDE.md with agent routing, manage installed components |
| **orchestrator.service.ts** | WebSocket server for executing multi-agent tasks from dashboard GUI |
| **analytics.service.ts** | Track knowledge base usage and correlate with orchestrator jobs |
| **hooks.service.ts** | Git and Claude Code hooks management |
| **git.service.ts** | Git operations and repository management |
| **code-review.service.ts** | Code review job creation and management |

## MCP Servers (11 Total)

All MCP servers use npm workspaces for shared dependencies and are written in TypeScript.

| Server | Tools | Description | Env Vars | Category |
|--------|-------|-------------|----------|----------|
| **documentation** | 7 | Fetch docs for 137 technologies via Git-based KB | `KB_REPO_URL` (optional) | knowledge |
| **database-query** | 9 | Execute SQL queries, schema inspection, migrations | `DATABASE_URL` (required) | database |
| **docker-manager** | 10 | Manage containers, images, Compose services | None | infrastructure |
| **api-tester** | 7 | HTTP requests, benchmarks, mock server, Postman import | None | api |
| **api-explorer** | 6 | OpenAPI schema explorer, endpoint details | Configured via `.dev-suite.json` | api |
| **log-analyzer** | 10 | Multi-format log parsing, pattern detection | None | observability |
| **performance-profiler** | 12 | CPU/memory profiling, benchmarking, HAR replay | None | performance |
| **code-quality** | 6 | Complexity, duplicates, dead code, dependencies | None | quality |
| **security-scanner** | 6 | Dependency audit, secrets scan, SAST, container scan | None | security |
| **dashboard-bridge** | 9 | Dashboard integration, orchestrator queue | Configured via dashboard | integration |

### MCP Server Metadata Structure

Each MCP server has a `metadata.json` file:

```json
{
  "name": "database-query",
  "description": "Executes SQL queries, manages schemas...",
  "shortDescription": "Database operations",
  "category": "database",
  "tools": ["execute_query", "list_tables", "describe_table", ...],
  "envVars": [
    {
      "name": "DATABASE_URL",
      "description": "Database connection string",
      "default": "",
      "required": true
    }
  ],
  "requiredFor": ["prisma-expert", "sql-expert"],
  "detectedWhen": ["prisma", "postgresql", "mysql", "mongodb"]
}
```

The dashboard reads these metadata files to:
- Display server descriptions
- Auto-select servers based on detected technologies
- Configure environment variables dynamically
- Associate servers with agents

## Agents (25+ Total)

Agents are stored in `agents/{category}/{name}-expert.md` with YAML frontmatter:

```yaml
---
name: react-expert
description: React patterns, hooks, optimization
skills:
  - frontend-react
  - state-tanstack-query
  - state-zustand
mcp_servers:
  - documentation
  - code-quality
---
```

| Category | Agents |
|----------|--------|
| **Core** | architect, code-reviewer, typescript-expert, nodejs-expert, log-analyst, performance-expert, documentation-expert, accessibility-expert |
| **Frontend** | react-expert, nextjs-expert, vue-expert, svelte-expert, electron-expert, tauri-expert |
| **Backend** | spring-boot-expert, nestjs-expert, fastapi-expert, rust-expert, go-expert, deno-expert |
| **Database** | prisma-expert, sql-expert, mongodb-expert |
| **Testing** | vitest-expert, playwright-expert, spring-boot-integration-test-expert, qa-expert |
| **Infrastructure** | docker-expert, devops-expert |
| **Messaging** | kafka-expert, rabbitmq-expert |
| **Security** | security-expert |

## Skills (290+ Files)

Skills are organized by category with a `SKILL.md` in each folder. They may include `quick-ref/` subdirectories with focused guides.

Each quick-ref file references the knowledge base:
```markdown
# Topic Quick Reference

> **Knowledge Base:** Read `knowledge/react/hooks.md` for complete documentation.
```

## Knowledge Base

The knowledge base is in a **separate Git repository**:
`https://github.com/claude-dev-suite/knowledge_base.git`

The documentation MCP server fetches KB files on-demand via Git sparse checkout with a 2-hour cache.

**Supported technologies (137):**
- Frontend: React, Vue, Angular, Svelte, Solid, Next.js, Nuxt, Remix, SvelteKit, Astro
- Backend: Spring Boot, NestJS, Express, Fastify, FastAPI, Django, Flask, Rust (Actix/Axum/Rocket/Warp), Go (Gin/Fiber/Echo/Chi), Deno (Fresh/Oak)
- Databases: PostgreSQL, MySQL, MongoDB, Redis
- ORM: Prisma, Drizzle, TypeORM, SQLAlchemy, Spring Data JPA
- Testing: Vitest, Jest, Playwright, Cypress, pytest, Testing Library, Testcontainers
- State: TanStack Query/Router, Redux Toolkit, Pinia, Zustand
- Infrastructure: Docker, Kubernetes, GitHub Actions
- Security: JWT, OAuth2, NextAuth
- API: REST, GraphQL, tRPC, OpenAPI
- Best Practices: Git Workflow, Clean Code, Performance, OWASP, Biome

## Development Workflows

### Building MCP Servers

The dashboard automatically builds MCP servers before launching. Manual build:

```bash
# Build all servers (from mcp-servers/)
npm install
npm run build

# Build specific server
npm run build:documentation
npm run build:api-tester
npm run build:database-query
```

### Adding a New MCP Server

1. **Create directory**: `mcp-servers/{server-name}/`
2. **Add package.json**:
   ```json
   {
     "name": "@dev-suite/{server-name}",
     "version": "1.0.0",
     "main": "dist/index.js",
     "scripts": {
       "build": "tsc && node -e \"require('fs').chmodSync('dist/index.js', '755')\""
     },
     "dependencies": { ... }
   }
   ```
3. **Add metadata.json** (see structure above)
4. **Add src/index.ts** with MCP implementation
5. **Update `mcp-servers/package.json`** workspaces array
6. **Build**: `npm install && npm run build` from `mcp-servers/`

### Adding a New Agent

1. **Create file**: `agents/{category}/{name}-expert.md`
2. **Add YAML frontmatter**:
   ```yaml
   ---
   name: my-expert
   description: Description of expertise
   skills:
     - skill-1
     - skill-2
   mcp_servers:
     - documentation
     - api-tester
   ---
   ```
3. **Write agent content** (role, responsibilities, best practices)
4. **Create/update skills** in `skills/` as needed
5. **Update README.md** with new agent

### Adding a New Skill

1. **Create directory**: `skills/{category}/{technology}/`
2. **Add SKILL.md** with skill definition
3. **Optionally add quick-ref guides**:
   ```
   skills/{category}/{technology}/quick-ref/
   ├── basics.md
   ├── advanced.md
   └── patterns.md
   ```
4. **Reference KB**: Add `> **Knowledge Base:** ...` header in quick-refs

### Adding Documentation to Knowledge Base

1. **Clone KB repo**: `git clone https://github.com/claude-dev-suite/knowledge_base.git`
2. **Add markdown files**: `knowledge/{technology}/{topic}.md`
3. **Update docs-index.ts** in `mcp-servers/documentation/src/docs-index.ts`
4. **Commit and push** to KB repository
5. MCP server will fetch new docs automatically (2-hour cache)

## Critical Development Rules

### ❌ DO NOT:

1. **Configure active MCP servers in dev-suite root**
   - No `.mcp-servers/` directory
   - No `.mcp.json` file
   - MCP servers exist only as source code (`mcp-servers/*/src/`)

2. **Hardcode component lists**
   - Agent list → Derived from file-based fallback or metadata parser
   - MCP server list → Read from `mcp-servers/package.json` workspaces
   - Framework lists → Loaded from `registry/frameworks.json`
   - Environment variables → Read from `metadata.json`

3. **Skip backup creation**
   - Dashboard MUST create `.dev-suite-backup/` for existing files
   - Never overwrite user files without backup

4. **Use absolute paths in generated files**
   - All paths in `.mcp.json` must be absolute
   - Dashboard uses `path.resolve()` for this

5. **Modify installed components manually**
   - Use `/reconfigure` command or dashboard for updates

### ✅ DO:

1. **Keep components loosely coupled**
   - Agents declare skill dependencies in frontmatter
   - Skills reference KB documentation
   - MCP servers declare required agents in metadata.json

2. **Test on multiple platforms**
   - Linux/macOS: `init-project.sh`
   - Windows: `init-project.ps1`
   - WSL: Both should work

3. **Update metadata when adding components**
   - Add to `mcp-servers/package.json` workspaces
   - Create `metadata.json` for new servers
   - Add YAML frontmatter for new agents

4. **Use dynamic configuration**
   - Load from `registry/*.json` files
   - Parse `metadata.json` with `metadata-parser.sh`
   - Extract YAML frontmatter from agent files

5. **Validate generated configuration**
   - Check `.mcp.json` syntax
   - Verify paths exist and are absolute
   - Ensure environment variables are set

## File Naming Conventions

| Component | Pattern | Example |
|-----------|---------|---------|
| Agents | `{technology}-expert.md` | `react-expert.md` |
| Skills | `SKILL.md` in category folder | `frontend-react/SKILL.md` |
| MCP servers | lowercase with hyphens | `api-tester`, `database-query` |
| Commands | `{command-name}.md` | `init-project.md` |
| Registry | `{purpose}.json` | `frameworks.json` |

## Common Commands

```bash
# Initialize a project (launches dashboard)
./init-project.sh /path/to/project

# Build all MCP servers
cd mcp-servers && npm install && npm run build

# Build specific server
cd mcp-servers && npm run build:documentation

# Verify agent files
ls agents/*/*.md

# Count skills
find skills/ -name "SKILL.md" | wc -l

# Check MCP builds
ls mcp-servers/*/dist/index.js

# Launch dashboard for current directory
./init-project.sh .
```

## Testing Strategy

### Manual Testing Checklist

When modifying initialization logic:

1. **Test on clean project**:
   ```bash
   mkdir test-project && cd test-project
   /path/to/dev-suite/init-project.sh .
   ```

2. **Verify detection** (check dashboard UI):
   - Frameworks detected correctly
   - Databases identified
   - Git provider found

3. **Verify generation**:
   - `.mcp.json` has correct absolute paths
   - `.dev-suite.json` matches selections
   - `CLAUDE.md` includes selected agents
   - `.claude/` directory structure correct

4. **Verify MCP servers work**:
   - Restart Claude Code
   - Use MCP tools (e.g., `/docs react hooks`)

5. **Test monorepo support**:
   - Create `frontend/` and `backend/` directories
   - Add `package.json` and `pom.xml` in subdirs
   - Run init-project and verify detection

### Automated Testing (Future)

- Unit tests for detection logic
- Integration tests for dashboard API
- E2E tests for full initialization flow

## Troubleshooting

### Dashboard doesn't launch
- Check Node.js version: `node --version` (must be v20+)
- Check MCP builds: `ls mcp-servers/*/dist/index.js`
- Check port 3456: `lsof -i :3456` or `netstat -an | grep 3456`

### MCP servers not detected in Claude
- Verify `.mcp.json` syntax
- Check paths are absolute: `cat .mcp.json | jq '.mcpServers[].command'`
- Restart Claude Code

### Agent not routing correctly
- Check `CLAUDE.md` has agent entry
- Verify agent file exists in `.claude/agents/`
- Check YAML frontmatter syntax

### Detection not working
- Update `registry/detection.json` patterns
- Check `configurator/dashboard/lib/detection.js` logic
- Verify target files exist (e.g., `package.json`)

## Version History Summary

| Version | MCP Servers | Agents | Skills | Major Changes |
|---------|-------------|--------|--------|---------------|
| 1.0.0   | 11          | 34     | 240+   | Initial public release |

## Links

- **Knowledge Base Repository**: https://github.com/claude-dev-suite/knowledge_base
- **Dashboard Port**: http://localhost:3456 (when running)
- **Orchestrator WebSocket**: ws://localhost:3457 (internal)

## Notes for Claude Code

When working on this repository:

1. **Never create `.mcp.json` or `.mcp-servers/` here** - This is a source repository, not a configured project
2. **Always test changes on a separate test project** - Use `./init-project.sh ../test-project`
3. **Update metadata when adding features** - Keep `metadata.json` and YAML frontmatter in sync
4. **Follow naming conventions** - Lowercase-with-hyphens for servers, `{tech}-expert.md` for agents
5. **Use registry for configuration** - Load from `registry/*.json`, never hardcode
6. **Test cross-platform** - Both `.sh` and `.ps1` scripts must work
