# Changelog

All notable changes to dev-suite are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [2.8.0] - 2025-02

### Added
- **Dashboard TypeScript Rewrite** - Complete rewrite of the dashboard:
  - Frontend: React 18 + TypeScript + Vite + TailwindCSS + Zustand
  - Backend: Express + TypeScript with modular services
  - Desktop: Electron 40 with auto-updater
- **New Agents** (9 total):
  - `python-expert` - Python development specialist
  - `integration-validator-expert` - API contract validation
  - `messaging-expert` - Event-driven architecture (consolidates Kafka/RabbitMQ)
  - `dashboard-refactor-expert` - Internal dashboard specialist
- **Electron Desktop App** - Native desktop app with:
  - Auto-updates via electron-updater
  - Splash screen
  - Native file dialogs
- **Enhanced Code Review** - Monorepo subproject path support
- **Feature Registry** - `registry/features.json` for optional enhancements

### Changed
- Dashboard services migrated from JavaScript to TypeScript
- Hooks management split into Git hooks and Claude Code hooks
- Code review panel with WebSocket streaming

### Fixed
- Monorepo subproject path detection for code review jobs
- WebSocket job submission with correct project paths

---

## [2.7.0] - 2024-12-14

### Added
- **Fully Dynamic init-project.sh** - Zero hardcoded elements:
  - Agent derivation from `derive_agents_from_stack()` + file-based fallback
  - AGENT_TABLE generated from YAML frontmatter
  - MCP_TOOLS generated from metadata.json
  - Framework/database/testing lists loaded from registry
  - IMPL_FRONTEND/IMPL_BACKEND determined dynamically
- **File-based Fallback** - Works without `jq`:
  - Agent matching via `{tech}-expert.md` file detection
  - Minimal fallback lists for UI selections
  - Graceful degradation in restricted environments

### Changed
- Removed all hardcoded agent case statements (was 13 agents)
- Removed all hardcoded MCP tools case statements (was 5 servers)
- Removed all hardcoded framework/runtime/database arrays
- All UI selections now load from `registry/frameworks.json`
- Agent descriptions extracted from frontmatter instead of hardcoded strings

### New Functions (metadata-parser.sh)
- `get_agents_for_tech()` - Get agents for a technology from registry
- `derive_agents_from_stack()` - Derive full agent set from detected stack

---

## [2.6.0] - 2024-12-14

### Added
- **Dynamic Configuration System** - init-project.sh now auto-discovers components:
  - MCP servers loaded from `mcp-servers/*/metadata.json`
  - Agents loaded from YAML frontmatter in agent files
  - Framework mappings loaded from `registry/frameworks.json`
  - Git providers loaded from `registry/git-providers.json`
  - Detection patterns loaded from `registry/detection.json`
  - Presets loaded from `registry/presets.json`
- **MCP Metadata Files** - Each MCP server now has `metadata.json` with:
  - Tool names, descriptions, categories
  - Environment variables with defaults
  - Required agent associations
- **Registry System** - Centralized configuration in `registry/`:
  - `frameworks.json` - Framework definitions with detection patterns
  - `detection.json` - Technology detection patterns
  - `presets.json` - Preset matching rules
  - `git-providers.json` - Git provider configurations
- **Metadata Parser Library** - `scripts/lib/metadata-parser.sh` for:
  - JSON parsing with `jq` (with grep fallback)
  - YAML frontmatter extraction
  - Dynamic component loading

### Changed
- init-project.sh no longer has hardcoded MCP server lists
- MCP descriptions now come from metadata.json files
- Monorepo MCP categorization uses metadata categories
- Script adapts automatically to new MCP servers/agents/frameworks

---

## [2.5.0] - 2024-12-14

### Added
- **Security Scanner MCP** (6 tools) - Unified security scanning:
  - `scan_dependencies` - npm audit, pip-audit, cargo audit, govulncheck
  - `scan_secrets` - gitleaks, trufflehog + built-in fallback patterns
  - `scan_code` - semgrep SAST
  - `scan_container` - trivy for Docker images
  - `check_tools` - verify installed security tools
  - `scan_all` - run all scans in parallel
- **DevOps Expert Agent** - CI/CD, Docker, Kubernetes, infrastructure
- **Supply Chain Security Skill** - OWASP A03:2025, dependency auditing, SBOMs
- **Secrets Management Skill** - Credential handling, secret detection, rotation

### Changed
- Renamed `security-auditor` to `security-expert` for consistency
- Renamed `qa-engineer` to `qa-expert` for consistency
- Updated OWASP Top 10 skill to 2025 version (new A03, A10 categories)

---

## [2.4.0] - 2024-12-14

### Added
- **Rust Expert Agent** - Backend specialist for Actix-web, Axum, Rocket, Warp
- **Go Expert Agent** - Backend specialist for Gin, Fiber, Echo, Chi
- **Deno Expert Agent** - Backend specialist for Fresh, Oak

### New Skills (16 total)
- **Languages**: Rust, Go, Deno
- **Rust Frameworks**: Actix-web, Axum, Rocket, Warp
- **Go Frameworks**: Gin, Fiber, Echo, Chi
- **Deno Frameworks**: Fresh, Oak
- **Testing**: rust-testing, go-testing, deno-testing

### Knowledge Base
- Added 13 new technologies to docs-index.ts with official documentation URLs
- Rust ecosystem: ownership, async, error-handling, traits, cargo
- Go ecosystem: concurrency, interfaces, modules, testing
- Deno ecosystem: permissions, std, deploy, kv

---

## [2.3.0] - 2024-12-14

### Added
- **Quick Mode** (`--quick` flag) - Auto-detect stack and apply best-matching preset
- **Preset Matching** - Automatic preset selection based on detected technologies
- **Workspaces Detection** - npm, pnpm, yarn workspaces support
- **Monorepo Tools Detection** - Turborepo, Nx, Lerna, Rush
- **OpenAPI Spec Detection** - Auto-detect swagger.json, openapi.yaml with endpoint extraction
- **Rust Support** - Cargo.toml detection, frameworks: Actix-web, Axum, Rocket, Warp
- **Deno Support** - deno.json detection, frameworks: Fresh, Oak, Hono
- **Go Support** - go.mod detection, frameworks: Gin, Fiber
- **Conditional MCP Config** - database-query excluded when no database detected

### Changed
- init-project.sh now uses detected values in non-interactive mode
- Improved monorepo frontend/backend path detection

### Fixed
- Prisma datasource detection (was finding generator instead)
- YAML URL extraction for OpenAPI specs
- Multi-line JSON parsing for workspaces

---

## [2.2.0] - 2024-12-13

### Added
- **Performance Profiler MCP** (13 tools) - Script/function profiling, memory analysis, bottleneck detection
- **Log Analyzer MCP** (10 tools) - Multi-format log parsing, pattern analysis, real-time monitoring
- **Dashboard Bridge MCP** (6 tools) - Dashboard integration and control
- **Dashboard UI** - Next.js dashboard with agents, MCP, projects, settings, wizard pages
- Health check system for dev-suite installations

### Enhanced
- **API Tester** - Postman/Insomnia import, test generator, mock server
- **Git Manager** - cherry_pick_guide, conflict_analyzer, generate_changelog
- **Database Query** - generate_migration, backup_restore
- **Log Analyzer** - Nginx, Apache, Kubernetes, Syslog parsers

---

## [2.1.0] - 2024-12-01

### Added
- **Git-based Knowledge Base** - On-demand KB fetching via sparse checkout
- **Version-aware Documentation** - Support for technology version selection
- Smart 2-hour cache with automatic refresh
- `clear_kb_cache` and `kb_cache_stats` tools

### Changed
- Documentation server no longer bundles KB files (~4MB smaller)
- KB_REPO_URL defaults to official knowledge_base repository

---

## [2.0.0] - 2024-11-25

### Added
- **API Explorer MCP** - OpenAPI schema exploration
- **Git Manager MCP** - Full Git/GitHub operations (PRs, issues, branches, releases)
- Multi-provider Git support (GitHub, GitLab, Bitbucket, Azure DevOps)
- Tauri Expert and Svelte Expert agents
- Skeleton UI and SvelteKit skills

### Changed
- MCP servers converted to npm workspaces
- Modular init-project architecture with reusable libraries

### Fixed
- Sync command npm workspaces support
- Git repos without remote origin handling

---

## [1.0.0] - 2024-11-15

### Initial Release
- **6 MCP Servers**: Documentation, Database Query, Docker Manager, API Tester, API Explorer, Git Manager
- **17 Agents**: Core, Frontend, Backend, Testing, Database, Infrastructure experts
- **175+ Skills**: Framework-specific knowledge files
- **6 Presets**: fullstack-typescript, node-api, python-api, react-spa, vue-nuxt, monorepo-fullstack
- **11 Templates**: Project scaffolds for various stacks
- Interactive init-project wizard with auto-detection
- Monorepo support with frontend/backend path detection

---

## Summary

| Version | MCP Servers | Agents | Skills | Tools |
|---------|-------------|--------|--------|-------|
| 2.8.0   | 11          | 34     | 240+   | 97+   |
| 2.7.0   | 11          | 34     | 240+   | 97+   |
| 2.6.0   | 10          | 25     | 240+   | 91+   |
| 2.5.0   | 10          | 25     | 240+   | 91+   |
| 2.4.0   | 9           | 24     | 240+   | 85+   |
| 2.3.0   | 9           | 21     | 220+   | 85+   |
| 2.2.0   | 9           | 21     | 220+   | 77    |
| 2.1.0   | 6           | 19     | 200+   | 40    |
| 2.0.0   | 6           | 19     | 175+   | 35    |
| 1.0.0   | 6           | 17     | 175+   | 30    |
