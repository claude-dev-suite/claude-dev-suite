---
name: pnpm
description: |
  pnpm package manager. Fast, disk-efficient with excellent monorepo support.
  Use when managing dependencies or setting up monorepos.

  USE WHEN: user mentions "pnpm", "pnpm workspace", "pnpm-workspace.yaml", asks about "pnpm commands", "pnpm install", "workspace protocol"

  DO NOT USE FOR: npm (use standard npm commands), yarn (use yarn commands), bun package manager
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---
# pnpm - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `pnpm` for comprehensive documentation.

## When NOT to Use This Skill

- **npm projects** - Stick with npm unless migrating
- **Yarn projects** - Yarn 3+ has similar features
- **Bun projects** - Bun has its own package manager
- **Legacy tooling** - Some tools don't support pnpm

## When to Use This Skill
- Efficient dependency management
- Monorepo setup and management
- Migration from npm/yarn
- CI/CD optimization

## Setup

```bash
# Install pnpm
npm install -g pnpm

# Or via corepack (recommended)
corepack enable
corepack prepare pnpm@latest --activate

# Initialize project
pnpm init
```

## Basic Commands

```bash
# Install all dependencies
pnpm install
pnpm i

# Add dependency
pnpm add express
pnpm add -D typescript @types/node   # devDependency
pnpm add -O lodash                   # optionalDependency
pnpm add -g serve                    # global

# Remove
pnpm remove express
pnpm rm express

# Update
pnpm update              # Update all
pnpm update express      # Update specific
pnpm update --latest     # Update to latest (ignore semver)

# Run scripts
pnpm run build
pnpm build              # Shorthand
pnpm dev
pnpm test

# Execute binary
pnpm exec tsc
pnpm dlx create-react-app my-app  # Like npx
```

## Lockfile & Reproducibility

```bash
# Frozen install (CI)
pnpm install --frozen-lockfile

# Prefer offline
pnpm install --prefer-offline

# Update lockfile only
pnpm install --lockfile-only

# Import from npm/yarn
pnpm import
```

## Workspaces (Monorepo)

### Setup

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'tools/*'
```

```
my-monorepo/
├── pnpm-workspace.yaml
├── package.json
├── apps/
│   ├── web/
│   │   └── package.json
│   └── api/
│       └── package.json
└── packages/
    ├── ui/
    │   └── package.json
    └── utils/
        └── package.json
```

### Workspace Commands

```bash
# Install all workspaces
pnpm install

# Run in specific workspace
pnpm --filter @myorg/web dev
pnpm -F @myorg/web dev          # Shorthand

# Run in all workspaces
pnpm -r build
pnpm --recursive build

# Run in workspaces matching pattern
pnpm --filter "./apps/*" build
pnpm --filter "...@myorg/ui" build   # ui and dependents

# Add dependency to workspace
pnpm --filter @myorg/web add react

# Add workspace dependency
pnpm --filter @myorg/web add @myorg/ui --workspace
```

### Workspace Protocol

```json
// apps/web/package.json
{
  "name": "@myorg/web",
  "dependencies": {
    "@myorg/ui": "workspace:*",     // Any version
    "@myorg/utils": "workspace:^",  // Compatible
    "@myorg/config": "workspace:~"  // Patch updates
  }
}
```

### Filtering

```bash
# By name
pnpm --filter @myorg/web build

# By directory
pnpm --filter ./apps/web build

# By pattern
pnpm --filter "@myorg/*" build
pnpm --filter "!@myorg/deprecated" build

# Dependencies
pnpm --filter @myorg/web... build     # web + dependencies
pnpm --filter ...@myorg/ui build      # ui + dependents
pnpm --filter @myorg/web^... build    # only dependencies (not web)

# Since git ref
pnpm --filter "...[origin/main]" build  # Changed since main
```

## Configuration

### .npmrc

```ini
# .npmrc
# Hoist patterns
public-hoist-pattern[]=*types*
public-hoist-pattern[]=*eslint*

# Strict peer deps
strict-peer-dependencies=true

# Auto-install peers
auto-install-peers=true

# Registry
registry=https://registry.npmjs.org/

# Scoped registry
@myorg:registry=https://npm.pkg.github.com

# Authentication
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}

# Store location
store-dir=~/.pnpm-store

# Symlinks
node-linker=hoisted  # For compatibility
```

### package.json

```json
{
  "name": "my-monorepo",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  },
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm --parallel -r dev",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "clean": "pnpm -r exec rm -rf dist node_modules"
  }
}
```

## Shared Dependencies

### Catalog (pnpm 9+)

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'

catalog:
  react: ^18.2.0
  react-dom: ^18.2.0
  typescript: ^5.4.0
  vitest: ^1.6.0
```

```json
// packages/web/package.json
{
  "dependencies": {
    "react": "catalog:",
    "react-dom": "catalog:"
  }
}
```

### Shared Config

```json
// package.json (root)
{
  "devDependencies": {
    "typescript": "^5.4.0",
    "eslint": "^9.0.0"
  }
}
```

```json
// packages/web/package.json
{
  "devDependencies": {
    "typescript": "workspace:*"  // Inherit from root
  }
}
```

## CI/CD

### GitHub Actions

```yaml
name: CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm -r build

      - name: Test
        run: pnpm -r test
```

### Caching

```yaml
# Cache pnpm store
- uses: actions/cache@v4
  with:
    path: ~/.pnpm-store
    key: pnpm-${{ runner.os }}-${{ hashFiles('**/pnpm-lock.yaml') }}
    restore-keys: |
      pnpm-${{ runner.os }}-
```

## Patching

```bash
# Create patch
pnpm patch express@4.18.2

# Edit in temp directory, then
pnpm patch-commit <path-to-temp>
```

```json
// package.json
{
  "pnpm": {
    "patchedDependencies": {
      "express@4.18.2": "patches/express@4.18.2.patch"
    }
  }
}
```

## Overrides

```json
// package.json
{
  "pnpm": {
    "overrides": {
      "lodash": "^4.17.21",
      "foo@^1.0.0>bar": "^2.0.0"
    }
  }
}
```

## Migration from npm/yarn

```bash
# Remove old lock files
rm package-lock.json yarn.lock

# Import existing lockfile
pnpm import

# Install
pnpm install

# Verify
pnpm ls
```

### Common Issues

```bash
# Peer dependency issues
pnpm install --strict-peer-dependencies=false

# Hoist issues (certain packages need hoisting)
# Add to .npmrc:
public-hoist-pattern[]=*prisma*
shamefully-hoist=true  # Last resort!

# Symlink issues (Windows/Docker)
# Add to .npmrc:
node-linker=hoisted
```

## Performance Tips

```bash
# Parallel execution
pnpm --parallel -r dev

# Limit concurrency
pnpm -r --workspace-concurrency=4 build

# Skip already built
pnpm -r build --filter "...[origin/main]"

# Prune store
pnpm store prune

# Store status
pnpm store status
```

## Comparison

| Feature | npm | yarn | pnpm |
|---------|-----|------|------|
| Disk usage | High | High | Low (content-addressable) |
| Install speed | Medium | Fast | Fastest |
| Monorepo | Workspaces | Workspaces | Best |
| Strictness | Low | Low | High |
| Plug'n'Play | No | Yes | No |

## Anti-Patterns to Avoid

- Do not use `shamefully-hoist` without reason
- Do not forget `--frozen-lockfile` in CI
- Do not ignore peer dependency warnings
- Do not mix package managers in the same repo

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using shamefully-hoist | Breaks dependency isolation | Use public-hoist-pattern selectively |
| Missing --frozen-lockfile in CI | Non-reproducible builds | Always use in CI/CD |
| Ignoring peer dependency warnings | Runtime errors | Resolve peer deps or use auto-install-peers |
| Mixing package managers | Lock file conflicts | Commit only one lock file type |
| Not using workspace protocol | Version conflicts | Use workspace:* for internal deps |
| Missing packageManager field | Wrong pnpm version | Add to package.json |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Module not found | Strict isolation | Add to public-hoist-pattern or fix imports |
| Peer dependency errors | Unresolved peers | Set auto-install-peers: true or install manually |
| Wrong pnpm version | No packageManager field | Add "packageManager": "pnpm@9.0.0" |
| Symlink issues (Windows) | File system permissions | Run as admin or use node-linker: hoisted |
| Slow installs | No offline mode | Use --prefer-offline |
| Workspace not found | Wrong pnpm-workspace.yaml | Check packages patterns |

## Checklist

- [ ] pnpm-workspace.yaml configured
- [ ] .npmrc with appropriate configurations
- [ ] packageManager in package.json
- [ ] CI with --frozen-lockfile
- [ ] Cache configured in CI
- [ ] Catalogs for shared versions (pnpm 9+)

## Further Reading
> For advanced configurations: `mcp__documentation__fetch_docs`
> - Technology: `pnpm`
> - [pnpm Docs](https://pnpm.io/)
