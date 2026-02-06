---
name: nx
description: |
  Nx build system and monorepo tools. Advanced task orchestration, generators, and plugins.
  Use for complex enterprise monorepos with multiple technologies.

  USE WHEN: user mentions "Nx", "nx.json", "Nx monorepo", "Nx generators", asks about "Nx workspace", "affected commands", "module boundaries"

  DO NOT USE FOR: Turborepo (use turborepo skill), simple monorepos (Turborepo is simpler), single-package projects
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---
# Nx - Quick Reference

> **Full Reference**: See [advanced.md](advanced.md) for custom generators, custom executors, remote/self-hosted cache, module boundaries, and CI/CD GitHub Actions setup.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `nx` for comprehensive documentation.

## Setup

```bash
# New workspace
npx create-nx-workspace@latest my-workspace

# Add to existing repo
npx nx@latest init
```

## Project Structure

```
my-workspace/
├── nx.json
├── apps/
│   ├── web/project.json
│   └── api/project.json
└── libs/
    ├── ui/project.json
    └── utils/project.json
```

## Configuration (nx.json)

```json
{
  "targetDefaults": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["production", "^production"],
      "cache": true
    },
    "test": {
      "inputs": ["default", "^production"],
      "cache": true
    }
  },
  "namedInputs": {
    "default": ["{projectRoot}/**/*", "sharedGlobals"],
    "production": ["default", "!{projectRoot}/**/*.spec.ts"]
  }
}
```

## Running Tasks

```bash
# Run target
nx build web
nx test api

# Run for all projects
nx run-many -t build
nx run-many -t build test lint

# Affected (changed since base)
nx affected -t build
nx affected -t test --base=main

# Graph
nx graph
```

## Generators

```bash
# Generate application
nx g @nx/react:app my-app
nx g @nx/node:app my-api

# Generate library
nx g @nx/react:lib ui --directory=libs/shared

# Generate component
nx g @nx/react:component button --project=ui

# Dry run
nx g @nx/react:lib feature --dry-run
```

## Plugins

```bash
# Add plugin
nx add @nx/react
nx add @nx/node
nx add @nx/vite
```

## Caching

```bash
# Skip cache
nx build web --skip-nx-cache

# Clear cache
nx reset
```

## Comparison: Nx vs Turborepo

| Feature | Nx | Turborepo |
|---------|-----|-----------|
| Configuration | TypeScript | JSON |
| Generators | Advanced | Basic |
| Plugins | 50+ | Limited |
| Module boundaries | Enforced | Manual |
| Learning curve | Steeper | Lower |

## When NOT to Use This Skill

- **Simple monorepos** - Turborepo has simpler configuration
- **Single package** - No need for monorepo tools
- **Quick setup needed** - Turborepo is faster to configure

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Ignoring module boundaries | Tight coupling | Enforce with @nx/enforce-module-boundaries |
| Circular dependencies | Build failures | Use nx graph to detect and fix |
| Not using affected | Wastes CI time | Always use nx affected in CI |
| Missing project tags | Can't enforce constraints | Tag all projects properly |
| No workspace generators | Inconsistent code | Create generators for common patterns |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Module boundary violation | Wrong import | Check depConstraints in .eslintrc.json |
| Circular dependency | Projects import each other | Use nx graph, refactor to shared lib |
| Affected not working | Missing dependencies | Check implicit dependencies |
| Cache not working | Missing outputs | Add outputs to target configuration |
| Build order wrong | Missing dependsOn | Add dependsOn: ["^build"] |

## Production Checklist

- [ ] nx.json configured
- [ ] project.json for each project
- [ ] Module boundaries with tags
- [ ] Affected in CI pipeline
- [ ] Nx Cloud for remote cache
- [ ] Generators for consistency

## Reference Documentation
- [Nx Docs](https://nx.dev/getting-started/intro)
