# Dev-Suite Development Guide

Dev-suite is a library/toolkit that extends Claude Code with agents, skills, MCP servers, and a configuration dashboard. **This is a source repository — it contains NO active MCP servers, NO `.mcp.json`, NO `.mcp-servers/`, and NO runtime configuration.** See README.md for user-facing documentation.

## Architecture

```
dev-suite/
├── agents/{category}/{name}-expert.md      # Specialized agents (YAML frontmatter)
├── skills/{category}/{tech}/SKILL.md       # Skill files + optional quick-ref/
├── mcp-servers/{name}/                     # MCP server source (TypeScript, npm workspaces)
│   ├── src/index.ts                        # Server implementation
│   └── metadata.json                       # Server metadata (tools, envVars, detectedWhen)
├── configurator/dashboard/
│   ├── src/                                # React frontend (Vite + TailwindCSS + Zustand)
│   ├── server/src/services/                # Express backend services
│   ├── server/tests/                       # Vitest unit tests
│   └── electron/                           # Electron desktop app (main.cjs, preload.cjs, updater.cjs)
├── registry/                               # Dynamic config (features.json, frameworks.json, etc.)
├── templates/                              # Project scaffolding templates
├── commands/                               # Slash commands
├── scripts/lib/metadata-parser.sh          # Parse metadata.json & agent YAML
└── init-project.sh|ps1                     # Entry point (launches dashboard)
```

## Critical Rules

### DO NOT:
1. **Create `.mcp.json` or `.mcp-servers/` in this repository** — MCP servers exist only as source code under `mcp-servers/*/src/`
2. **Hardcode component lists** — Derive agents from filesystem scan, MCP servers from `mcp-servers/package.json` workspaces, frameworks from `registry/*.json`, env vars from `metadata.json`
3. **Hardcode counts in docs** — Never write exact counts of agents, skills, MCP servers, or technologies in CLAUDE.md or README.md; derive dynamically when needed (e.g., `find agents -name '*.md' | wc -l`)
4. **Skip backup creation** — Dashboard MUST create `.dev-suite-backup/` before overwriting any user files
5. **Use relative paths in generated `.mcp.json`** — All paths must be absolute via `path.resolve()`
6. **Modify installed components in target projects manually** — Use `/reconfigure` command or dashboard

### DO:
1. **Keep components loosely coupled** — Agents declare skills/MCP servers in frontmatter → Skills reference KB docs → MCP `metadata.json` declares `recommendedFor`/`detectedWhen`. MCP servers are never required — agents must work without them.
2. **Update metadata when adding components** — Add to `mcp-servers/package.json` workspaces, create `metadata.json`, add YAML frontmatter
3. **Use dynamic configuration** — Load from `registry/*.json`, parse `metadata.json`, extract YAML frontmatter
4. **Test cross-platform** — `init-project.sh` (Linux/macOS) + `init-project.ps1` (Windows)
5. **Validate generated config** — Check `.mcp.json` syntax, verify absolute paths, ensure env vars are set
6. **Record `availableAtInstall` catalog snapshot** — `installation.service.ts` writes this to `.dev-suite-manifest.json` for new-component discovery
7. **Verify documentation before committing** — Before creating any git commit that includes changes to `agents/`, `skills/`, `mcp-servers/`, or `configurator/dashboard/server/src/services/detection/`, verify that README.md agent/skill/MCP-server tables and technology lists still match the filesystem. Also check if CHANGELOG.md needs an entry. Fix any stale documentation before committing.

## Key Patterns

### Agent Frontmatter Fields
```yaml
---
name: react-expert              # Agent identifier
description: |                  # Multi-line description
  React specialist...
model: sonnet                   # Optional: model override (sonnet, haiku, opus)
allowed-tools: Read, Edit, ...  # Optional: restrict tool access
skills:                         # Skill directories to include
  - frontend-react
  - state-zustand
mcp_servers:                    # MCP servers this agent uses
  - documentation
  - code-quality
---
```

### MCP Server Metadata Fields
Each `mcp-servers/{name}/metadata.json` contains: `name`, `description`, `shortDescription`, `category`, `tools[]`, `envVars[]` (with `name`, `description`, `default`, `required`), `recommendedFor[]` (agent IDs that benefit from this server — never required), `detectedWhen[]` (technology keywords).

### Naming Conventions

| Component | Pattern | Example |
|-----------|---------|---------|
| Agents | `{technology}-expert.md` | `react-expert.md` |
| Skills | `SKILL.md` in category folder | `frontend-react/SKILL.md` |
| MCP servers | lowercase with hyphens | `api-tester`, `database-query` |
| Commands | `{command-name}.md` | `init-project.md` |
| Registry | `{purpose}.json` | `frameworks.json` |

### Generated Files in Target Projects
`.mcp.json`, `.dev-suite.json`, `.dev-suite-manifest.json`, `CLAUDE.md`, `.claude/agents/`, `.claude/skills/`, `.claude/commands/`, `.mcp-servers/*/`

## Service Map

Path: `configurator/dashboard/server/src/services/`

| Service | Purpose |
|---------|---------|
| `agents.service.ts` | Load agent metadata from YAML frontmatter, load MCP metadata from metadata.json |
| `analytics.service.ts` | Track knowledge base usage and correlate with orchestrator jobs |
| `best-practices-validator.service.ts` | Validate projects against best practices rules |
| `code-review.service.ts` | Code review job creation and management |
| `custom-agents.service.ts` | User-created custom agent management |
| `detection.service.ts` | Detect project stack (frameworks, databases, Git provider) |
| `git.service.ts` | Git operations and repository management |
| `hooks.service.ts` | Git and Claude Code hooks management |
| `installation.service.ts` | Copy files, install MCP servers, generate config, record catalog snapshot |
| `management.service.ts` | Generate CLAUDE.md with agent routing, manage installed components, discover new components |
| `recipes.service.ts` | Pre-built workflow recipes for common tasks |
| `templates.service.ts` | Project scaffolding template management |
| `upgrade.service.ts` | Upgrade installed dev-suite components to latest versions |
| `workflows.service.ts` | Multi-step workflow orchestration |
| `codegen.service.ts` | Spec-driven code generation pipeline with validation and AI refinement |

Subdirectories with additional logic: `code-review/`, `detection/`, `git/`, `hooks/`, `installation/`, `orchestrator/`, `upgrade/`

Tech stack: React 19, Express 5, Electron 40, Vite 7, Zustand, Zod 4, TypeScript 5, TailwindCSS, Vitest

## How-To Checklists

### Add a New Agent
1. Create `agents/{category}/{name}-expert.md` with YAML frontmatter (`name`, `description`, `skills`, `mcp_servers`, optionally `model` and `allowed-tools`)
2. Write agent body content (role, responsibilities, best practices)
3. Create or update skill directories in `skills/` as needed
4. Add any KB references in skill quick-ref files
5. Update README.md agent table

### Add a New MCP Server
1. Create `mcp-servers/{server-name}/` with `package.json` (`@dev-suite/{name}`, main: `dist/index.js`)
2. Add `metadata.json` with `name`, `description`, `category`, `tools`, `envVars`, `recommendedFor`, `detectedWhen`
3. Add `src/index.ts` with MCP server implementation
4. Add `tsconfig.json` (extend from root or create standalone)
5. Update `mcp-servers/package.json` workspaces array
6. Build: `cd mcp-servers && npm install && npm run build`

### Add a New Skill
1. Create `skills/{category}/{technology}/SKILL.md` with skill definition
2. Optionally add `quick-ref/` subdirectory with focused guides (basics.md, patterns.md, etc.)
3. Reference KB in quick-refs: `> **Knowledge Base:** Read knowledge/{tech}/{topic}.md for complete documentation.`
4. Add the skill directory name to relevant agent frontmatter `skills` arrays

### Add Documentation to Knowledge Base
1. Clone the KB repo: `https://github.com/claude-dev-suite/knowledge_base.git`
2. Add markdown files under `knowledge/{technology}/{topic}.md`
3. Update `mcp-servers/documentation/src/docs-index.ts` with new entries
4. Commit and push to KB repository (documentation MCP server fetches on-demand with 2h cache)

## Testing

**Location**: `configurator/dashboard/server/tests/`

**Commands** (from `configurator/dashboard/server/`):
```bash
npm run test            # Run all tests
npm run test:coverage   # Run with coverage report
```

**Test coverage**: `detection.service.test.ts`, `agents.service.test.ts`, `management.service.test.ts` (includes `getNewComponents` scenarios), `installation.service.test.ts` (includes `availableAtInstall` snapshot), `hooks.service.test.ts`, `analytics.service.test.ts`, `code-review.service.test.ts`, `codegen.service.test.ts`, `workflows.service.test.ts`, `orchestrator.security.test.ts`, `websocket.rate-limit.test.ts`, `logger.test.ts`, `security-codeql.test.ts` (path-injection and ReDoS regression tests), route tests in `routes/` (including `routes/codegen.routes.test.ts`)

**Manual verification checklist** (when modifying initialization logic):
- Detection identifies frameworks, databases, and Git provider correctly
- `.mcp.json` has correct absolute paths
- `.dev-suite.json` matches selections
- Generated `CLAUDE.md` includes selected agents
- `.dev-suite-manifest.json` contains `availableAtInstall` with full catalog
- Monorepo subprojects detected (e.g., `frontend/package.json` + `backend/pom.xml`)
- New-component discovery works (add agent to dev-suite, reopen dashboard, verify notification)

## Commands

```bash
# Build all MCP servers
cd mcp-servers && npm install && npm run build

# Build specific server
cd mcp-servers && npm run build:{server-name}

# Run tests
cd configurator/dashboard/server && npm run test

# Run dashboard frontend dev server
cd configurator/dashboard && npm run dev

# Launch dashboard for a project
./init-project.sh /path/to/project

# Verify agent files exist
ls agents/*/*.md

# Check MCP server builds
ls mcp-servers/*/dist/index.js
```

## Anti-Staleness Rule

Never write exact counts of agents, MCP servers, skills, or supported technologies in `CLAUDE.md` or `README.md`. These numbers change frequently and go stale. When a count is needed, derive it dynamically from the filesystem (e.g., `find agents -name '*-expert.md'`). This applies to all component lists and technology enumerations.
