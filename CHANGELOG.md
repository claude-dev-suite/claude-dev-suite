# Changelog

All notable changes to dev-suite are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added

- **New Component Discovery** - Proactively surfaces agents and MCP servers added to dev-suite after a project's initial installation
  - Records a catalog snapshot (`availableAtInstall`) in the manifest during installation
  - New endpoint `GET /api/management/new-components` compares current catalog vs install-time snapshot
  - "New Agents Available" / "New MCP Servers Available" sections in the Manage tab with Add / Add All / Dismiss actions
  - Badge indicators on Agents and MCP Servers tabs showing count of new components
  - Enhanced `checkForUpdates()` with semantic summary (new agents, new MCP servers, updated skills)
  - Graceful fallback for older installs without catalog snapshot (no false positives)
- **Angular/.NET Ecosystem** - Two new agents with 20+ new skills
  - `angular-expert` — Angular 17+, signals, standalone components, routing, forms, HTTP, testing, Material, SSR, NgRx
  - `dotnet-expert` — ASP.NET Core 8+, minimal APIs, middleware, SignalR, Blazor, Identity, EF Core, C#, xUnit, NUnit
  - Documentation MCP server updated with docs-index entries for all new technologies
- **Git Authentication Flow** - Dashboard Git panel detects auth errors and prompts `gh auth login`
- **Electron Performance** - Faster splash screen via `backgroundColor`, lazy-loaded electron-updater and logger
- **Electron NSIS Installer** - Switched from portable EXE to NSIS installer for faster startup

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

| Version | MCP Servers | Agents | Skills | Tools |
|---------|-------------|--------|--------|-------|
| Unreleased | 10       | 36     | 260+   | 95+   |
| 1.0.0   | 11          | 34     | 240+   | 95+   |
