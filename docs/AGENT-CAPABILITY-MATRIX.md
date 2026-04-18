# Agent-MCP Capability Matrix

This document maps each agent to its required MCP servers and skills.

## Agents by Category

### Core Agents

| Agent | MCP Servers | Skills |
|-------|-------------|--------|
| **architect** | documentation | system-design, clean-code, architecture-patterns |
| **code-reviewer** | documentation, code-quality | clean-code, solid-principles, git-workflow |
| **typescript-expert** | documentation | typescript, advanced-types |
| **nodejs-expert** | documentation | nodejs, npm, async-patterns |
| **python-expert** | documentation | python, pip, async-python |
| **documentation-expert** | documentation | tsdoc, jsdoc, api-docs |
| **accessibility-expert** | documentation | wcag, aria, a11y-testing |
| **log-analyst** | log-analyzer | logging, debugging, observability |
| **performance-expert** | performance-profiler | profiling, optimization, benchmarking |
| **dashboard-refactor-expert** | documentation | react, typescript, refactoring |
| **claude-code-extension-expert** | _(none)_ | skill-authoring, agent-authoring, hook-authoring, mcp-authoring, plugin-authoring |

### Backend Agents

| Agent | MCP Servers | Skills |
|-------|-------------|--------|
| **spring-boot-expert** | documentation, api-tester | spring-boot, spring-data-jpa, spring-security, spring-web, flyway, lombok, mapstruct |
| **nestjs-expert** | documentation, api-tester | nestjs, typescript, prisma, postgresql |
| **fastapi-expert** | documentation, api-tester | fastapi, python, sqlalchemy, pydantic, pytest |
| **rust-expert** | documentation | rust, actix-web, axum, rocket, warp |
| **go-expert** | documentation | go, gin, fiber, echo, chi |
| **deno-expert** | documentation | deno, fresh, oak, typescript |
| **dotnet-expert** | documentation, api-tester | aspnet-core, aspnet-minimal-api, aspnet-middleware, aspnet-signalr, aspnet-blazor, aspnet-identity, aspnet-validation, entity-framework-core, csharp, xunit, nunit, dotnet-quality, dotnet-security, postgresql, sql-server, swagger-dotnet, resilience-patterns, caching-strategies, webhooks, pagination, error-handling, cors-security-headers, error-tracking, health-checks, ddd |
| **streamlit-expert** | documentation | streamlit, python, pandas, pydantic, pytest, ruff |

### Frontend Agents

| Agent | MCP Servers | Skills |
|-------|-------------|--------|
| **react-expert** | documentation, code-quality | react, react-hooks, typescript, tailwindcss, shadcn-ui, zustand, tanstack-query |
| **nextjs-expert** | documentation | nextjs, react, typescript, server-components, app-router |
| **vue-expert** | documentation | vue, nuxt, typescript, pinia, tailwindcss |
| **svelte-expert** | documentation | svelte, sveltekit, typescript, tailwindcss |
| **electron-expert** | documentation | electron, react, typescript, nodejs, ipc |
| **tauri-expert** | documentation | tauri, rust, typescript, svelte, vite |
| **angular-expert** | documentation | angular, angular-routing, angular-forms, angular-http, angular-testing, angular-material, angular-ssr, typescript, ngrx, vitest, i18n |
| **ux-expert** | documentation | ux-design, visual-hierarchy, design-tokens, interaction-design, motion-design, mobile-ux, color-systems, ethical-design |
| **creative-frontend-expert** | documentation | animation/framer-motion, animation/gsap, graphics/three-js, graphics/svg-animation, graphics/canvas-webgl, styling/advanced-css-effects |

### Database Agents

| Agent | MCP Servers | Skills |
|-------|-------------|--------|
| **prisma-expert** | documentation | prisma, postgresql, mysql, typescript |
| **sql-expert** | documentation, database-query | postgresql, mysql, sql-optimization |
| **mongodb-expert** | documentation | mongodb, aggregations, spring-data-mongodb |

### Testing Agents

| Agent | MCP Servers | Skills |
|-------|-------------|--------|
| **vitest-expert** | documentation, code-quality | vitest, testing-library, mocking, coverage |
| **playwright-expert** | documentation | playwright, e2e-testing, page-objects |
| **spring-boot-integration-test-expert** | documentation | spring-boot-test, testcontainers, junit |
| **python-integration-test-expert** | documentation | python-integration, testcontainers-python, pytest-django, fastapi-testing, factory-boy |
| **smoke-test-expert** | api-tester, database-query, docker-manager, log-analyzer, documentation | smoke-test, rest-assured, testcontainers |

### Infrastructure Agents

| Agent | MCP Servers | Skills |
|-------|-------------|--------|
| **docker-expert** | docker-manager | docker, docker-compose, kubernetes |
| **devops-expert** | docker-manager | github-actions, ci-cd, deployment |

### Quality Agents

| Agent | MCP Servers | Skills |
|-------|-------------|--------|
| **qa-expert** | documentation, code-quality | testing-strategies, quality-assurance |
| **integration-validator-expert** | documentation, api-explorer | api-contracts, openapi, frontend-backend-sync |
| **open-source-expert** | documentation, code-quality | open-source, git-workflow, clean-code, supply-chain, secrets-management, license-compliance |

### Security Agents

| Agent | MCP Servers | Skills |
|-------|-------------|--------|
| **security-expert** | security-scanner, documentation | owasp, jwt, oauth2, secrets-management |

### Messaging Agents

| Agent | MCP Servers | Skills |
|-------|-------------|--------|
| **messaging-expert** | documentation | kafka, rabbitmq, event-driven-architecture, spring-kafka, spring-amqp |

### Cloud Agents

| Agent | MCP Servers | Skills |
|-------|-------------|--------|
| **cloud-expert** | documentation | aws, azure, gcp, serverless, cloud-storage, terraform, caching-strategies, resilience-patterns, feature-flags, multitenancy, secrets-management, iac-security, deployment-strategies, health-checks, api-gateway, service-mesh |

### Mobile Agents

| Agent | MCP Servers | Skills |
|-------|-------------|--------|
| **mobile-expert** | documentation | react-native, flutter, expo, push-notifications, i18n, webauthn, stripe, file-upload |

### Data Agents

| Agent | MCP Servers | Skills |
|-------|-------------|--------|
| **data-engineering-expert** | documentation | pandas, pydantic, python, pytest, ruff |
| **rag-expert** | documentation | rag (architecture, chunking, retrieval, evaluation, agentic, graph, multimodal, guardrails, caching, security, observability, production), retrieval (ColBERT, SPLADE, BM25, RankGPT, cross-encoder), embeddings, vector-stores, document-processing, rag-frameworks (LlamaIndex, Haystack, DSPy, LangGraph, +4), rag-ops (TEI, batch, cost, multi-region, gateway) |

### Industrial Automation Agents

| Agent | MCP Servers | Skills |
|-------|-------------|--------|
| **dcs-analyst** | documentation | industrial/freelance-formats, industrial/isa-standards, industrial/dcs-platforms |
| **freelance-engineer** | documentation | industrial/freelance-formats, industrial/isa-standards, industrial/bulk-engineering |
| **automation-architect** | documentation | industrial/freelance-formats, industrial/isa-standards, industrial/dcs-platforms, industrial/iec61131, industrial/bulk-engineering, pandas, pydantic |

## MCP Server Requirements

| MCP Server | Used By Agents |
|------------|----------------|
| **documentation** | All agents |
| **database-query** | sql-expert, smoke-test-expert |
| **docker-manager** | docker-expert, devops-expert, smoke-test-expert |
| **code-quality** | code-reviewer, react-expert, vitest-expert, qa-expert, open-source-expert |
| **log-analyzer** | log-analyst, smoke-test-expert |
| **performance-profiler** | performance-expert |
| **security-scanner** | security-expert |
| **api-explorer** | integration-validator-expert |
| **api-tester** | spring-boot-expert, nestjs-expert, fastapi-expert, dotnet-expert, smoke-test-expert |
| **dashboard-bridge** | (optional, for orchestrator integration) |

## Recommended Configurations

### Fullstack TypeScript (Next.js + NestJS)
```json
{
  "agents": ["nextjs-expert", "nestjs-expert", "prisma-expert", "vitest-expert", "playwright-expert", "docker-expert"],
  "mcpServers": ["documentation", "database-query", "docker-manager", "code-quality"]
}
```

### Spring Boot + React
```json
{
  "agents": ["spring-boot-expert", "react-expert", "sql-expert", "docker-expert", "vitest-expert"],
  "mcpServers": ["documentation", "database-query", "docker-manager", "code-quality"]
}
```

### Python FastAPI
```json
{
  "agents": ["fastapi-expert", "python-expert", "sql-expert", "docker-expert"],
  "mcpServers": ["documentation", "database-query", "docker-manager", "api-tester"]
}
```

### Rust Backend
```json
{
  "agents": ["rust-expert", "sql-expert", "docker-expert"],
  "mcpServers": ["documentation", "database-query", "docker-manager"]
}
```

### Go Backend
```json
{
  "agents": ["go-expert", "sql-expert", "docker-expert"],
  "mcpServers": ["documentation", "database-query", "docker-manager"]
}
```

### Python Streamlit + Data Engineering
```json
{
  "agents": ["streamlit-expert", "data-engineering-expert", "python-expert", "qa-expert"],
  "mcpServers": ["documentation", "database-query"]
}
```

### Industrial DCS / PLC Automation (ABB Freelance)
```json
{
  "agents": ["dcs-analyst", "freelance-engineer", "automation-architect", "data-engineering-expert", "python-expert"],
  "mcpServers": ["documentation"]
}
```

### Creative Frontend (Landing Pages, 3D, Animation)
```json
{
  "agents": ["creative-frontend-expert", "ux-expert", "react-expert"],
  "mcpServers": ["documentation"]
}
```
