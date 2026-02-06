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

1. Read `.dev-suite.json` to understand current stack
2. **Detect monorepo structure**:
   - Check if `project.isMonorepo` is `true`
   - Use `project.frontendPath` for frontend components (e.g., `frontend/`, `*-frontend/`)
   - Use `project.backendPath` for backend components (e.g., `backend/`, `*-backend/`)
3. Determine appropriate template based on:
   - Frontend framework (React, Vue, etc.)
   - Backend framework (NestJS, FastAPI, etc.)
   - ORM (Prisma, Drizzle, etc.)
4. Generate files in the correct directory:
   - Components, pages, hooks → `{frontendPath}/src/`
   - API, controllers, models → `{backendPath}/src/`
5. Include tests if testing is configured
6. Update any necessary index/barrel files

## Monorepo Support

For monorepo projects, the generator automatically detects the workspace:

```
my-project/
├── .dev-suite.json          # Contains frontendPath & backendPath
├── gestionale-frontend/     # frontendPath
│   └── src/components/      # Component generation target
└── gestionale-backend/      # backendPath
    └── src/                 # API/model generation target
```

When running:
- `/generate component UserCard` → Creates in `{frontendPath}/src/components/`
- `/generate api users` → Creates in `{backendPath}/src/`
- `/generate model User` → Creates in `{backendPath}/src/` (or prisma schema location)

## Templates Used

Based on configured stack, use templates from:
`templates/{stack-combination}/`

## Output

- Main file (component, controller, model)
- Test file (if testing configured)
- Types file (if TypeScript)
- Story file (if Storybook configured)
