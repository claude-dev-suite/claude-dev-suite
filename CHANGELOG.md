# Changelog

All notable changes to dev-suite are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

---

## [1.3.0] - 2026-04-18

### Added

- **`list_docs` tool for documentation MCP server**: new tool that returns a compact catalog of all available KB articles (`{ technology: [topics...] }`), optionally filtered by category (24 categories: frontend, backend, rag, retrieval, embeddings, vector-stores, document-processing, rag-frameworks, rag-ops, etc.). Enables agent-driven retrieval — agents call `list_docs()` to discover what knowledge is available, then `fetch_docs(technology, topic)` to retrieve specific articles. Server version bumped to 2.4.0.
- **Knowledge Base Protocol for all agents**: updated 46 agent files — replaced `mcp__documentation__fetch_docs` with `mcp__documentation__*` wildcard in frontmatter (access to all documentation tools), and replaced the old `## Documentation Loading Protocol` section with a concise `## Knowledge Base Protocol` that instructs agents to call `list_docs()` for KB discovery before fetching deep-dive articles.
- **Knowledge base stubs for rag-expert skills (Phase 1)**: registered 85 new technologies in the `documentation` MCP server index across 7 new category files (`rag.ts`, `retrieval.ts`, `embeddings.ts`, `vector-stores.ts`, `document-processing.ts`, `rag-frameworks.ts`, `rag-ops.ts`) totalling 283 supported technologies. Pushed matching 85 stub `overview.md` files to the `claude-dev-suite/knowledge_base` repo (one per skill), cross-referencing the corresponding `SKILL.md` cheat-sheet and upstream canonical docs. Phase 2+ will replace stubs with full tutorials, benchmarks, paper summaries, troubleshooting, and migration guides.
- **rag-expert agent**: new deep-expertise agent for Retrieval-Augmented Generation systems. Comprehensive knowledge base across the full RAG stack. **Architecture & retrieval**: naive → advanced → agentic RAG, Self-RAG/CRAG/Adaptive, chunking strategies (recursive, semantic, contextual, parent-child, proposition-based, late chunking), query transformations (HyDE, multi-query, RAG-fusion, step-back, sub-query decomposition, self-querying, routing), hybrid search + RRF, advanced retrieval (parent-document, small-to-big, RAPTOR, auto-merging). **Retrieval algorithms**: ColBERT, SPLADE, BM25 deep tuning, RankGPT, cross-encoder training, Cohere/Voyage/BGE/Jina reranking. **Conversational/specialized**: conversational RAG with memory, streaming with citations, personalization, time-aware retrieval, tabular (NL2SQL hybrid), long-context vs RAG, feedback loops. **Graph RAG**: Microsoft GraphRAG, HippoRAG, entity resolution, knowledge graph construction, ontology-guided retrieval. **Multimodal**: vision, tables, audio (Whisper/AssemblyAI/Deepgram), video (keyframe + transcript). **Embeddings**: OpenAI/Voyage/Cohere/BGE/E5/Jina/Nomic/mxbai, multilingual, Matryoshka, fine-tuning, hard-negative mining, drift detection, semantic dedup. **Vector stores**: pgvector, Qdrant, Weaviate, Pinecone, Milvus, Redis, LanceDB, MongoDB Atlas, ChromaDB, OpenSearch, Vespa, Elasticsearch, ANN algorithms, quantization. **Ingestion**: PDF/DOCX/PPTX/XLSX/EML/audio/video/markdown/web-scraping, Airflow/Prefect/Dagster orchestration, Debezium/Kafka CDC. **Evaluation**: RAGAS, DeepEval, TruLens, ARES, Giskard RAGET, continuous evaluation in CI, shadow-mode deployment. **Guardrails/security**: hallucination detection, forced citations, NeMo Guardrails, PII redaction (Presidio), multi-tenant isolation, GDPR, indirect prompt injection. **Ops/infra**: TEI/Triton GPU serving, batch inference (OpenAI/Anthropic batches), cost allocation, multi-region deployment, LLM gateways (Portkey/OpenRouter/LiteLLM). **Frameworks**: LangChain 0.3+, LlamaIndex 0.12+, Haystack 2.x, DSPy 2.5+, LangGraph, Ragatouille, R2R, Canopy, txtai. **Observability**: LangSmith, Langfuse, Arize Phoenix, Comet Opik, OpenTelemetry GenAI. Ships with new skill categories: `skills/rag/`, `skills/retrieval/`, `skills/embeddings/`, `skills/vector-stores/`, `skills/document-processing/`, `skills/rag-frameworks/`, `skills/rag-ops/`.
- **Native Android / Kotlin detection**: `detection.service.ts` now recognizes Android modules (`com.android.application` / `com.android.library` plugins, including `libs.versions.toml` aliases) and classifies them as `mobile` projects with `frontend.framework = 'android-native'` and `runtime = 'kotlin'`. Detects **Room** (mapped to `dbType: 'sqlite'`, `orm: 'room'`), **Jetpack Compose**, and Kotlin as additional technologies. Java/Spring detection is skipped on Android modules so they're no longer mislabeled as JVM backends. New stack-to-agent mappings route Android projects to `mobile-expert`.
- **Project Rules wizard step**: a new step 4 in the installation wizard lets users select behavioral rules for Claude Code agents. Rules are copied to `.claude/rules/` in the target project and tracked in `.dev-suite.json`. Five templates are bundled: Conventional Commits ⭐, Semantic Versioning ⭐, Branch Protection, Changelog Maintenance ⭐, README Accuracy ⭐ (starred = pre-selected as recommended).
- **Remember last project folder**: the splash screen now pre-fills the last successfully opened project path on startup. The path is persisted in `dev-suite-prefs.json` inside the Electron user-data directory and validated (existence check) before use.
- **sysadmin-expert agent**: new agent for production server configuration covering Nginx, Caddy, Traefik, SSL/TLS (Let's Encrypt), DNS, UFW/fail2ban, systemd, WireGuard VPN, Prometheus/Grafana monitoring, backup strategies, server hardening, email infrastructure (SPF/DKIM/DMARC), zero-downtime deployments, load balancing, and WAF. Ships with 17 new skill files under `skills/infrastructure/`.

---

## [1.2.2] - 2026-04-04

### Fixed

- **Project selector — WSL Linux paths**: `validateProjectPath` in the Electron main process now correctly handles Windows UNC paths (`\\wsl$\Ubuntu\...`, `\\wsl.localhost\Ubuntu\...`) — backslashes are no longer corrupted by the forward-slash normalization, and traversal checks skip the server+share prefix as required by the UNC spec.
- **Project selector — manual path input**: the path field in the splash screen is now editable; users can type or paste any path (including WSL UNC paths) directly without having to use the Browse dialog. A WSL example hint is shown below the field.
- **Project selector — window too small**: splash window enlarged from 400×340 to 520×400.
- **Agent selection — checkbox click doesn't toggle**: clicking the checkbox element inside an agent card was calling `onToggleAgent` twice (once from `Checkbox.onChange` and once from the bubbled `Card.onClick`), causing the selection to double-toggle and appear broken. Fixed by making the Checkbox `pointer-events-none` so the Card's single `onClick` handler is the only toggle trigger.
- **Workflow template dropdown**: secondary subtasks (`{testing}`, `qa-expert`) are now marked `optional: true` — workflows like *Frontend Feature*, *Backend Feature*, *Full Stack Feature*, *Bug Fix*, and *Code Review* are no longer grayed out when a testing/QA agent isn't installed. Compatible workflows with skipped optional agents show a hint in the dropdown (e.g. `"Frontend Feature (no testing)"`). Adds `skippedAgents` tracking to `ResolvedWorkflow`.
- **Files viewer — "cannot load file" on Markdown and other files**: Shiki syntax highlighter now has a top-level `try/catch`; if the dynamic import or highlighting fails (e.g. inside Electron's asar bundle), the file content is rendered as escaped plain text instead of showing an error.

---

## [1.1.2] - 2026-04-03

### Added

- **creative-frontend-expert** agent — advanced animation (Framer Motion, GSAP), Three.js/R3F, SVG animation, Canvas/WebGL, advanced CSS effects
- **6 New Skills** — `animation/framer-motion`, `animation/gsap`, `graphics/three-js`, `graphics/svg-animation`, `graphics/canvas-webgl`, `styling/advanced-css-effects`
- **Files viewer API** — new `files.routes.ts` with read-only project file browsing endpoints

### Fixed

- **MCP server preparation** (`/prepare-servers`): route was ignoring the `failed[]` return value and always responding `success: true` even when individual servers failed to build
- **Install error message**: `Step5Install` was swallowing the real backend error and showing a generic message; now surfaces the actual error from the response body
- **Electron packaged app**: `prepareServers()` was attempting `npm install` on the pre-built `resources/dev-suite/mcp-servers/` directory (no `node_modules`, potentially read-only), throwing "Failed to install MCP dependencies" before installation even started; now skips npm install when all requested server `dist/index.js` files already exist
- **MCP server `npm install`**: `installMcpServer()` invoked npm via `npm.cmd` which looks for `npm-cli.js` relative to itself — unreliable in Electron where the bundled node's `node_modules/npm/` may be stripped; now calls `npm-cli.js` directly via `process.execPath`, falling back to system npm
- **Orchestrator path validation**: projects outside the home directory or on a different drive (e.g. `D:\projects\...`) were rejected with "Path must be within allowed workspace directories"; fixed by adding `PROJECT_PATH` (set by Electron at launch) to allowed roots and making comparisons case-insensitive on Windows
- **TypeScript build errors** (pre-existing, blocked CI): `useEffect` TDZ in `LivePerformancePanel`, `useRef` React 19 regression in `useOrchestratorWebSocket`, `unknown`-typed `summary`/`st` in `OrchestratorPanel`

---

## [1.1.1] - 2026-03-15

### Added

- **Python Integration Testing** — Complete Python integration testing infrastructure
  - **1 New Agent**
    - `python-integration-test-expert` — pytest, testcontainers-python, pytest-django, FastAPI TestClient, factory_boy, Celery testing, respx/responses/pytest-httpserver HTTP mocking, Pact contract testing
  - **5 New Skills**
    - `testing/python-integration` — Test pyramid, conftest.py architecture, pytest markers, GitHub Actions CI/CD, pytest-xdist parallel execution
    - `testing/testcontainers-python` — All container modules (PostgreSQL, MySQL, MongoDB, Redis, Kafka, RabbitMQ), wait strategies, async support, Docker Compose
    - `testing/pytest-django` — All `@pytest.mark.django_db` options, fixtures (db, client, rf, settings, mailoutbox, django_assert_num_queries), DRF APIClient, async views, factory_boy integration
    - `testing/fastapi-testing` — TestClient, AsyncClient/anyio, dependency overrides, JWT auth, WebSocket, file upload, HTTP mocking (respx, responses, pytest-httpserver)
    - `testing/factory-boy` — All declarations (Faker, Sequence, SubFactory, RelatedFactory, Trait, post_generation, Maybe, Dict), DjangoModelFactory, SQLAlchemyModelFactory
  - **7 Quick-Refs** added to `skills/testing/pytest/quick-ref/`
    - `testcontainers-python.md`, `integration-patterns.md`, `sqlalchemy-fixtures.md`, `alembic-testing.md`, `redis-kafka-testing.md`, `pact-python.md`, `grpc-testing.md`
  - **15 Knowledge Base files** across 7 new directories
    - `testcontainers-python/` — basics, databases (SQLAlchemy 2.0 savepoint, Alembic, async), messaging (Kafka, RabbitMQ, Celery)
    - `pytest-django/` — basics (all fixtures), advanced (DRF, async views, factory_boy, signals, management commands, Django Channels)
    - `fastapi-testing/` — basics, async (AsyncClient, anyio, lifespan), http-mocking (respx, responses, pytest-httpserver)
    - `factory-boy/` — basics (all declarations), advanced (traits, pytest-factoryboy, complex chains)
    - `celery-testing/` — pytest plugin, all fixtures, chains/chords/groups, retry, signals, Django integration
    - `python-integration-testing/` — patterns (test pyramid, CI/CD, xdist), sqlalchemy (savepoint isolation), alembic (migration testing)
    - `pact-python/` — consumer-driven contract testing, all matchers, provider verification, Pact Broker, V3 message pacts
  - **docs-index** updated — 7 new technologies registered in `mcp-servers/documentation/src/docs-index/testing.ts`

### Fixed



- **CI/CD** — E2E workflow now installs server dependencies and builds frontend before running Playwright tests
- **CI/CD** — E2E workflow uses 6-way sharding to stay within timeout limits
- **E2E Fixture** — Fixed race condition where `mainPage` fixture could capture DevTools window instead of the app window
- **CI/CD** — CI workflow now installs server dependencies before TypeScript build
- **Security** — Fixed 13 ReDoS vulnerabilities in codegen spec parsers (OpenAPI, AsyncAPI, TypeSpec, Protobuf, BPMN)
- **Security** — Fixed path-injection in `management.service.ts` `updateClaudeMd()` with `resolveProjectPath()` validation
- **Security** — Fixed path-injection in `code-review.routes.ts` with path containment check for file diffs

### Added

- **DriftWire / Industrial Automation Integration** — Full support for Python DCS/PLC engineering projects
  - **5 New Agents**
    - `streamlit-expert` — Streamlit UI specialist (session state, caching, forms, multipage, Docker, testing)
    - `data-engineering-expert` — pandas, openpyxl, lxml, bulk data pipelines, Excel/XML/CSV, UTF-16 file formats
    - `dcs-analyst` — ABB Freelance PRT/DMF/CSV file analysis, tag extraction, DCS reverse engineering (Opus model)
    - `freelance-engineer` — ABB Freelance engineering file generation, PRT/DMF bulk templating (Opus model)
    - `automation-architect` — DCS/PLC automation pipeline design, cross-platform (ABB, Siemens, Emerson, Honeywell) (Opus model)
  - **10 New Skills**
    - `backend-frameworks/streamlit` — Complete Streamlit reference (layout, widgets, caching, config, secrets, Docker)
    - `data-validation/pydantic` — Pydantic v2 (BaseModel, validators, Annotated types, pydantic-settings, serialization)
    - `data-processing/pandas` — pandas + openpyxl + lxml + UTF-16LE file handling, bulk generation patterns
    - `ai-integration/anthropic-python` — Anthropic Python SDK (messages, streaming, tool use, vision, async, Streamlit integration)
    - `best-practices/ruff` — Ruff linter/formatter (CLI, pyproject.toml config, rule sets, CI, pre-commit)
    - `industrial/freelance-formats` — ABB Freelance PRT/DMF/CSV format reference, section grammar, encoding rules
    - `industrial/isa-standards` — ISA-5.1 tag naming, ISA-88 batch, ISA-95 hierarchy, ISA-18.2 alarms, ISA-101 HMI
    - `industrial/dcs-platforms` — ABB Freelance, Siemens PCS7/TIA Portal, Emerson DeltaV, Honeywell Experion cross-platform reference
    - `industrial/iec61131` — IEC 61131-3 languages (LD/FBD/ST/IL/SFC), POUs, PLCopen, exchange formats
    - `industrial/bulk-engineering` — Bulk engineering pipeline, PRT templating, NAMUR NE 148, recommended tech stack
  - **Python detection extended** — `detection.service.ts` now detects `streamlit` as a backend framework and `ruff`, `pydantic`, `anthropic`, `openpyxl`, `pandas`, `lxml` as additional technologies from `requirements.txt`/`pyproject.toml`
  - **Detection constants** — `aiosqlite` added to `PYTHON_DB_RULES`; new `STACK_TO_AGENTS` mappings for `streamlit`, `pandas`, `openpyxl`, `lxml`, `pydantic`, `ruff`, `anthropic`
  - **2 New Registry Hooks** (`registry/features.json`)
    - `python-ruff-format-hook` — PostToolUse hook that runs `ruff format` + `ruff check --fix` on `.py` file saves
    - `pytest-smoke-hook` — SubagentStop hook triggering `qa-expert` with pytest after Python agent completions
  - **MCP metadata** — `database-query` server `detectedWhen` extended with `sqlite` and `sqlalchemy`

- **Code Generator** — Spec-driven code generation dashboard tab with 3-phase pipeline
  - Supports OpenAPI (JSON/YAML), AsyncAPI, TypeSpec, Protobuf, and BPMN spec formats
  - Deterministic code generation for 9 target languages/frameworks (TypeScript Express/Fastify/NestJS/Koa, Java Spring, Python FastAPI/Flask, Go Gin/Echo)
  - AI refinement phase using existing agents + dedicated `codegen-refinement` skill for naming, imports, error-handling adaptation
  - Convention scanner reads `.prettierrc`, `tsconfig.json`, ESLint config, and `package.json` to align generated code with project style
  - 5-step dashboard UI: Technology → Upload Spec → Configure → Preview → Generate
  - Drag-and-drop file upload with real-time spec validation
  - File browser with code preview and Accept All / Refine with Claude options
  - Backend: 8 REST endpoints with multer upload, Zod validation, rate limiting
  - New skill: `skills/codegen/codegen-refinement/SKILL.md`

---

## [1.1.0] - 2026-03-05

### Added

- **51 New Skills** covering AI, mobile, real-time, infrastructure, security, architecture, and production patterns
  - AI integration: `vector-databases`, `rag-patterns`, `etl-pipelines`
  - Mobile: `react-native`, `flutter`, `expo`
  - Real-time: `socket-io`, `sse`, `webrtc`
  - Infrastructure: `terraform`, `job-queues`, `cron-scheduling`, `api-gateway`, `health-checks`, `deployment-strategies`, `service-mesh`
  - Security: `rate-limiting`, `cryptography`, `audit-logging`, `gdpr`, `cors-security-headers`
  - Architecture: `ddd`, `event-sourcing-cqrs`, `multitenancy`
  - API design: `webhooks`, `pagination`, `grpc`
  - Testing: `load-testing`, `contract-testing`
  - Observability: `error-tracking`
  - Utilities: `pdf-generation`, `data-export`, `image-processing`, `charting`
  - Best practices: `resilience-patterns`, `caching-strategies`, `feature-flags`, `error-handling`
  - Other: `i18n`, `push-notifications`, `pwa`, `webauthn`, `stripe`
- **2 New Agents**
  - `mobile-expert` — React Native, Flutter, Expo, push notifications, payments
  - `cloud-expert` — AWS, Azure, GCP, Terraform, serverless, API gateway, service mesh
- **Comprehensive Agent-Skill Cross-Reference** — All 321 skills mapped to at least one agent, zero orphans, zero broken references. Extensive skill additions to 22 existing agents
- **Knowledge Base (Tier 1)** — 61 deep-dive documentation files across 13 technologies
  - Architecture: DDD (5 files), Event Sourcing/CQRS (5 files), Multitenancy (4 files)
  - AI: RAG Patterns (5 files), Vector Databases (5 files)
  - Security: Cryptography (5 files), GDPR (5 files)
  - Infrastructure: Terraform (5 files), Service Mesh (4 files)
  - Best Practices: Resilience Patterns (5 files), Caching Strategies (4 files)
  - Testing: Load Testing (5 files), Contract Testing (4 files)
- **Documentation MCP Server** — 3 new docs-index categories (architecture, ai, security) and updates to infrastructure, standards, testing indexes registering all 13 KB technologies
- **Messaging Integration Testing Skills** - Three new testing skills for message broker integration testing
  - `messaging-testing-kafka`, `messaging-testing-rabbitmq`, `messaging-testing` with quick-ref guides
  - Updated `testcontainers`, `spring-kafka`, and `spring-amqp` skills with test examples
- **Smoke Test Agent** - `smoke-test-expert` for post-implementation end-to-end verification with 7-phase pipeline and fix orchestration
- **New Component Discovery** - Surfaces agents/MCP servers added after initial installation with catalog snapshots
- **Angular/.NET Ecosystem** - `angular-expert` and `dotnet-expert` agents with 20+ new skills
- **Git Authentication Flow** - Dashboard Git panel detects auth errors and prompts `gh auth login`
- **Electron Performance** - Faster splash screen, lazy-loaded modules, NSIS installer

---

## [1.0.0] - 2026-02-06

### Initial Public Release

- **10 MCP Servers**: Documentation, Database Query, Docker Manager, API Tester, API Explorer, Log Analyzer, Performance Profiler, Code Quality, Security Scanner, Dashboard Bridge
- **34 Agents**: Core, Frontend, Backend, Testing, Database, Infrastructure, Messaging, Security experts (at release)
- **240+ Skills**: Framework-specific knowledge files with quick-reference guides (at release)
- **Web Dashboard**: React + TypeScript + Vite + TailwindCSS + Zustand frontend with Express TypeScript backend
- **Electron Desktop App**: Native desktop app with auto-updater and splash screen
- **Orchestrator**: WebSocket-based multi-agent task execution from dashboard
- **Code Review**: AI-powered code review with scope selection and multi-agent support
- **Git Integration**: Full Git operations panel with staging, commits, branches, and diff viewer
- **Templates**: Project scaffolding for React, Next.js, Spring Boot, Express, FastAPI, and more
- **Custom Agents**: Create and manage custom agents from the dashboard
- **Upgrade System**: Feature registry with upgrade detection and conflict resolution
- **Analytics**: Track knowledge base usage and agent performance

### Technical Stack

- **Frontend**: React 19, TypeScript, Vite, TailwindCSS, Zustand
- **Backend**: Express 5, TypeScript, Zod validation
- **Desktop**: Electron with auto-updates
- **MCP Servers**: TypeScript, npm workspaces
- **Knowledge Base**: Git-based on-demand fetching for 137 technologies

---

## Summary

| Version | MCP Servers | Agents | Skills | KB Files | Tools |
|---------|-------------|--------|--------|----------|-------|
| 1.1.1   | 10          | 47     | 337+   | 76+      | 79    |
| 1.1.0   | 10          | 41     | 321    | 61       | 79    |
| 1.0.0   | 10          | 34     | 240+   | —        | 79    |
