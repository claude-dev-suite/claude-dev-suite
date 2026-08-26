# Dev-Suite

[![Version](https://img.shields.io/github/v/release/claude-dev-suite/claude-dev-suite.svg?include_prereleases)](https://github.com/claude-dev-suite/claude-dev-suite/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**A comprehensive AI-powered development toolkit that extends Claude Code with specialized agents, MCP servers, and visual orchestration.**

---

## Table of Contents

- [What is Dev-Suite?](#what-is-dev-suite)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Key Features](#key-features)
  - [Web Dashboard & Orchestrator](#web-dashboard--orchestrator)
  - [Code Generator](#code-generator)
  - [MCP Servers](#mcp-servers)
  - [Specialized Agents](#specialized-agents)
  - [Skills & Knowledge Base](#skills--knowledge-base)
    - [Knowledge Base Architecture](#knowledge-base-architecture)
  - [Project Templates](#project-templates)
  - [Custom Agents Builder](#custom-agents-builder)
  - [Recipes & Automations](#recipes--automations)
  - [Hooks Management](#hooks-management)
  - [Upgrade System](#upgrade-system)
  - [Electron Desktop App](#electron-desktop-app)
  - [Desktop App Downloads](#desktop-app-downloads)
- [Installation Modes](#installation-modes)
- [Usage](#usage)
- [Configuration](#configuration)
- [MCP Servers Reference](#mcp-servers-reference)
- [Agents Reference](#agents-reference)
- [Commands Reference](#commands-reference)
- [Upgrading](#upgrading)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## What is Dev-Suite?

Dev-Suite transforms Claude Code into a full-stack development powerhouse by providing:

- **Specialized Agents** - Domain experts for React, Angular, Vue, Svelte, Next.js, Electron, Tauri, Spring Boot, ASP.NET Core, Python, FastAPI, Rust (with arti/rustls/rusqlite/rust_decimal/proptest/rust-supply-chain ecosystem), Go, Deno, modern C++ (C++17/20/23), Windows kernel & driver development (WDF/KMDF/UMDF, HID, IDD), data engineering, RAG (retrieval-augmented generation), industrial automation (DCS/PLC), testing (Vitest/Playwright/pytest/Testcontainers/Maestro/Kotest/Turbine/Paparazzi/Roborazzi/proptest), security, DevOps, cloud (AWS/Azure/GCP), mobile (React Native/Flutter, Kotlin Multiplatform + Compose Multiplatform, native Android with Jetpack Compose + Keystore/Biometric, native iOS with SwiftUI + Keychain/Secure Enclave, Rust ↔ Kotlin/Swift via UniFFI, Java Foreign Memory API + jextract for desktop OS keyring), encrypted storage (SQLCipher, libsodium, age), build & supply chain (Gradle KMP, cargo-ndk, cargo-deny/audit/nextest, Sigstore/Cosign keyless signing, OSV-Scanner, reproducible builds), code quality (detekt, ktlint, Compose Rules), observability (Rust tracing + OpenTelemetry, self-hosted Sentry/GlitchTip), documentation (mdBook + rustdoc + Dokka + Showkase), game development (Unity 2D/3D, URP, Cinemachine, DOTS, Netcode, XR), messaging, creative frontend (Framer Motion, GSAP, Three.js, WebGL), and more
- **MCP Servers** - Extend Claude with tools for documentation (with KB discovery via `list_docs`), databases, Docker, API testing, logs, performance profiling, security scanning, and more
- **Skills** - Framework-specific knowledge bases with quick-reference guides, covering frontend, backend, databases, testing, infrastructure, messaging, industrial automation, AI/RAG integration, embeddings, vector stores, document processing, animation, 3D graphics, and more
- **Web Dashboard & Electron App** - Visual project configuration with stack detection and component selection
- **Project Templates** - Scaffolding for React, Next.js, Spring Boot, FastAPI, NestJS, Unity 2D, and more
- **Task Orchestrator** - Submit complex multi-agent tasks from the GUI with real-time streaming updates
- **Custom Agents Builder** - Create and edit custom agents directly from the dashboard
- **Recipes & Automations** - Pre-built automation workflows for common development tasks
- **Hooks Management** - Configure Git hooks and Claude Code hooks from the dashboard
- **Multi-Assistant Output** - Generate configuration for **Claude Code, GitHub Copilot, Cursor, Gemini CLI, Codex CLI, Cline, and Kimi Code** from a single install; agents and skills are shared, so several assistants coexist in one project
- **Update System** - Version visibility (installed vs. available) plus a transactional Reinstall / Sync that re-aligns a project to the current source
- **Analytics Dashboard** - Track knowledge base usage and correlate with executed jobs
- **Broad Technology Coverage** - On-demand documentation via a Git-based knowledge base

**Key Principle**: Dev-Suite is a **source repository** that initializes your projects. It lives alongside your projects and provides centralized resources that multiple projects can reference.

---

## Multi-Assistant Support

Dev-Suite began as a Claude Code toolkit and still treats Claude Code as its home, but a single install can now generate configuration for **Claude Code, GitHub Copilot, Cursor, Gemini CLI, Codex CLI, Cline, and Kimi Code**. Pick the targets in the wizard's *Target Assistants* step (detected assistants are pre-selected).

How it works:

- **`AGENTS.md`** is the primary instructions file — the cross-assistant standard that Copilot, Cursor and others read natively. `CLAUDE.md` is generated only when Claude Code is a target, as a thin pointer that imports `AGENTS.md`.
- **`.claude/agents/` and `.claude/skills/`** are shared infrastructure. Copilot and Cursor read them directly, so agents and skills are written once and available to every selected assistant.
- **MCP config and path-scoped rules** are the only formats that differ per assistant, and are written in each one's own shape — `.vscode/mcp.json` + `.github/mcp.json` + `.github/instructions/` for Copilot, `.cursor/mcp.json` + `.cursor/rules/` for Cursor, `.mcp.json` + `.claude/rules/` for Claude Code. An MCP file that already exists is merged rather than replaced: dev-suite rewrites only its own server entries and leaves yours untouched. If the file cannot be parsed it is left alone entirely and reported as a skipped capability.

Codex, Gemini and Kimi Code get `AGENTS.md` and the full skill set (mirrored to the cross-tool `.agents/skills` directory they read), plus MCP config in their own format — Gemini's `.gemini/settings.json`, Codex's `.codex/config.toml`, Kimi's `.kimi-code/mcp.json` — and native subagent files for Gemini (`.gemini/agents/`) and Kimi (`.kimi-code/agents/`). Cline reads `AGENTS.md` and the `.claude/skills` substrate directly and gets path-scoped rules in `.clinerules/`; it has no committable MCP config, so the install skips it rather than papering over it.

Assistants without a glob mechanism (Codex, Gemini, Kimi) carry agent routing in `AGENTS.md` instead of path-scoped rules. The **Task Orchestrator** and dashboard chat remain Claude-only — they run on the Claude Agent SDK. Devin is planned; it is detected and surfaced in the wizard, but not yet configurable.

---

## Prerequisites

- **Node.js v20+** - Required to build MCP servers and run the dashboard
- **npm** - Comes with Node.js
- **Git** - Required for cloning dev-suite and the knowledge base
- **Claude Code** - The Anthropic CLI tool that dev-suite extends

Optional:
- **Docker** - Required if using the docker-manager MCP server
- **Database** - Required if using the database-query MCP server (PostgreSQL, MySQL, etc.)

---

## Quick Start

> Prefer a one-click installer? Skip the clone step and jump to [Desktop App Downloads](#desktop-app-downloads) for Windows / macOS / Linux pre-built installers.

### 1. Clone Dev-Suite

```bash
git clone https://github.com/claude-dev-suite/claude-dev-suite.git
cd claude-dev-suite
```

### 2. Initialize Your Project

```bash
# Launch interactive web dashboard
./init-project.sh /path/to/your-project

# Windows PowerShell
.\init-project.ps1 C:\path\to\your-project

```

The script will:
1. Check Node.js installation (v20+)
2. Build the MCP servers, the dashboard server and the UI if they have never been built
3. Launch the web dashboard at `http://localhost:3456` (first free port from 3456)
4. Guide you through a 7-step wizard to configure your project

### 3. Restart Claude Code

Once initialization completes, **restart Claude Code** to load the new MCP servers and agents.

### 4. Start Using Dev-Suite

After restarting Claude Code, everything works automatically:

- **Agents** are routed based on your prompts (e.g., asking about React triggers the `react-expert`)
- **MCP tools** are available as Claude Code tools (e.g., `fetch_docs`, `execute_query`)
- **Skills** provide context-specific knowledge to agents
- **Slash commands** are available (e.g., `/docs react hooks`)

---

## Key Features

### Web Dashboard & Orchestrator

The **Web Dashboard** (launched via `init-project.sh`) provides:

#### **Visual Configuration Wizard**
- **Auto-Detection**: Scans `package.json`, `pom.xml`, `build.gradle.kts`, `Cargo.toml`, `docker-compose.yml`, `AndroidManifest.xml`, `libs.versions.toml`, `ProjectSettings/ProjectVersion.txt`, `Packages/manifest.json`, etc.
- **Stack Detection**: Identifies React, Spring Boot, Android/Kotlin (Room, Compose), Unity (2D, URP, HDRP, DOTS, Netcode, XR, Addressables, Cinemachine, Input System), PostgreSQL, Git provider, and more
- **Agent Selection**: Pre-selects agents based on detected technologies
- **MCP Selection**: Pre-selects MCP servers with environment variable configuration
- **Target Assistants**: Choose which assistants to configure (Claude Code, GitHub Copilot, Cursor, Gemini CLI, Codex CLI, Cline, Kimi Code); detected ones are pre-selected
- **One-Click Install**: Generates all config files — shared `AGENTS.md` + `.claude/` agents/skills, plus each selected assistant's own MCP config and rules

#### **Task Orchestrator** 🔥 NEW

Submit complex multi-agent tasks directly from the GUI:

```
Dashboard GUI → Submit Task → Claude Code (via MCP) → Execute → Stream Results → Dashboard
```

**Features**:
- **Real-time streaming** via WebSocket (port 3457)
- **Interactive input support** (y/n confirmations, file selections)
- **Job queue management** with status tracking
- **Live output updates** as agents execute
- **Result recap** with agent outputs, files changed, test results, build status

**How to use**:
1. Open dashboard: `./init-project.sh .` or via MCP tool `dashboard_open`
2. Navigate to **Orchestrator** tab
3. Enter task description (e.g., "Add user authentication with JWT")
4. Submit → Claude Code polls for task → Executes agents → Streams results back
5. View recap with links to changed files

#### **Analytics Dashboard** 📊 NEW

Track development activity and knowledge base usage:

- **KB Usage Statistics**: Most-accessed technologies, topics, search queries
- **Agent Performance**: Execution counts, average duration
- **Technology Trends**: Correlate KB queries with orchestrator jobs
- **Timeline View**: Hourly/daily usage patterns

Access at: `http://localhost:3456/analytics` (when dashboard is running)

#### **Code Generator** NEW

Spec-driven code generation with AI refinement:

```
Dashboard → Upload Spec → Deterministic Generation → AI Refinement → Accept/Reject
```

**Supported formats**: OpenAPI (JSON/YAML), AsyncAPI, TypeSpec, Protobuf, BPMN

**Features**:
- **9 target languages/frameworks**: TypeScript (Express, Fastify, NestJS, Koa), Java (Spring), Python (FastAPI, Flask), Go (Gin, Echo)
- **Convention-aware**: Reads `.prettierrc`, `tsconfig.json`, ESLint config to match project style
- **AI refinement**: Uses specialized agents + refinement skill for naming, imports, and code quality
- **5-step wizard**: Technology → Upload Spec → Configure → Preview → Generate
- **File browser**: Preview generated code before accepting

**How to use**:
1. Open dashboard and navigate to **Code Generator** tab
2. Select spec technology (OpenAPI, AsyncAPI, etc.)
3. Upload your spec file (drag-and-drop supported)
4. Choose target language, framework, and output directory
5. Preview → Generate → Optionally refine with Claude

#### **File Viewer**

Browse and inspect your project files directly from the dashboard:

- **File tree navigation** - Collapsible directory tree with smart filtering (skips `node_modules`, `dist`, `.git`, etc.)
- **Syntax highlighting** - VS Code-quality highlighting via [shiki](https://shiki.style/) for TypeScript, Python, Rust, Go, Java, JSON, YAML, Markdown, and 50+ languages
- **Read-only safety** - View any file up to 500 KB without risk of accidental edits
- **Path breadcrumb** - Always shows the full path of the open file

Access from the **Files** tab in the right tool window bar.

---

### MCP Servers

Specialized MCP servers extend Claude Code with powerful tools:

| Server | Tools | Description |
|--------|-------|-------------|
| **documentation** | 5 | Fetch docs via the Git-based KB; `list_docs` enumerates what is indexed |
| **database-query** | 9 | SQL queries, schema inspection, migrations |
| **docker-manager** | 8 | Containers, images, Compose services |
| **api-tester** | 6 | HTTP requests, collection import, mock servers |
| **api-explorer** | 7 | OpenAPI schema explorer, endpoint details |
| **log-analyzer** | 10 | Multi-format log parsing, pattern detection |
| **performance-profiler** | 13 | CPU/memory profiling, bottleneck detection, HAR replay |
| **code-quality** | 7 | Complexity analysis, dead code, duplicates, import graph |
| **security-scanner** | 6 | Dependency audit, secrets scan, SAST |
| **dashboard-bridge** | 9 | Dashboard control, orchestrator queue |
| **skill-loader** ⭐ | 3 | Built-in: lazy-loads dev-suite skill bodies on demand. Always installed; powers tiered `core_skills` / `extended_skills` agent schema |

See [MCP Servers Reference](#mcp-servers-reference) for detailed documentation.

---

### Specialized Agents

Domain experts with deep knowledge in specific technologies. Dev-suite ships agents for
frontend and backend frameworks, databases, testing, DevOps and cloud, mobile (including
Kotlin Multiplatform and native Android/iOS), data engineering and RAG, security, game
development, industrial automation (DCS/PLC), Bitcoin and Lightning, and Claude Code
extension authoring.

Each agent declares its own skills, its MCP servers, and the model it runs on. The
wizard pre-selects the ones your detected stack needs; nothing is installed that you
did not pick.

See the [Agents Reference](#agents-reference) below for the full list with models and
MCP servers, or [docs/AGENT-CAPABILITY-MATRIX.md](docs/AGENT-CAPABILITY-MATRIX.md) for
per-agent skills. Both are generated from agent frontmatter, so they cannot drift.

---

### Skills & Knowledge Base

Skills organized by category:

- **Frontend**: React, Vue, Angular, Svelte, Next.js, Nuxt, TailwindCSS, shadcn/ui
- **UX/Design**: Visual hierarchy, design tokens (W3C spec), interaction design, motion, loading states, mobile UX, color systems, ethical design
- **Animation**: Framer Motion, GSAP (scroll-driven, timelines, morphing), CSS advanced effects (clip-path, masks, CSS Houdini, scroll-driven animations)
- **Graphics & 3D**: Three.js/React Three Fiber, SVG animation, Canvas/WebGL, generative art, particle systems
- **Backend**: Spring Boot, NestJS, Express, FastAPI, ASP.NET Core, Rust, Go, Deno frameworks
- **Databases**: PostgreSQL, MySQL, MongoDB, Redis
- **ORM/ODM**: Prisma, Drizzle, TypeORM, SQLAlchemy, Spring Data JPA
- **Testing**: Vitest, Jest, Playwright, Cypress, Testcontainers (Java), testcontainers-python, pytest, pytest-django, FastAPI testing, factory_boy, Celery testing, Pact (contract testing), Messaging Testing (Kafka, RabbitMQ, multi-broker)
- **State Management**: TanStack Query/Router, Redux Toolkit, Zustand, Pinia
- **API Design**: REST, GraphQL, tRPC, OpenAPI
- **Infrastructure**: Docker, Kubernetes, GitHub Actions
- **Security**: JWT, OAuth2, NextAuth, OWASP
- **Best Practices**: Git Workflow, Clean Code, Performance Optimization

#### Knowledge Base Architecture

The knowledge base provides **on-demand documentation** via a separate Git repository: [github.com/claude-dev-suite/knowledge_base](https://github.com/claude-dev-suite/knowledge_base)

**How it works**:

```
Agent needs docs → documentation MCP → Git sparse checkout → Cache (2h TTL) → Return to agent
```

1. An agent (or you) requests documentation via `fetch_docs({ technology: "react", topic: "hooks" })`
2. The **documentation MCP server** checks the local cache (`.kb-cache/`)
3. If cached and fresh (< 2 hours), it returns the cached content immediately
4. If not cached or stale, it performs a **Git sparse checkout** to fetch only the requested files from the KB repository
5. The content is cached locally for subsequent requests

**The three-layer knowledge system**:

```
┌─────────────────────────────────────────────┐
│  Layer 1: Skills (.claude/skills/)          │  Always loaded in agent context
│  Quick-reference guides, patterns, rules    │  Instant access, no network needed
├─────────────────────────────────────────────┤
│  Layer 2: Quick-Refs (skills/*/quick-ref/)  │  Detailed guides per topic
│  Each references KB docs for deep dives     │  Loaded on demand by agent
├─────────────────────────────────────────────┤
│  Layer 3: Knowledge Base (Git repo)         │  Full documentation
│  Fetched on demand via the MCP server       │  Cached for 2 hours
└─────────────────────────────────────────────┘
```

- **Layer 1 (Skills)**: Concise rules and patterns loaded directly into the agent context. No network required.
- **Layer 2 (Quick-Refs)**: More detailed guides within skill folders. Each quick-ref links to KB docs for full documentation.
- **Layer 3 (Knowledge Base)**: Complete documentation stored in a separate Git repository, fetched on-demand by the documentation MCP server with local caching.

**Configuration**:

```bash
# Optional: use a custom KB repository (defaults to official repo)
KB_REPO_URL=https://github.com/claude-dev-suite/knowledge_base.git

# Optional: cache TTL in seconds (default: 7200 = 2 hours)
KB_CACHE_TTL=7200
```

**Adding documentation to the KB**:

1. Clone the KB repository: `git clone https://github.com/claude-dev-suite/knowledge_base.git`
2. Add markdown files under `knowledge/{technology}/{topic}.md`
3. Update the relevant category file in `mcp-servers/documentation/src/docs-index/` (e.g., `testing.ts`, `backend.ts`) to register the new technology — `docs-index.ts` is a re-export aggregator, do not edit it directly
4. Commit and push - the documentation MCP server will fetch new docs automatically on next request

---

### Project Templates

Ready-to-use scaffolding templates for quick project setup:

| Template | Description |
|----------|-------------|
| **api-nodejs** | Node.js API starter |
| **express-api** | Express.js REST API |
| **frontend-react** | React frontend with Vite |
| **react-tanstack** | React with TanStack Query + Router |
| **nextjs-standalone** | Next.js App Router standalone |
| **fullstack-nextjs-nestjs** | Next.js + NestJS monorepo |
| **springboot-api** | Spring Boot 3 REST API |
| **springboot-react-fullstack** | Spring Boot + React fullstack |
| **python-fastapi** | FastAPI Python backend |
| **vue-nuxt** | Vue.js with Nuxt 3 |
| **unity-2d-game** | Unity 6 2D game scaffold (URP 2D, Cinemachine, Input System, sample PlayerController2D with coyote time + jump buffer) |

Templates are used during the initialization wizard (Step 0) and provide pre-configured project structure, dependencies, and dev-suite integration.

---

### Custom Agents Builder

Create and manage custom agents directly from the dashboard:

- **Visual Editor** - Write agent markdown with YAML frontmatter
- **Skill Association** - Link agents to specific skills and MCP servers
- **Instant Deployment** - Agents are saved to `.claude/agents/` and immediately available
- **Edit & Delete** - Manage existing custom agents from the dashboard

---

### Recipes & Automations

Pre-built automation workflows for common development tasks:

- Browse and apply built-in automation recipes
- Recipes combine agent actions, hooks, and tool configurations
- Apply recipes to quickly set up common patterns (testing pipelines, linting, code review flows)

---

### Hooks Management

Configure Git hooks and Claude Code hooks from the dashboard:

- **Git Hooks** - Pre-commit, pre-push, commit-msg hooks
- **Claude Code Hooks** - Event-based automation (on file write, on tool call)
- **Visual Configuration** - Edit hooks through the dashboard UI
- **Template Support** - Pre-configured hook templates for common workflows

---

### Update System

Keep dev-suite components up to date through the dashboard **Updates** tab:

- **Version Visibility** - See the dev-suite version installed in your project alongside the version available from source, with an at-a-glance *Up to date* / *Update available* status
- **New Component Discovery** - Proactively notifies when new agents or MCP servers are added to dev-suite after your installation, with one-click install
- **Reinstall / Sync** - A single, transactional erase-and-replace that re-aligns a project to the current source: managed components are re-installed and orphaned ones removed, while your custom agents/skills, `CLAUDE.md` notes, and `settings.json` keys are preserved
- **Per-file opt-out** - Locally modified managed files are previewed with an **Overwrite / Keep** choice
- **Safe by default** - A backup is taken before any change and any failure rolls back automatically

---

### Electron Desktop App

The dashboard is available as a native desktop application:

- Cross-platform support (Windows, macOS, Linux)
- Fast startup with optimized splash screen
- Auto-updater for seamless version updates
- Native system tray integration
- Same features as the web dashboard

See [Desktop App Downloads](#desktop-app-downloads) below for pre-built installers.

---

### Desktop App Downloads

Pre-built installers for every tagged release are published on the [GitHub Releases](https://github.com/claude-dev-suite/claude-dev-suite/releases/latest) page.

> **Important prerequisite — install Node.js first.**
> The desktop app launches its own dashboard but does **not** ship a system-wide Node.js runtime. Claude Code starts MCP servers via the `.mcp.json` it reads on each project, and those server processes require `node` to be available on the user's `PATH`. Without Node.js v20+ installed system-wide, MCP servers will fail silently. The app shows a warning dialog on first launch if Node is missing — install it from [nodejs.org](https://nodejs.org/) and restart the app.

| Platform | Architecture | Asset | Notes |
|----------|--------------|-------|-------|
| Windows  | x64          | `Dev-Suite-Dashboard-Setup-x.y.z.exe` | NSIS installer |
| macOS    | Apple Silicon | `Dev-Suite-Dashboard-x.y.z-arm64.dmg` | M1 / M2 / M3 / M4 |
| macOS    | Intel         | `Dev-Suite-Dashboard-x.y.z-x64.dmg`  | 2019 and earlier |
| Linux    | x64          | `dev-suite-dashboard-x.y.z-x64.AppImage` | Portable, all distros (incl. Fedora / RHEL) |
| Linux    | x64          | `dev-suite-dashboard-x.y.z-x64.deb` | Debian / Ubuntu / Mint |

> Installers are currently **unsigned**. The OS will show a warning on first launch — see the per-platform instructions below.

#### Windows

1. Download `Dev-Suite-Dashboard-Setup-x.y.z.exe`.
2. Double-click to run. SmartScreen will show **"Windows protected your PC"** because the binary isn't signed yet.
3. Click **More info** → **Run anyway**.
4. The installer will set up the app and add a Start menu shortcut.

#### macOS

1. Download the DMG matching your CPU: `arm64` for Apple Silicon, `x64` for Intel.
   - Not sure? Click  → **About This Mac**. "Chip: Apple…" = arm64.
2. Open the DMG and drag **Dev-Suite Dashboard** into **Applications**.
3. First launch is blocked by Gatekeeper because the app isn't notarized. Choose one:
   - **Recommended:** Right-click the app in Applications → **Open** → confirm **Open** in the dialog. macOS will remember the choice.
   - **CLI alternative:** strip the quarantine flag:
     ```bash
     xattr -d com.apple.quarantine "/Applications/Dev-Suite Dashboard.app"
     ```

#### Linux — AppImage (portable, all distros)

```bash
chmod +x dev-suite-dashboard-*.AppImage
./dev-suite-dashboard-*.AppImage
```

If the AppImage refuses to run on a system without FUSE 2 (Ubuntu 22.04+, Fedora 38+), install it with `sudo apt install libfuse2` or extract and run instead:
```bash
./dev-suite-dashboard-*.AppImage --appimage-extract-and-run
```

#### Linux — Debian / Ubuntu / Mint (`.deb`)

```bash
sudo dpkg -i dev-suite-dashboard-*-x64.deb
sudo apt-get install -f   # only if dpkg reports missing dependencies
```

#### Linux — Fedora / RHEL / openSUSE

No native `.rpm` is published yet — use the AppImage above. It runs on all RPM-based distros without installation.

#### Auto-updates

The desktop app checks GitHub Releases at startup and every 4 hours. When a new version is published, you'll get an in-app notification and an **Install on quit** option. Auto-updates work the same on all three platforms.

---

## Installation Modes

### Interactive Mode (Default)

```bash
./init-project.sh /path/to/project
```

Launches web dashboard at `http://localhost:3456` with a 7-step wizard:
1. **Detection** - Auto-detect stack, databases, Git provider
2. **Agents** - Select specialized experts (pre-selected based on stack)
3. **MCP Servers** - Select tools (pre-selected based on stack)
4. **Environment** - Configure database URLs, API tokens
5. **Rules** - Pick project rule templates
6. **Assistants** - Choose which AI assistants to configure (detected ones pre-selected)
7. **Install** - Generate config files and copy components

The launcher takes a project path and nothing else; it builds the dashboard on first run.

### Headless Reinstall / Sync

The wizard is the only way to do a first install. Re-aligning a project that already has
dev-suite installed can run without a UI:

```bash
cd configurator/dashboard/server
npm run reinstall -- --project /path/to/project --dry-run
npm run reinstall -- --project /path/to/project --yes
```

`--dry-run` prints the plan and exits. `--keep <relPath>` preserves a locally modified managed
file, `--no-backup` skips the safety backup, and `--json` emits a machine-readable report.

---

## Usage

### Daily Development with Agents

After initialization, agents work **automatically** in Claude Code. When you ask questions or give tasks, Claude Code routes them to the appropriate agent based on keywords:

```
You: "Add a login form with validation"
→ Claude Code activates react-expert (detects React/frontend keywords)
→ Agent uses react skills + documentation MCP for best practices

You: "Why is this SQL query slow?"
→ Claude Code activates sql-expert (detects SQL/query keywords)
→ Agent uses database-query MCP to run EXPLAIN and analyze

You: "Review this PR for security issues"
→ Claude Code activates code-reviewer + security-expert
→ Agents use code-quality and security-scanner MCP tools
```

### Using MCP Tools Directly

MCP tools are available as Claude Code tools. You can ask Claude to use them:

```
"Fetch the React hooks documentation"
→ fetch_docs({ technology: "react", topic: "hooks" })

"List all Docker containers"
→ docker_ps({ all: true })

"Scan this project for vulnerabilities"
→ scan_all({ path: "." })
```

### Using the Dashboard

The dashboard can be reopened at any time for project management:

```bash
# Reopen dashboard for current project
./init-project.sh .

# Or via Claude Code MCP tool
# Ask Claude: "Open the dashboard"
→ dashboard_open()
```

**Dashboard tabs**:
- **Wizard** - Re-run the initialization wizard or use templates
- **Manage** - Add/remove agents, MCP servers, hooks, custom agents, recipes (with proactive new-component notifications)
- **Orchestrator** - Submit multi-agent tasks with real-time progress
- **Analytics** - View knowledge base usage statistics
- **Git** - Visual git operations (branches, commits, diffs, GitHub CLI auth detection with automatic login prompts)
- **Updates** - Check for and apply dev-suite updates

### Using the Orchestrator

For complex tasks that require multiple agents:

1. Open the dashboard (`./init-project.sh .`)
2. Go to the **Orchestrator** tab
3. Describe your task (e.g., "Refactor the auth module and add tests")
4. Submit the job
5. Claude Code picks up the task, executes agents, and streams results back
6. View the recap with changed files, test results, and build status

### Using Templates

To scaffold a new project from a template:

1. Open the dashboard
2. In the wizard, select **"Start from Template"** mode
3. Choose a template (e.g., `fullstack-nextjs-nestjs`)
4. Configure project-specific options
5. The template generates the project structure with dev-suite pre-configured

---

## Configuration

### Generated Files

What an install writes depends on which assistants you selected. These are always written:

```
your-project/
├── AGENTS.md                    # Agent routing (auto-generated, the cross-assistant standard)
├── .dev-suite.json              # Stack and component configuration
├── .dev-suite-manifest.json     # Every file dev-suite wrote, with hashes — drives sync/uninstall
├── .claude/
│   ├── agents/                  # Selected agents (shared substrate: Copilot and Cursor read it too)
│   └── skills/                  # Their skills
└── .mcp-servers/                # Installed MCP servers, built from dev-suite
    ├── documentation/
    ├── database-query/
    └── ...
```

Then one set per selected assistant:

| Assistant | Files written |
|-----------|---------------|
| **Claude Code** | `CLAUDE.md` (imports `AGENTS.md`), `.mcp.json`, `.claude/rules/*.md`, `.claude/commands/*.md`, `.claude/settings.json` |
| **GitHub Copilot** | `.vscode/mcp.json` (VS Code) + `.github/mcp.json` (CLI), `.github/instructions/*.instructions.md` |
| **Cursor** | `.cursor/mcp.json`, `.cursor/rules/*.mdc` |
| **Gemini CLI** | `.gemini/settings.json`, `.gemini/agents/*.md`, `.agents/skills/` mirror |
| **Codex CLI** | `.codex/config.toml` (`[mcp_servers.*]` merged in), `.agents/skills/` mirror |
| **Cline** | `.clinerules/*.md` (reads `AGENTS.md` and `.claude/skills` directly) |
| **Kimi Code** | `.kimi-code/mcp.json`, `.kimi-code/agents/*.md`, `.agents/skills/` mirror |

`CLAUDE.md` and `.mcp.json` appear only when Claude Code is one of the targets — they are not
written for a Copilot-only or Cursor-only install. Slash commands are Claude-Code-only: no other
assistant reads `.claude/commands`.

### `.dev-suite.json` Example

`.dev-suite.json` records the installed selection — nothing more. The detected stack is
recomputed by the dashboard each run and is deliberately not persisted here.

```json
{
  "version": "1.12.0",
  "installedAt": "2026-08-24T10:00:00.000Z",
  "agents": {
    "enabled": ["architect", "react-expert", "nestjs-expert", "prisma-expert"]
  },
  "mcpServers": {
    "enabled": ["documentation", "database-query", "api-tester"]
  },
  "rules": {
    "enabled": ["conventional-commits", "semver"]
  }
}
```

For the full record of what was written — every file with its hash and the assistant it
belongs to, plus the catalog snapshot used to detect newly available components — see
`.dev-suite-manifest.json`.


### Environment Variables

Create a `.env` file in your project root:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname

# Optional: Dashboard ports
DASHBOARD_PORT=3456
ORCHESTRATOR_WS_PORT=3457

# Optional: Documentation KB (defaults to official repo)
KB_REPO_URL=https://github.com/claude-dev-suite/knowledge_base.git
KB_CACHE_TTL=7200
```

**Security Note**: Never commit `.env` files. API tokens are only referenced by variable name in `.dev-suite.json`.

---

## MCP Servers Reference

### Documentation Server

Fetch on-demand documentation via the Git-based knowledge base. Call `list_docs` to see everything indexed.

**Tools**:
- `fetch_docs({ technology, topic, source?, refresh? })` - Get documentation for a topic
- `search_docs({ query, technologies? })` - Search across all docs
- `list_topics({ technology })` - List available topics for a technology
- `list_versions({ technology })` - List supported versions

**Example**:
```typescript
fetch_docs({ technology: "spring-boot", topic: "security" })
```

---

### Database Query Server

Execute safe SQL queries and manage database schemas.

**Tools**:
- `execute_query({ sql, params?, limit?, offset? })` - Execute SELECT queries
- `list_tables()` - List all tables with row counts
- `describe_table({ table })` - Get table schema details
- `get_schema({ table?, compact? })` - Get full database schema
- `explain_query({ sql, params?, verbose? })` - Analyze query performance
- `compare_schemas({ targetDatabaseUrl, tables? })` - Compare schemas
- `find_slow_queries({ table? })` - Identify potential performance issues
- `generate_migration({ targetDatabaseUrl, migrationName? })` - Generate migration script
- `backup_restore({ operation, backupPath?, format?, tables? })` - Backup/restore database

**Requires**: `DATABASE_URL` environment variable

---

### Docker Manager Server

Manage Docker containers, images, and Compose services.

**Tools**:
- `docker_ps({ all? })` - List running containers
- `docker_container({ container, action, tail? })` - Manage container (start/stop/logs/inspect)
- `docker_compose({ action, service?, build?, detach? })` - Manage Compose services
- `docker_images({ action, image? })` - Manage images
- `docker_stats({ container? })` - View resource usage
- `docker_networks()` - List networks
- `docker_volumes()` - List volumes
- `cleanup_unused({ target?, dryRun?, force? })` - Remove unused resources

---

### API Tester Server

Test REST APIs with requests, collection import, and mock servers.

**Tools**:
- `http_request({ method, url, headers?, body?, timeout? })` - Make HTTP request
- `health_check({ url, endpoints? })` - Check API health
- `batch_request({ requests, sequential? })` - Execute multiple requests
- `import_collection({ filePath, format?, variables? })` - Import Postman or Insomnia collection (auto-detects format)
- `generate_tests({ specPath, outputFormat?, includeNegativeTests? })` - Generate test cases from OpenAPI
- `mock_server({ action, specPath?, port?, delay? })` - Start/stop mock server

---

### API Explorer Server

Explore OpenAPI/Swagger schemas and endpoints.

**Tools**:
- `list_api_endpoints()` - List configured API endpoints
- `get_api_schema({ alias?, format?, refresh? })` - Fetch OpenAPI schema
- `list_api_paths({ alias?, method?, tag?, limit? })` - List API paths
- `get_api_endpoint_details({ path, method, alias?, resolveRefs? })` - Get endpoint details
- `get_api_models({ alias?, model?, compact?, limit? })` - Get schema models/DTOs
- `search_api({ query, alias?, searchIn?, limit? })` - Search across specs
- `detect_api_frameworks({ path?, maxDepth?, includeConfidence? })` - Detect API frameworks

**Configuration**: set `API_EXPLORER_ENDPOINTS` to a JSON array of endpoints, e.g.
`[{"alias":"api","url":"http://localhost:8080/v3/api-docs"}]`. The wizard prompts for it when you
select this server. Without the variable the server starts but reports no configured endpoints;
`detect_api_frameworks` still scans a directory on demand.

---

### Log Analyzer Server

Parse and analyze logs in multiple formats (Spring Boot, Node.js, Python, Nginx, Kubernetes, etc.).

**Tools**:
- `parse_logs({ filePath, format?, levels?, filter?, limit? })` - Parse log entries
- `find_errors({ filePath, format?, groupByException?, includeWarnings? })` - Find and group errors
- `analyze_patterns({ filePath, format?, minOccurrences? })` - Detect problematic patterns
- `aggregate_stats({ filePath, format?, groupBy? })` - Aggregate statistics
- `correlate_events({ filePaths, correlationField, targetValue? })` - Correlate events across logs
- `tail_logs({ filePath, lines?, format?, levels?, filter? })` - Get last N log lines
- `search_logs({ filePaths, query, useRegex?, caseSensitive?, limit? })` - Search across logs
- `compare_logs({ baselineFile, comparisonFile, format?, compareBy? })` - Compare log files
- `export_report({ filePath, outputFormat, format?, title? })` - Generate analysis report
- `watch_logs({ action, filePath?, format?, alertLevels?, alertPatterns? })` - Real-time monitoring

**Supported formats**: Spring Boot, Logback, Winston, Pino, Python, JSON, Nginx, Apache, Kubernetes, Syslog

---

### Performance Profiler Server

Profile CPU, memory, and endpoint performance.

**Tools**:
- `profile_script({ scriptPath, runtime?, duration?, args? })` - Profile script execution
- `profile_function({ modulePath, functionName, runtime, iterations?, args? })` - Profile specific function
- `benchmark_code({ code, runtime, iterations?, warmup? })` - Benchmark code snippet
- `analyze_memory({ scriptPath, runtime?, duration?, snapshotInterval? })` - Analyze memory usage
- `measure_startup({ scriptPath, runtime?, runs? })` - Measure startup time
- `find_bottlenecks({ scriptPath, runtime?, threshold? })` - Identify performance bottlenecks
- `attach_profiler({ pid?, port?, processName?, duration? })` - Attach to running Java process (JFR)
- `profile_endpoint({ url, method?, iterations?, concurrency?, headers?, body? })` - Profile HTTP endpoint
- `list_java_processes()` - List running Java processes
- `import_har({ harPath, flowName, filterHost?, excludeStaticAssets? })` - Import HAR file from DevTools
- `list_flows()` - List saved request flows
- `replay_flow({ flowName, baseUrl?, variables?, withProfiling?, respectTiming? })` - Replay saved flow
- `stress_test_flow({ flowName, users, duration, baseUrl?, rampUp?, variables? })` - Load test a flow

**Supported runtimes**: Node.js, Java, Python

---

### Code Quality Server

Analyze code complexity, duplicates, and dependencies.

**Tools**:
- `analyze_complexity({ path, threshold?, includeAll? })` - Analyze cyclomatic/cognitive complexity
- `find_duplicates({ path, minLines?, minTokens? })` - Detect code duplication
- `check_style({ path, fix?, rules? })` - Run linting (ESLint/Biome/Pylint/Checkstyle)
- `detect_antipatterns({ path, patterns?, thresholds? })` - Detect code smells
- `find_dead_code({ path, includeTests?, confidence? })` - Find unused code
- `analyze_import_graph({ path, excludeNodeModules?, maxDepth? })` - Analyze import graph and detect circular dependencies
- `code_metrics({ path, sortBy?, limit? })` - Calculate code metrics (LOC, SLOC, etc.)

---

### Security Scanner Server

Scan for vulnerabilities, secrets, and security issues.

**Tools**:
- `scan_dependencies({ path, packageManager?, severityThreshold? })` - Scan dependencies (npm audit, pip-audit)
- `scan_secrets({ path, tool?, scanHistory?, excludePaths? })` - Scan for hardcoded secrets (gitleaks, trufflehog)
- `scan_code({ path, rules? })` - SAST with Semgrep
- `scan_container({ target, type, severityThreshold? })` - Scan Docker images (Trivy)
- `check_tools()` - Check installed security tools
- `scan_all({ path, include?, containerTarget? })` - Run all scans in parallel

**External tools used** (auto-detected): npm audit, pip-audit, cargo audit, gitleaks, trufflehog, semgrep, trivy

---

### Dashboard Bridge Server

Control the dashboard and orchestrator from Claude Code.

**Tools**:
- `dashboard_open({ page?, projectPath? })` - Open dashboard in browser
- `dashboard_status()` - Check if dashboard is running
- `dashboard_start({ devSuiteDir? })` - Start dashboard server
- `dashboard_get_config({ projectPath })` - Read dev-suite configuration
- `dashboard_list_agents()` - List available agents
- `dashboard_detect_stack({ projectPath })` - Detect project stack
- `get_orchestrator_task({ claim? })` - Poll for orchestrator tasks from GUI
- `report_orchestrator_status({ jobId, status, message?, currentAgent?, recap?, summary? })` - Report task progress
- `list_pending_jobs()` - List pending orchestrator jobs

**Use case**: Claude Code polls `get_orchestrator_task()` to receive tasks submitted via the dashboard GUI, then reports progress back.

---

## Agents Reference

<!-- BEGIN GENERATED: agents-reference -->

Dev-suite ships **66 agents** across **15 categories**. Claude Code routes
to them automatically from the generated `AGENTS.md`; you can also call one by name.

Skill assignments are omitted here because most agents carry dozens — see
[docs/AGENT-CAPABILITY-MATRIX.md](docs/AGENT-CAPABILITY-MATRIX.md) for the full
per-agent skill and MCP breakdown. Both files are generated from agent frontmatter.

### Core

| Agent | Model | Focus | MCP servers |
|-------|-------|-------|-------------|
| **accessibility-expert** | sonnet | Web accessibility expert | `documentation` |
| **architect** | sonnet | Software architect for system design across domains — not just web/enterprise | `api-explorer`, `documentation` |
| **claude-code-extension-expert** | sonnet | Creates and improves Claude Code extensions: skills, agents, hooks, MCP servers, and plugins | — |
| **code-reviewer** | sonnet | Code review expert for quality, security, and best practices | `code-quality`, `documentation` |
| **dashboard-refactor-expert** | default | Expert in rewriting the configurator dashboard | `code-quality`, `documentation` |
| **documentation-expert** | haiku | Technical documentation expert | `documentation` |
| **log-analyst** | haiku | Log analysis specialist for Spring Boot, Node.js, and Python applications | `documentation`, `log-analyzer` |
| **nodejs-expert** | sonnet | Node.js runtime expert | `documentation`, `log-analyzer`, `performance-profiler` |
| **performance-expert** | sonnet | Performance analysis specialist for Node.js, Java, and Python applications | `documentation`, `performance-profiler` |
| **python-expert** | sonnet | Python language expert (3.10-3.14) | `documentation` |
| **typescript-expert** | sonnet | TypeScript language expert | `code-quality`, `documentation` |

### Frontend

| Agent | Model | Focus | MCP servers |
|-------|-------|-------|-------------|
| **angular-expert** | sonnet | Angular 17+ specialist for standalone components, signals, dependency injection, routing, forms, and performance optimization | `documentation` |
| **creative-frontend-expert** | sonnet | Creative frontend specialist for advanced visual effects, animation, and immersive UI | `documentation` |
| **electron-expert** | sonnet | Electron specialist for cross-platform desktop applications | `documentation` |
| **nextjs-expert** | sonnet | Next.js App Router specialist | `documentation` |
| **react-expert** | sonnet | React specialist for component design, hooks, state management, and performance optimization | `documentation` |
| **svelte-expert** | sonnet | Svelte and SvelteKit specialist with expertise in Svelte 5 runes, component patterns, SvelteKit routing, server-side… | `documentation` |
| **tauri-expert** | sonnet | Tauri specialist for cross-platform desktop applications built with Rust and web technologies | `documentation` |
| **ux-expert** | sonnet | UX/UI design specialist | `documentation` |
| **vue-expert** | sonnet | Vue 3 Composition API specialist | `documentation` |

### Backend

| Agent | Model | Focus | MCP servers |
|-------|-------|-------|-------------|
| **cpp-expert** | sonnet | Modern C++ specialist (C++17/20/23) | `code-quality`, `documentation` |
| **deno-expert** | sonnet | Deno backend specialist | `documentation` |
| **dotnet-expert** | sonnet | ASP.NET Core 8+ specialist | `api-tester`, `documentation` |
| **fastapi-expert** | sonnet | FastAPI Python framework specialist | `api-tester`, `documentation` |
| **go-expert** | sonnet | Go backend specialist | `documentation` |
| **nestjs-expert** | sonnet | NestJS framework specialist | `api-tester`, `documentation` |
| **rust-expert** | sonnet | Rust backend specialist | `documentation` |
| **spring-boot-expert** | sonnet | Spring Boot 3 Java framework specialist | `api-tester`, `documentation` |
| **streamlit-expert** | sonnet | Streamlit Python web application framework specialist | `documentation` |
| **windows-driver-expert** | opus | Windows kernel-mode and user-mode driver development specialist | `documentation` |

### Database

| Agent | Model | Focus | MCP servers |
|-------|-------|-------|-------------|
| **mongodb-expert** | sonnet | MongoDB database specialist | `documentation` |
| **prisma-expert** | sonnet | Prisma ORM specialist | `documentation` |
| **sql-expert** | sonnet | SQL specialist for database design, query optimization, stored procedures, and migrations across PostgreSQL, MySQL, Oracle,… | `database-query`, `documentation` |

### Testing

| Agent | Model | Focus | MCP servers |
|-------|-------|-------|-------------|
| **playwright-expert** | sonnet | Playwright E2E testing specialist | `documentation` |
| **python-integration-test-expert** | sonnet | Python integration testing specialist | `database-query`, `documentation` |
| **smoke-test-expert** | sonnet | Post-implementation smoke testing specialist with fix orchestration | `api-tester`, `database-query`, `docker-manager`, `documentation`, `log-analyzer` |
| **spring-boot-integration-test-expert** | sonnet | Spring Boot integration testing specialist | `documentation` |
| **vitest-expert** | sonnet | Vitest testing framework specialist | `documentation` |

### Cloud

| Agent | Model | Focus | MCP servers |
|-------|-------|-------|-------------|
| **cloud-expert** | sonnet | Cloud architecture and services specialist | `documentation` |

### Infrastructure

| Agent | Model | Focus | MCP servers |
|-------|-------|-------|-------------|
| **devops-expert** | sonnet | DevOps and infrastructure specialist | `docker-manager`, `documentation` |
| **docker-expert** | haiku | Docker and containerization specialist | `documentation` |
| **sysadmin-expert** | sonnet | Linux server and production infrastructure specialist | `docker-manager`, `documentation` |

### Mobile

| Agent | Model | Focus | MCP servers |
|-------|-------|-------|-------------|
| **android-native-expert** | opus | Native Android specialist focused on Jetpack Compose UI, the Android platform APIs (Activity lifecycle, Keystore +… | `documentation` |
| **ios-native-expert** | opus | Native iOS specialist focused on SwiftUI 6.x with @Observable, Swift Concurrency, the full iOS platform API surface (Keychain… | `documentation` |
| **kmp-expert** | opus | Kotlin Multiplatform + Compose Multiplatform specialist | `documentation` |
| **mobile-expert** | sonnet | Cross-platform mobile development specialist | `documentation` |

### Data & AI

| Agent | Model | Focus | MCP servers |
|-------|-------|-------|-------------|
| **data-engineering-expert** | sonnet | Python data engineering specialist | `documentation` |
| **rag-expert** | sonnet | Retrieval-Augmented Generation specialist | `documentation` |

### Security

| Agent | Model | Focus | MCP servers |
|-------|-------|-------|-------------|
| **security-expert** | sonnet | Security specialist for vulnerability detection, OWASP Top 10 compliance, and secure coding practices | `documentation`, `security-scanner` |

### Quality

| Agent | Model | Focus | MCP servers |
|-------|-------|-------|-------------|
| **contract-validator** | sonnet | Cross-validation specialist for contract-first workflows | `code-quality`, `documentation` |
| **integration-validator-expert** | sonnet | API integration validator with feedback loop orchestration | `api-explorer`, `documentation` |
| **open-source-expert** | sonnet | Open source readiness expert for project configuration, licensing, community health, and compliance | `code-quality`, `documentation` |
| **qa-expert** | sonnet | Quality Assurance expert for code quality, static analysis, and best practices | `code-quality`, `documentation` |

### Game Development

| Agent | Model | Focus | MCP servers |
|-------|-------|-------|-------------|
| **godot-csharp-expert** | sonnet | Godot 4.x .NET (C#) specialist | `documentation` |
| **sim-core-expert** | sonnet | Deterministic simulation core specialist | `code-quality`, `documentation` |
| **unity-expert** | opus | Unity game engine specialist for 2D and 3D development with C# | `documentation` |

### Industrial Automation

| Agent | Model | Focus | MCP servers |
|-------|-------|-------|-------------|
| **automation-architect** | opus | Designs automation strategies for bulk DCS/PLC engineering projects | — |
| **dcs-analyst** | sonnet | Analyzes DCS/PLC project files (ABB Freelance PRT, DMF, CSV; Siemens XML; Emerson FHX) | — |
| **freelance-engineer** | sonnet | ABB Freelance DCS engineering specialist | — |
| **membrane-expert** | sonnet | Reverse Osmosis (RO) and Electrodeionization (EDI) process expert for water treatment, desalination, ultrapure water, and… | `documentation` |

### Bitcoin / Lightning

| Agent | Model | Focus | MCP servers |
|-------|-------|-------|-------------|
| **bitcoin-core-expert** | sonnet | Bitcoin Core node operations specialist | `documentation` |
| **bitcoin-protocol-expert** | opus | Bitcoin protocol specialist | `documentation` |
| **bitcoin-testing-expert** | sonnet | Bitcoin testing infrastructure specialist | `documentation` |
| **bitcoin-wallet-expert** | sonnet | Bitcoin wallet design specialist | `documentation` |
| **lightning-expert** | opus | Lightning Network specialist | `documentation` |

> Bitcoin agents are domain experts: language-specific work (Rust/TS/Python/Go/JVM/.NET/C) routes to the matching language expert through skill detection. The `bitcoin/libraries/*` skills attach to that language expert when the project uses rust-bitcoin, bdk, ldk, bitcoinjs-lib, python-bitcoinlib, btcd, bitcoinj, NBitcoin or libwally.

### Messaging

| Agent | Model | Focus | MCP servers |
|-------|-------|-------|-------------|
| **messaging-expert** | sonnet | Message queue and event streaming specialist | `documentation` |

> MCP servers are never required. An agent works without them, losing only the
> tools that server provides.

<!-- END GENERATED: agents-reference -->

---

## Commands Reference

Slash commands available in Claude Code after initialization:

| Command | Description |
|---------|-------------|
| `/init-project` | Initialize dev-suite for a project (launches the dashboard wizard) |
| `/docs <technology> [topic]` | Access documentation for a technology |
| `/generate <type>` | Generate code scaffolding (components, APIs, tests) |
| `/show-config` | Display current dev-suite configuration |
| `/reconfigure` | Modify existing configuration (add/remove agents, MCP servers) |
| `/health-check` | Validate installation and diagnose issues |
| `/sync-dev-suite` | Update dev-suite components to latest version |
| `/reinstall-dev-suite` | Transactional erase-and-replace reinstall/sync (backup + rollback, orphan removal, per-file opt-out) |
| `/ui-wizard` | Launch configuration dashboard |
| `/uninstall` | Remove dev-suite components (interactive, preserves user content) |
| `/uninstall-dev-suite` | Full dev-suite removal with complete cleanup |

---

## Upgrading

### Via Dashboard (Recommended)

The easiest way to upgrade is through the **Updates** tab in the dashboard:

1. Open the dashboard: `./init-project.sh .`
2. Navigate to the **Updates** tab
3. Check the version panel — it shows the version installed in your project vs the version available from source
4. Click **Reinstall / Sync** to re-align the project to the current source

**Reinstall / Sync** performs a transactional erase-and-replace: managed
components are re-installed from source and orphaned ones removed, while your
custom agents/skills, `CLAUDE.md` notes, and `settings.json` keys are preserved.
Locally modified files are previewed with an **Overwrite / Keep** choice, a backup
is taken, and any failure rolls back automatically. Headless equivalent:
`/reinstall-dev-suite` or `npm run reinstall -- --project <path> --dry-run`.

### Manual Upgrade

```bash
# 1. Pull the latest dev-suite
cd dev-suite
git pull origin main

# 2. Rebuild all MCP servers
cd mcp-servers && npm install && npm run build

# 3. Sync installed projects (run in each project)
/path/to/dev-suite/init-project.sh /path/to/your-project
```

Then restart Claude Code to reload the updated MCP servers.

### From v1.0.x to v1.1.x

No breaking changes. Run the manual upgrade steps above. New components (agents, skills, MCP servers) added since your installation are surfaced automatically in the dashboard **Manage** tab with a one-click install option.

---

## Monorepo Support

Dev-Suite automatically detects monorepo structures:

```
my-project/
├── frontend/                  # React, Vue, etc.
│   └── package.json
├── backend/                   # Spring Boot, NestJS, etc.
│   └── pom.xml
└── docker-compose.yml
```

**Detected patterns**:
- Frontend: `frontend`, `client`, `web`, `app`, `*-frontend`
- Backend: `backend`, `server`, `api`, `*-backend`

The wizard generates `.dev-suite.json` with relative paths:

```json
{
  "project": {
    "isMonorepo": true,
    "frontendPath": "frontend",
    "backendPath": "backend"
  }
}
```

---

## Contributing

Contributions are welcome! To add new features:

### Adding a New MCP Server

1. Create directory: `mcp-servers/{server-name}/`
2. Add `package.json`, `metadata.json`, `src/index.ts`
3. Update `mcp-servers/package.json` workspaces
4. Build: `npm install && npm run build` from `mcp-servers/`

### Adding a New Agent

1. Create file: `agents/{category}/{name}-expert.md`
2. Add YAML frontmatter with skills and MCP servers
3. Write agent content (role, responsibilities, examples)

### Adding a New Skill

1. Create directory: `skills/{category}/{technology}/`
2. Add `SKILL.md` with skill definition
3. Optionally add `quick-ref/` guides

See [CLAUDE.md](CLAUDE.md) for detailed development guidelines.

---

## Troubleshooting

### Dashboard doesn't launch

- Check Node.js version: `node --version` (must be v20+)
- Check if MCP servers are built: `ls mcp-servers/*/dist/index.js`
- Check if port 3456 is in use: `netstat -an | findstr 3456` (Windows) or `lsof -i :3456` (Linux/macOS)
- Try rebuilding: `cd mcp-servers && npm install && npm run build`

### MCP servers not detected in Claude Code

- Verify `.mcp.json` exists in your project root and has valid JSON
- Check that all paths in `.mcp.json` are absolute
- Restart Claude Code after initialization
- Check that MCP server dist files exist: `ls .mcp-servers/*/dist/index.js`

### Agent not routing correctly

- Verify `CLAUDE.md` exists in your project root and contains agent routing rules
- Check that agent `.md` files exist in `.claude/agents/`
- Verify YAML frontmatter syntax in agent files

### Database MCP not connecting

- Check `DATABASE_URL` environment variable is set correctly
- Test the connection string manually: `psql $DATABASE_URL` (PostgreSQL)
- Ensure the database server is running

### Knowledge base not fetching docs

- Check Git is installed: `git --version`
- Verify internet connectivity (KB repo is on GitHub)
- Try forcing a refresh: ask Claude to `fetch_docs({ technology: "react", topic: "hooks", refresh: true })`
- Check cache directory permissions: `.kb-cache/`

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Questions or Issues?**

- 📖 Knowledge Base: [github.com/claude-dev-suite/knowledge_base](https://github.com/claude-dev-suite/knowledge_base)
- 🌐 Dashboard: `http://localhost:3456` (when running)
- 🔌 WebSocket: `ws://localhost:3457` (orchestrator)

---

**Built with ❤️ for Claude Code developers**
