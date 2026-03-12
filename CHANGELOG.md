# Changelog

All notable changes to dev-suite are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Fixed

- **CI/CD** — E2E workflow now installs server dependencies and builds frontend before running Playwright tests
- **CI/CD** — E2E workflow uses 6-way sharding to stay within timeout limits
- **E2E Fixture** — Fixed race condition where `mainPage` fixture could capture DevTools window instead of the app window
- **CI/CD** — CI workflow now installs server dependencies before TypeScript build
- **Security** — Fixed 13 ReDoS vulnerabilities in codegen spec parsers (OpenAPI, AsyncAPI, TypeSpec, Protobuf, BPMN)
- **Security** — Fixed path-injection in `management.service.ts` `updateClaudeMd()` with `resolveProjectPath()` validation
- **Security** — Fixed path-injection in `code-review.routes.ts` with path containment check for file diffs

### Added

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

- **11 MCP Servers**: Documentation, Database Query, Docker Manager, API Tester, API Explorer, Log Analyzer, Performance Profiler, Code Quality, Security Scanner, Dashboard Bridge
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
| 1.1.0   | 10          | 38     | 321    | 61       | 95+   |
| 1.0.0   | 11          | 34     | 240+   | —        | 95+   |
