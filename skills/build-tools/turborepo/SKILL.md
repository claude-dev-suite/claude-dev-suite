---
name: turborepo
description: |
  Turborepo high-performance monorepo build system. Intelligent caching and task orchestration.
  Use when managing monorepos with complex build dependencies.

  USE WHEN: user mentions "Turborepo", "turbo.json", "turbo build", asks about "monorepo caching", "Turbo configuration", "remote cache"

  DO NOT USE FOR: Nx monorepos (use nx skill), single-package projects, Lerna (deprecated), Rush
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---
# Turborepo - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `turborepo` for comprehensive documentation.

## When NOT to Use This Skill

- **Nx monorepos** - Use `nx` skill for Nx-specific features
- **Single package projects** - No need for monorepo tools
- **Need advanced generators** - Nx has better code generation
- **Complex module boundaries** - Nx enforces them better

## When to Use This Skill
- Monorepo with multiple packages
- Build caching and optimization
- CI/CD for monorepos
- Complex task orchestration

## Setup

```bash
# New monorepo
npx create-turbo@latest my-monorepo

# Add to existing monorepo
npm install turbo --save-dev
```

## Project Structure

```
my-monorepo/
├── turbo.json
├── package.json
├── apps/
│   ├── web/
│   │   └── package.json
│   └── api/
│       └── package.json
└── packages/
    ├── ui/
    │   └── package.json
    ├── config/
    │   └── package.json
    └── utils/
        └── package.json
```

## Configuration (turbo.json)

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "build/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

### Task Configuration

```json
{
  "tasks": {
    "build": {
      // Run dependencies' build first
      "dependsOn": ["^build"],

      // Files that affect cache
      "inputs": [
        "src/**",
        "package.json",
        "tsconfig.json"
      ],

      // Outputs to cache
      "outputs": ["dist/**"],

      // Environment variables that affect cache
      "env": ["NODE_ENV", "API_URL"],

      // Pass-through env vars (not cached)
      "passThroughEnv": ["CI", "GITHUB_TOKEN"]
    },

    "dev": {
      // Don't cache dev tasks
      "cache": false,

      // Keep running (watch mode)
      "persistent": true
    },

    "deploy": {
      // Run after build
      "dependsOn": ["build"],

      // No outputs
      "outputs": []
    }
  }
}
```

## Running Tasks

```bash
# Run task in all packages
turbo build
turbo lint
turbo test

# Run in specific package
turbo build --filter=@myorg/web
turbo build --filter=web

# Run in multiple packages
turbo build --filter=@myorg/web --filter=@myorg/api

# Run with dependencies
turbo build --filter=@myorg/web...     # web + its dependencies
turbo build --filter=...@myorg/ui      # ui + its dependents

# Since git ref
turbo build --filter=[HEAD^1]          # Changed since last commit
turbo build --filter=[origin/main]     # Changed since main

# Parallel execution
turbo dev

# Dry run
turbo build --dry-run
turbo build --graph  # Output dependency graph
```

## Package Configuration

```json
// apps/web/package.json
{
  "name": "@myorg/web",
  "scripts": {
    "build": "next build",
    "dev": "next dev",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "@myorg/ui": "*",
    "@myorg/utils": "*"
  }
}
```

```json
// packages/ui/package.json
{
  "name": "@myorg/ui",
  "scripts": {
    "build": "tsup src/index.ts --dts",
    "dev": "tsup src/index.ts --watch",
    "lint": "eslint ."
  }
}
```

## Root package.json

```json
{
  "name": "my-monorepo",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "test": "turbo test",
    "typecheck": "turbo typecheck",
    "clean": "turbo clean && rm -rf node_modules"
  },
  "devDependencies": {
    "turbo": "^2.0.0"
  }
}
```

## Caching

### Local Cache

```bash
# Cache stored in node_modules/.cache/turbo

# Force fresh build
turbo build --force

# View cache status
turbo build --summarize
```

### Remote Cache (Vercel)

```bash
# Login to Vercel
turbo login

# Link to remote cache
turbo link

# Now builds use remote cache
turbo build
```

### Self-hosted Remote Cache

```json
// turbo.json
{
  "remoteCache": {
    "enabled": true,
    "signature": true
  }
}
```

```bash
# Use custom remote cache
TURBO_API="https://your-cache-server.com" \
TURBO_TOKEN="your-token" \
TURBO_TEAM="your-team" \
turbo build
```

## Environment Variables

```json
// turbo.json
{
  "globalEnv": ["CI", "NODE_ENV"],
  "globalPassThroughEnv": ["GITHUB_TOKEN"],
  "tasks": {
    "build": {
      "env": ["API_URL", "DATABASE_URL"],
      "passThroughEnv": ["VERCEL_URL"]
    }
  }
}
```

### .env Files

```json
// turbo.json
{
  "globalDotEnv": [".env"],
  "tasks": {
    "build": {
      "dotEnv": [".env.production", ".env.local"]
    }
  }
}
```

## CI/CD

### GitHub Actions

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2  # Needed for --filter=[HEAD^1]

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install
        run: npm ci

      - name: Build
        run: npx turbo build --filter=[HEAD^1]

      - name: Test
        run: npx turbo test --filter=[HEAD^1]

      - name: Lint
        run: npx turbo lint --filter=[HEAD^1]
```

### With Remote Cache

```yaml
- name: Build
  run: npx turbo build
  env:
    TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
    TURBO_TEAM: ${{ vars.TURBO_TEAM }}
```

## Package-specific Config

```json
// apps/web/turbo.json
{
  "extends": ["//"],
  "tasks": {
    "build": {
      "outputs": [".next/**", "!.next/cache/**"]
    }
  }
}
```

## Generators

```bash
# Create generator
turbo gen init

# Run generator
turbo gen workspace
```

```typescript
// turbo/generators/config.ts
import { PlopTypes } from "@turbo/gen";

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator("package", {
    description: "Create a new package",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Package name?",
      },
    ],
    actions: [
      {
        type: "add",
        path: "packages/{{name}}/package.json",
        templateFile: "templates/package.json.hbs",
      },
    ],
  });
}
```

## Task Dependencies

```json
{
  "tasks": {
    // topological: run in dependencies first
    "build": {
      "dependsOn": ["^build"]
    },

    // same package: run after
    "test": {
      "dependsOn": ["build"]
    },

    // specific package
    "deploy": {
      "dependsOn": ["@myorg/web#build", "@myorg/api#build"]
    },

    // no dependencies
    "lint": {
      "dependsOn": []
    }
  }
}
```

## Debugging

```bash
# Verbose output
turbo build --verbosity=2

# Dry run
turbo build --dry-run=json

# Graph visualization
turbo build --graph=graph.html

# Summarize
turbo build --summarize

# Profile
turbo build --profile=profile.json
```

## Comparison: Turborepo vs Nx

| Feature | Turborepo | Nx |
|---------|-----------|-----|
| Setup | Simple | Complex |
| Config | JSON | TypeScript |
| Caching | Excellent | Excellent |
| Task runner | Fast | Fast |
| Generators | Basic | Advanced |
| Plugins | Limited | Extensive |
| Learning curve | Low | Medium |
| Vercel integration | Native | Manual |

## When to Use

| Scenario | Recommendation |
|----------|----------------|
| Simple monorepo | Turborepo |
| Complex enterprise | Nx |
| Vercel deployment | Turborepo |
| Need generators | Nx |
| Quick setup | Turborepo |

## Anti-Patterns to Avoid

- Do not forget `--filter` for incremental builds
- Do not cache tasks with side effects
- Do not ignore `outputs` configuration
- Do not use `*` in workspace dependencies (use workspace protocol)

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Not using --filter | Rebuilds everything | Use --filter for affected packages |
| Caching side effects | Unreliable deployments | Set cache: false for deploy tasks |
| Missing outputs | Cache doesn't work | Declare all output directories |
| Using * for workspace deps | Version conflicts | Use workspace:* protocol |
| No remote cache in CI | Slow CI builds | Setup Vercel or self-hosted cache |
| Forgetting env in turbo.json | Cache misses | Declare env vars that affect output |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Cache always misses | Missing outputs | Add outputs to turbo.json task |
| Task runs when shouldn't | Wrong dependsOn | Check ^build syntax for dependencies |
| Slow builds | Not using cache | Enable remote cache or check outputs |
| Wrong execution order | Missing dependsOn | Add dependsOn: ["^build"] |
| Env vars not working | Not declared | Add to env or passThroughEnv |
| Remote cache not working | Auth issue | Check TURBO_TOKEN and TURBO_TEAM |

## Checklist

- [ ] turbo.json with task definitions
- [ ] `^build` for topological dependencies
- [ ] outputs configured for caching
- [ ] env vars declared
- [ ] Remote cache for CI
- [ ] --filter for incremental builds

## Further Reading
> For advanced configurations: `mcp__documentation__fetch_docs`
> - Technology: `turborepo`
> - [Turborepo Docs](https://turbo.build/repo/docs)
