---
name: generate
description: Generate code components based on current stack configuration
allowed-tools: Read, Write, Edit, Glob, Bash
argument-hint: <type> <name> [options]
---

# Code Generator

Generate code components based on the current stack configuration.

## Usage

- `/generate component UserCard` - Generate a React/Vue component
- `/generate page dashboard` - Generate a page component
- `/generate api users` - Generate API endpoint/controller
- `/generate model User` - Generate database model/schema
- `/generate hook useAuth` - Generate custom hook

## Process

1. Read `AGENTS.md` and inspect the project itself to understand the stack. `.dev-suite.json` records only which agents, MCP servers and rules are installed — it holds no stack or path information, and no `project` key of any kind.
2. **Detect the workspace layout from the filesystem**, not from config:
   - A root `package.json` with a `workspaces` array, or a `pnpm-workspace.yaml`, `turbo.json`, `nx.json` or `lerna.json`, means a monorepo
   - Find the frontend by locating the package that depends on a frontend framework (`react`, `vue`, `svelte`, `next`, `nuxt`)
   - Find the backend the same way (`express`, `fastify`, `@nestjs/core`), or by a non-JS manifest: `pom.xml`, `build.gradle`, `pyproject.toml`, `go.mod`, `Cargo.toml`
   - When the layout is ambiguous, ask rather than guess
3. Determine appropriate template based on:
   - Frontend framework (React, Vue, etc.)
   - Backend framework (NestJS, FastAPI, etc.)
   - ORM (Prisma, Drizzle, etc.)
4. Generate files in the correct directory:
   - Components, pages, hooks → the frontend workspace's `src/`
   - API, controllers, models → the backend workspace's `src/`
5. Include tests if testing is configured
6. Update any necessary index/barrel files

## Monorepo Support

For monorepo projects, work out the workspace from the filesystem:

```
my-project/
├── .dev-suite.json          # Installed agents / MCP servers / rules only — no paths
├── package.json             # "workspaces": [...] → this is a monorepo
├── apps/web/                # depends on react/next → frontend
│   └── src/components/      # Component generation target
└── services/api/            # depends on @nestjs/core → backend
    └── src/                 # API/model generation target
```

Directory names vary by project. Identify each workspace by what its manifest depends on,
never by assuming a name like `frontend/` or `backend/`.

## Templates Used

Scaffolding templates live in `templates/`, named by stack — for example
`frontend-react`, `springboot-api`, `fullstack-nextjs-nestjs`, `python-fastapi`,
`vue-nuxt`. List the directory rather than assuming a name.

## Relation to the Codegen panel

This command is ad-hoc scaffolding driven by the model. It is **not** the spec-driven
pipeline: the dashboard's **Codegen** panel parses an OpenAPI/AsyncAPI/TypeSpec spec and
runs per-language generators (`services/codegen/{typescript,java,python,go}.ts`) with
validation and an AI refinement pass, exposed over `/api/codegen/*`. Use that when a
contract exists; use this command when one does not.

## Output

- Main file (component, controller, model)
- Test file (if testing configured)
- Types file (if TypeScript)
- Story file (if Storybook configured)
