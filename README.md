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
- **Update System** - Version visibility (installed vs. available) plus a transactional Reinstall / Sync that re-aligns a project to the current source
- **Analytics Dashboard** - Track knowledge base usage and correlate with executed jobs
- **121+ Technologies** - On-demand documentation via Git-based knowledge base

**Key Principle**: Dev-Suite is a **source repository** that initializes your projects. It lives alongside your projects and provides centralized resources that multiple projects can reference.

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

# Quick mode (auto-detect + apply best preset)
./init-project.sh /path/to/your-project --quick
```

The script will:
1. Check Node.js installation (v20+)
2. Build MCP servers if needed (`npm install && npm run build`)
3. Launch the web dashboard at `http://localhost:3456`
4. Guide you through a 5-step wizard to configure your project

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
- **One-Click Install**: Generates all config files (`.mcp.json`, `.dev-suite.json`, `CLAUDE.md`)

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
| **documentation** | 4 | Fetch docs for 121+ technologies via Git-based KB |
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

Domain experts with deep knowledge in specific technologies:

Specialized agents organized by domain:

#### Core Agents
- **architect** - Multi-domain system design & trade-offs across web/enterprise, low-level/systems (OS & kernels, embedded/RTOS, systems networking, storage engines, distributed consensus, virtualization, hardware-aware), AI-integrated systems (edge, serving topology, hybrid, gateways, agentic), and data-intensive platforms — discovers and loads the relevant domain skills on demand
- **code-reviewer** - Code quality, best practices, refactoring
- **python-expert** - Python 3.10-3.14, async patterns, package management, ruff, pydantic
- **typescript-expert** - TypeScript 5, advanced types, strict configuration
- **nodejs-expert** - Event loop, async patterns, streams, worker threads
- **accessibility-expert** - WCAG 2.2 compliance, ARIA patterns, screen reader compatibility, accessibility testing
- **dashboard-refactor-expert** - Dashboard React/TypeScript refactoring
- **claude-code-extension-expert** - Claude Code extensions, skills, hooks, MCP plugins
- **documentation-expert** - JSDoc, TSDoc, API documentation generation

#### Frontend Agents
- **react-expert** - React 19, hooks, performance optimization
- **nextjs-expert** - App Router, RSC, Server Actions, caching
- **vue-expert** - Vue 3, Composition API, Pinia
- **svelte-expert** - Svelte 5, SvelteKit, stores
- **angular-expert** - Angular 17+, signals, standalone components, SSR
- **electron-expert** - Cross-platform desktop apps, main/renderer process, IPC, auto-updates
- **tauri-expert** - Tauri desktop apps with Rust backend, IPC, plugins, code signing
- **ux-expert** - UX/UI design, visual hierarchy, design systems, interaction design, mobile UX, dark mode
- **creative-frontend-expert** - Advanced animation (Framer Motion, GSAP), Three.js/R3F, SVG animation, Canvas/WebGL, advanced CSS effects

#### Backend Agents
- **spring-boot-expert** - Spring Boot 3, JPA, Security, REST APIs
- **nestjs-expert** - Modules, guards, pipes, Prisma integration
- **fastapi-expert** - Python async, Pydantic, SQLAlchemy
- **streamlit-expert** - Streamlit Python web apps, session state, caching, multipage
- **rust-expert** - Actix-web, Axum, Rocket, Warp
- **go-expert** - Gin, Fiber, Echo, Chi
- **deno-expert** - Fresh, Oak, TypeScript-first runtime
- **dotnet-expert** - ASP.NET Core 8+, Entity Framework Core, Blazor, SignalR
- **cpp-expert** - Modern C++ (C++17/20/23), CMake, Google Test, clang-tidy, sanitizers
- **windows-driver-expert** - Windows kernel & user-mode drivers (KMDF/UMDF), HID filters, Indirect Display Drivers, WinDbg, driver signing

#### Data Agents
- **data-engineering-expert** - pandas, openpyxl, lxml, bulk data pipelines, Excel/XML/CSV, UTF-16 file formats
- **rag-expert** - Retrieval-Augmented Generation end-to-end: chunking, embeddings, vector stores (Pinecone/Weaviate/Qdrant/pgvector/ES), hybrid search, reranking, agentic RAG (Self-RAG/CRAG), graph RAG, multimodal RAG, evaluation (RAGAS/DeepEval), guardrails, LangChain/LlamaIndex/Haystack/DSPy

#### Industrial Agents
- **dcs-analyst** - ABB Freelance PRT/DMF/CSV file analysis, tag extraction, DCS reverse engineering
- **freelance-engineer** - ABB Freelance engineering file generation, PRT/DMF bulk templating
- **automation-architect** - DCS/PLC automation pipeline design, cross-platform strategies (ABB, Siemens, Emerson, Honeywell)
- **membrane-expert** - Reverse Osmosis and EDI process expertise for water treatment, desalination, ultrapure water, and pharma WFI (ASTM D4516 KPI normalization, fouling/scaling diagnostics, CIP planning, SEC/LCOW economics, regulatory citations)

#### Database Agents
- **prisma-expert** - Schema design, queries, migrations
- **sql-expert** - PostgreSQL, MySQL, query optimization
- **mongodb-expert** - Document modeling, aggregations, Spring Data MongoDB

#### Testing Agents
- **vitest-expert** - Unit testing, mocking, coverage
- **playwright-expert** - E2E testing, locators, assertions
- **spring-boot-integration-test-expert** - @SpringBootTest, Testcontainers
- **python-integration-test-expert** - pytest, testcontainers-python, pytest-django, FastAPI TestClient, factory_boy, Celery, Pact
- **smoke-test-expert** - Post-implementation verification, live HTTP testing, fix orchestration
- **qa-expert** - Test strategy, quality assurance

#### Infrastructure & Security
- **docker-expert** - Containerization, Compose, best practices
- **devops-expert** - CI/CD, GitHub Actions, deployment
- **security-expert** - OWASP, authentication, authorization

#### Quality & Open Source
- **integration-validator-expert** - API contract validation, frontend-backend alignment
- **open-source-expert** - OSS readiness, licensing, community health, compliance

#### Cloud & Mobile Agents
- **cloud-expert** - AWS, Azure, GCP, Terraform, serverless, API gateway, service mesh
- **mobile-expert** - React Native, Flutter, Expo, push notifications, payments
- **kmp-expert** - Kotlin Multiplatform + Compose Multiplatform across Android/iOS/Desktop/Wasm, Rust ↔ Kotlin/Swift bindings via UniFFI (incl. KMP fork), Gradle KMP, expect/actual, StateFlow + Voyager/Decompose + Koin, Bitcoin libs via UniFFI (BDK, LDK Node, LWK, CDK, Breez SDK Liquid)
- **android-native-expert** - Native Android with Jetpack Compose, Kotlin, Material 3 / Material You, Navigation Compose 2.8 type-safe routes, Hilt DI, Android Keystore + BiometricPrompt with crypto-object binding, EncryptedSharedPreferences, WorkManager (Hilt-injected), Foreground Services with Android 14+ types, NFC (NDEF/IsoDep/HCE), Universal/App Links, FileProvider, ProGuard/R8, Network Security Config + cert pinning, SQLCipher with Keystore-derived key
- **ios-native-expert** - Native iOS with SwiftUI 6.x + @Observable, Swift Concurrency, NavigationStack/SplitView with type-safe routes, Keychain Services with biometric SAC (.biometryCurrentSet), Secure Enclave P-256 keys, BGTaskScheduler app refresh + processing, Universal Links + custom URI schemes, App Groups, Share Extensions, Privacy Manifest (PrivacyInfo.xcprivacy), StoreKit 2, GRDB + SQLCipher, age + age-plugin-se for SEP-bound encrypted backups

#### Game Development Agents
- **unity-expert** - Unity 6 (2D and 3D), C#, MonoBehaviour lifecycle, ScriptableObjects, URP/HDRP, Shader Graph, Input System, UI Toolkit, Cinemachine, Addressables, DOTS/ECS, Netcode for GameObjects, AR Foundation, XR Interaction Toolkit, Sprite Atlas v2, Tilemap, 2D Animation, 2D Lights, Pixel Perfect Camera, platformer character controllers (coyote time, jump buffer)

**Engine-agnostic 2D art skills** (cross-loaded onto unity-expert today, ready for future godot-expert / phaser-expert): tile design (autotiling Wang/blob, hex/iso grids, terrain blending, 9-slice), pixel art fundamentals (anti-aliasing rules, dithering patterns, outline philosophy, pixel hinting), palettes (color theory, restricted palettes from PICO-8 to AAP-64, hue shifting, palette swaps), seamless textures (offset-paint, normal map authoring, repetition reduction), animation frames (walk cycles, attack anticipation, frame counts, sub-pixel motion), tools (Aseprite, Tiled, LDtk, Tilesetter, Pixelorama, Spine, TexturePacker, Sprite Lamp), 2D lighting art (workflow for 2D Lights, normal maps, emissive layers, day/night), VFX (smoke/fire/water/electricity frame patterns, hitstop, screen shake, juice principles), environment design (parallax planning, atmospheric perspective, environmental storytelling), character design (silhouette-first, expressions in low-res, faction visual language).

#### Bitcoin / Lightning / L2 Agents
- **bitcoin-protocol-expert** - Consensus, transactions, scripts (P2PK→P2TR+Tapscript), SegWit, Taproot, PSBT, descriptors, Miniscript, P2P (BIP155/152/157/158/324), package relay (BIP331), TRUC v3 (BIP431), message signing (BIP137/322), proposals (CTV/APO/OP_VAULT/CAT/drivechains), cryptography (secp256k1, Schnorr BIP340, MuSig2 BIP327, FROST, adaptor sigs, DLCs), metaprotocols (Ordinals/Inscriptions/BRC-20/Runes/Atomicals)
- **bitcoin-core-expert** - bitcoin.conf, JSON-RPC, REST, ZMQ notifications, indexes (txindex/blockfilterindex/coinstatsindex), pruning, descriptors wallet, signet, Tor/I2P/CJDNS, Guix reproducible builds, Bitcoin Knots, integration with Electrs/Fulcrum/Esplora/mempool.space/BTCPay, self-hosted node distros (Umbrel/Start9/RaspiBlitz/MyNode/Citadel)
- **lightning-expert** - All BOLT specs, channel state machines, HTLCs, onion routing (Sphinx), gossip, watchtowers, splicing, taproot channels, LND/CLN/LDK/Eclair/Greenlight/phoenixd, BOLT12 offers, LNURL, Lightning Address, LSP (BLIPs), WebLN, NWC (NIP-47), UMA, trampoline, MPP/AMP, Loop/Pool/Lit, submarine swaps (Boltz), security (replacement cycling, channel jamming, pinning), Taproot Assets / RGB on Lightning, consumer wallets (Phoenix, Mutiny, Breez, Zeus, Aqua, BlueWallet)
- **bitcoin-wallet-expert** - HD wallets (BIP32/39/44/49/84/86), output descriptors, PSBT signing flows (BIP174/370/371), multisig coordination, time-locked vaults (CSV, OP_VAULT), coin selection (BnB / SRD / waste metric), fee estimation, RBF/CPFP, hardware wallet integration (Trezor, Ledger, Coldcard, BitBox02, Jade, Passport, SeedSigner, Krux, Keystone, Specter DIY, HWI), privacy (CoinJoin / PayJoin / Silent Payments BIP352 / BIP47 PayNyms), payment standards (BIP21, BIP329, BIP85, SLIP-39, SeedQR)
- **bitcoin-testing-expert** - regtest, signet (incl. Mutinynet 30s blocks for fast LN dev), Polar (LN regtest GUI), Nigiri (full stack regtest with Esplora), Bitcoin Core's Python functional test framework, fuzzing (libFuzzer + cargo-fuzz on rust-bitcoin/bdk/secp256k1), property-based testing (proptest, hypothesis)

L2 / metaprotocols / mining / hardware / infrastructure / library knowledge is delivered via skills loaded onto the appropriate agents (Bitcoin domain agents OR language-experts via detection). Covers: ARK/ARKADE, Spark (Lightspark), Liquid, Taproot Assets, RGB, Stacks, Rootstock, Fedimint, Cashu, Citrea, Strata, BSquared, Bitlayer, Merlin, Botanix, BOB, Hemi, MAP, Babylon, BitVM/BitVM2/BitVM3, threshold-tBTC, drivechains/spacechains; Ordinals/Inscriptions/BRC-20/Runes/Atomicals; Stratum V1/V2 + decentralized pools; major HW vendors + DIY signers; Electrs/Fulcrum/Esplora/mempool.space/BTCPay/Specter/Sparrow; libraries across Rust (rust-bitcoin, BDK, LDK, miniscript, rust-dlc), TypeScript (bitcoinjs-lib, @scure/btc-signer, mempool.js, bcoin), Python (python-bitcoinlib, embit, BDK-Python, bitcoinlib, hdwallet), Go (btcd, btcsuite, lnd, tapd), JVM (bitcoinj, bdk-jvm), .NET (NBitcoin), C (libsecp256k1, libwally, libbitcoin).

#### Messaging & Performance
- **messaging-expert** - Kafka, RabbitMQ, NATS, SQS, event-driven architecture
- **performance-expert** - Profiling, optimization, bottlenecks
- **log-analyst** - Log analysis, debugging, observability

See [Agents Reference](#agents-reference) for trigger keywords and skills.

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

The knowledge base provides **on-demand documentation for 121+ technologies** via a separate Git repository: [github.com/claude-dev-suite/knowledge_base](https://github.com/claude-dev-suite/knowledge_base)

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
│  121+ technologies, fetched via MCP server  │  On-demand, cached 2 hours
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
| Linux    | x64          | `Dev-Suite-Dashboard-x.y.z.AppImage` | Portable, all distros (incl. Fedora / RHEL) |
| Linux    | x64          | `dev-suite-dashboard_x.y.z_amd64.deb` | Debian / Ubuntu / Mint |

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
chmod +x Dev-Suite-Dashboard-*.AppImage
./Dev-Suite-Dashboard-*.AppImage
```

If the AppImage refuses to run on a system without FUSE 2 (Ubuntu 22.04+, Fedora 38+), install it with `sudo apt install libfuse2` or extract and run instead:
```bash
./Dev-Suite-Dashboard-*.AppImage --appimage-extract-and-run
```

#### Linux — Debian / Ubuntu / Mint (`.deb`)

```bash
sudo dpkg -i dev-suite-dashboard_*_amd64.deb
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

Launches web dashboard at `http://localhost:3456` with 5-step wizard:
1. **Detection** - Auto-detect stack, databases, Git provider
2. **Agents** - Select specialized experts (pre-selected based on stack)
3. **MCP Servers** - Select tools (pre-selected based on stack)
4. **Environment** - Configure database URLs, API tokens
5. **Install** - Generate config files and copy components

### Quick Mode

```bash
./init-project.sh /path/to/project --quick
```

Auto-detects stack and applies best-matching preset with minimal prompts.

### Non-Interactive Mode

```bash
./init-project.sh /path/to/project --non-interactive --project-type fullstack
```

Uses detected values or defaults, no user input required.

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

After initialization, your project will contain:

```
your-project/
├── .mcp.json                    # MCP server configuration
├── .dev-suite.json              # Stack and component configuration
├── CLAUDE.md                    # Agent routing rules (auto-generated)
├── .claude/
│   ├── agents/                  # Selected specialized agents
│   ├── skills/                  # Related skills
│   └── commands/                # Slash commands (/init-project, /docs, etc.)
└── .mcp-servers/                # Installed MCP servers (built from dev-suite)
    ├── documentation/
    ├── database-query/
    └── ...
```

### `.dev-suite.json` Example

```json
{
  "version": "1.0.0",
  "project": {
    "name": "my-app",
    "type": "fullstack",
    "isMonorepo": false
  },
  "mcpServers": [
    "documentation",
    "database-query",
    "docker-manager",
    "api-tester",
    "dashboard-bridge"
  ],
  "stacks": {
    "frontend": {
      "framework": "react",
      "metaFramework": "nextjs",
      "styling": "tailwindcss",
      "stateManagement": "zustand+tanstack-query"
    },
    "backend": {
      "runtime": "nodejs",
      "framework": "nestjs",
      "apiStyle": "rest"
    },
    "database": {
      "type": "postgresql",
      "orm": "prisma"
    },
    "testing": {
      "unit": "vitest",
      "e2e": "playwright"
    }
  },
  "git": {
    "provider": "github",
    "repository": "https://github.com/owner/my-app",
    "tokenEnvVar": "GITHUB_TOKEN"
  },
  "agents": {
    "enabled": [
      "architect",
      "code-reviewer",
      "react-expert",
      "nextjs-expert",
      "nestjs-expert",
      "prisma-expert",
      "vitest-expert",
      "playwright-expert",
      "docker-expert"
    ]
  }
}
```

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

Fetch on-demand documentation for 121+ technologies via Git-based knowledge base.

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

**Configuration**: API endpoints configured via `.dev-suite.json` or auto-detected from OpenAPI specs.

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

### Core Agents

| Agent | Triggers | Skills | MCP Servers |
|-------|----------|--------|-------------|
| **architect** | architecture, design, scalability, trade-offs, systems, AI, data | clean-code, solid-principles (core) + web/enterprise, `systems/*`, `ai-systems/*` on demand | documentation, api-explorer, skill-loader |
| **code-reviewer** | review, code quality, refactor, best practices | clean-code | code-quality |
| **typescript-expert** | TypeScript, types, generics | typescript | documentation |
| **nodejs-expert** | Node.js, npm, modules | nodejs | documentation |
| **documentation-expert** | JSDoc, TSDoc, API docs, README | tsdoc, jsdoc | documentation |
| **python-expert** | Python, async, typing, uv, poetry | python | documentation |
| **accessibility-expert** | a11y, WCAG, ARIA, keyboard navigation | wcag | documentation |
| **log-analyst** | logs, debugging, errors, stack traces | logging | log-analyzer |
| **performance-expert** | performance, profiling, optimization, bottleneck | performance | performance-profiler |

### Frontend Agents

| Agent | Triggers | Skills | MCP Servers |
|-------|----------|--------|-------------|
| **react-expert** | React, components, hooks, JSX | react, tanstack-query, zustand | documentation, code-quality |
| **nextjs-expert** | Next.js, App Router, Server Components | nextjs | documentation |
| **vue-expert** | Vue, Composition API, Pinia | vue, nuxt | documentation |
| **svelte-expert** | Svelte, SvelteKit, stores | svelte, sveltekit | documentation |
| **electron-expert** | Electron, desktop apps | electron | documentation |
| **tauri-expert** | Tauri, Rust desktop apps | tauri | documentation |
| **angular-expert** | Angular, signals, standalone, SSR, NgRx | angular, angular-routing, angular-forms, angular-http, angular-testing, angular-material, angular-ssr, ngrx, typescript | documentation |
| **ux-expert** | UX/UI design, visual hierarchy, typography, color systems, design tokens, dark mode, interaction design, mobile UX, form UX, loading states, ethical design | ux-visual-hierarchy, ux-design-systems, ux-interaction-design, tailwindcss, shadcn-ui, wcag | documentation |
| **creative-frontend-expert** | Advanced animation, Framer Motion, GSAP + ScrollTrigger, Three.js, React Three Fiber, SVG animation, Canvas 2D, WebGL, CSS clip-path/masks/scroll-driven/Houdini | framer-motion, gsap, three-js, svg-animation, canvas-webgl, advanced-css-effects | documentation |

### Backend Agents

| Agent | Triggers | Skills | MCP Servers |
|-------|----------|--------|-------------|
| **spring-boot-expert** | Spring Boot, @Entity, @Controller, @Service | spring-boot, spring-data-jpa, spring-security | documentation, api-tester |
| **nestjs-expert** | NestJS, modules, guards, pipes | nestjs, prisma | documentation, api-tester |
| **fastapi-expert** | FastAPI, Pydantic, async Python | fastapi, sqlalchemy | documentation, api-tester |
| **rust-expert** | Rust, Actix-web, Axum, Rocket, Warp | rust, actix-web, axum | documentation |
| **go-expert** | Go, Gin, Fiber, Echo, Chi | go, gin, fiber | documentation |
| **deno-expert** | Deno, Fresh, Oak | deno, fresh | documentation |
| **dotnet-expert** | ASP.NET Core, EF Core, Blazor, SignalR, C# | aspnet-core, aspnet-minimal-api, aspnet-middleware, aspnet-signalr, aspnet-blazor, aspnet-identity, aspnet-validation, entity-framework-core, csharp, xunit | documentation, api-tester |
| **cpp-expert** | C++17/20/23, RAII, smart pointers, templates, CMake, Google Test, clang-tidy | cpp, cmake, googletest, cpp-quality, cpp-security | documentation, code-quality |
| **windows-driver-expert** | WDF, KMDF, UMDF, HID filter, IDD virtual display, IRP/IOCTL, WinDbg, driver signing | cpp, cmake, cpp-quality, cpp-security, wdf-kmdf, wdf-umdf, hid-input-filter, indirect-display, driver-debugging, driver-signing | documentation |

### Database Agents

| Agent | Triggers | Skills | MCP Servers |
|-------|----------|--------|-------------|
| **prisma-expert** | Prisma, schema, migrations | prisma | documentation |
| **sql-expert** | SQL, PostgreSQL, MySQL, queries | postgresql, mysql | documentation, database-query |
| **mongodb-expert** | MongoDB, aggregations, Spring Data MongoDB | mongodb, spring-data-mongodb | documentation |

### Testing Agents

| Agent | Triggers | Skills | MCP Servers |
|-------|----------|--------|-------------|
| **vitest-expert** | Vitest, Jest, unit tests, describe | vitest | documentation, code-quality |
| **playwright-expert** | Playwright, E2E, page.goto, locator | playwright | documentation |
| **spring-boot-integration-test-expert** | @SpringBootTest, @DataJpaTest, Testcontainers | spring-boot-test, testcontainers | documentation |
| **python-integration-test-expert** | pytest integration, testcontainers python, pytest-django, FastAPI test, factory_boy, celery test, pact python | python-integration, testcontainers-python, pytest-django, fastapi-testing, factory-boy | documentation |
| **smoke-test-expert** | smoke test, verify implementation, test endpoints, end-to-end verification | smoke-test, rest-assured, testcontainers | api-tester, database-query, docker-manager, log-analyzer, documentation |

### Infrastructure & DevOps

| Agent | Triggers | Skills | MCP Servers |
|-------|----------|--------|-------------|
| **docker-expert** | Docker, Dockerfile, docker-compose, containers | docker, docker-compose | docker-manager |
| **devops-expert** | CI/CD, GitHub Actions, GitLab CI, deployment | github-actions, ci-cd | docker-manager |

### Messaging Agents

| Agent | Triggers | Skills | MCP Servers |
|-------|----------|--------|-------------|
| **messaging-expert** | Kafka, RabbitMQ, NATS, SQS, event streaming | kafka, rabbitmq, nats | documentation |

### Quality & Open Source Agents

| Agent | Triggers | Skills | MCP Servers |
|-------|----------|--------|-------------|
| **qa-expert** | QA, test strategy, quality assurance | testing-strategy | documentation |
| **integration-validator-expert** | API contracts, frontend-backend alignment | integration-validation | documentation, api-explorer |
| **open-source-expert** | OSS, licensing, community health, compliance | open-source | documentation, code-quality |

### Security Agent

| Agent | Triggers | Skills | MCP Servers |
|-------|----------|--------|-------------|
| **security-expert** | security, authentication, authorization, JWT | jwt, oauth2, owasp, secrets-management | security-scanner, documentation |

### Mobile Agents

| Agent | Triggers | Skills | MCP Servers |
|-------|----------|--------|-------------|
| **kmp-expert** | Kotlin Multiplatform, KMP, Compose Multiplatform, expect/actual, iosMain/commonMain, UniFFI, BDK/LDK/LWK/CDK/Breez SDK KMP bindings, Voyager, Decompose, Koin, SQLDelight, Material 3 cross-platform, Gradle KMP, XCFramework, CocoaPods/SwiftPM | languages/kotlin, languages/swift, languages/uniffi, mobile/kotlin-multiplatform, frontend-frameworks/compose-multiplatform | documentation |
| **android-native-expert** | Jetpack Compose, @Composable, ViewModel, Hilt, Navigation Compose, Material You / Dynamic Color, Android Keystore, KeyGenParameterSpec, BiometricPrompt, EncryptedSharedPreferences, WorkManager, Foreground Service, NFC, HCE, App Links, FileProvider, ProGuard, R8, SQLCipher | languages/kotlin, mobile/jetpack-compose, mobile/android-native, databases/sqlcipher, security/libsodium, security/age-encryption | documentation |
| **ios-native-expert** | SwiftUI, @Observable, NavigationStack, NavigationSplitView, @AppStorage, @SceneStorage, @FocusState, Keychain Services, Secure Enclave, BGTaskScheduler, Universal Links, App Groups, Share Extension, Privacy Manifest, StoreKit 2, GRDB SQLCipher, age-plugin-se | languages/swift, mobile/ios-native, databases/sqlcipher, security/libsodium, security/age-encryption | documentation |

### Game Development Agents

| Agent | Triggers | Skills | MCP Servers |
|-------|----------|--------|-------------|
| **unity-expert** | Unity, MonoBehaviour, ScriptableObject, prefab, URP, HDRP, Shader Graph, Tilemap, Sprite Atlas, Cinemachine, Addressables, DOTS, ECS, Netcode for GameObjects, AR Foundation, XR Interaction Toolkit, Pixel Perfect Camera | csharp, unity-core, unity-rendering, unity-input-ui, unity-physics-anim, unity-addressables, unity-performance, unity-dots, unity-netcode, unity-xr, unity-editor-tooling, unity-testing, unity-build-platforms, unity-best-practices, unity-2d-core, unity-2d-tilemap, unity-2d-physics, unity-2d-animation, unity-2d-lighting, unity-2d-cameras, unity-2d-gameplay | documentation |

> Optional external integrations (not bundled): **CoplayDev/unity-mcp** (MIT) or **IvanMurzak/Unity-MCP** (Apache-2.0) — open-source MCP servers that expose the Unity Editor (scenes, scripts, assets, profiler, builds) to Claude Code. Install separately if you want the AI to drive the Editor directly.

### Bitcoin / Lightning / L2 Agents

| Agent | Triggers | Skill families | MCP Servers |
|-------|----------|----------------|-------------|
| **bitcoin-protocol-expert** | Bitcoin protocol, consensus, BIP, soft fork, script, Taproot, PSBT, descriptors, Miniscript, sighash, Schnorr, MuSig2, FROST, DLC, Ordinals, Runes, BRC-20, package relay, TRUC, BIP324, BIP137/322 | bitcoin/protocol/*, bitcoin/cryptography/*, bitcoin/metaprotocols/* | documentation |
| **bitcoin-core-expert** | bitcoind, bitcoin.conf, RPC, ZMQ, txindex, blockfilterindex, descriptors wallet, Tor, signet, Electrs, Fulcrum, Esplora, mempool.space, BTCPay, Umbrel, Start9, RaspiBlitz | bitcoin/core/*, bitcoin/protocol/p2p, bitcoin/protocol/descriptors, bitcoin/infrastructure/* | documentation |
| **lightning-expert** | Lightning, LN, BOLT, channel, HTLC, onion, gossip, LND, CLN, LDK, Eclair, BOLT12, LNURL, Lightning Address, LSP, WebLN, NWC, UMA, Loop, Pool, splicing, Taproot channels, replacement cycling, channel jamming, Phoenix, Mutiny, Breez, Greenlight, phoenixd | bitcoin/lightning/* (full BOLT + impl + app + security + consumer-wallets) | documentation |
| **bitcoin-wallet-expert** | wallet, HD, BIP32/39/44/49/84/86, descriptor, PSBT, multisig, vault, RBF, CPFP, coin selection, fee bumping, hardware wallet, Trezor, Ledger, Coldcard, BitBox, Jade, Passport, SeedSigner, Krux, HWI, CoinJoin, PayJoin, Silent Payments, BIP47 PayNyms, BIP21, BIP329, BIP85, SLIP-39, SeedQR | bitcoin/wallets/*, bitcoin/hardware/*, bitcoin/privacy/*, bitcoin/protocol/{psbt,descriptors,miniscript,message-signing}, bitcoin/cryptography/{bip32,musig2} | documentation |
| **bitcoin-testing-expert** | regtest, signet, Mutinynet, Polar, Nigiri, Bitcoin Core test framework, fuzz, libFuzzer, cargo-fuzz, proptest, hypothesis, property-based | bitcoin/testing/*, bitcoin/core/{rpc,operations}, bitcoin/protocol/{psbt,descriptors} | documentation |

> Bitcoin agents are domain-experts — language-specific work (Rust/TS/Python/Go/JVM/.NET/C) routes to the existing language-experts via skill detection. Skills `bitcoin/libraries/*` are loaded onto the matching language-expert when projects use those libraries (rust-bitcoin / bdk / ldk / bitcoinjs-lib / @scure/btc-signer / python-bitcoinlib / btcd / bitcoinj / NBitcoin / libwally / etc.).

---

## Commands Reference

Slash commands available in Claude Code after initialization:

| Command | Description |
|---------|-------------|
| `/init-project [preset]` | Initialize dev-suite for a project with optional preset |
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
