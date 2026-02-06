---
name: biome
description: |
  Biome linter and formatter for JavaScript/TypeScript. Covers configuration,
  rules, and integration patterns. Replaces ESLint + Prettier for faster
  development experience.

  USE WHEN: user mentions "biome", "linting", "formatting", "code style", "biome.json",
  asks about "setup linter", "format code", "migrate from ESLint", "migrate from Prettier",
  "biome rules", "biome configuration"

  DO NOT USE FOR: ESLint configuration - Biome is an ESLint replacement,
  Prettier configuration - Biome is a Prettier replacement,
  TypeScript compilation - use TypeScript compiler,
  Code quality principles - use `clean-code` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Biome Configuration

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `biome` for comprehensive documentation.

## When NOT to Use This Skill

This skill is specific to Biome tooling. Do NOT use for:

- **ESLint configuration** - Biome replaces ESLint; migrate or use ESLint skills
- **Prettier configuration** - Biome replaces Prettier; migrate or use Prettier docs
- **TypeScript type checking** - Use `tsc`, not Biome (Biome doesn't type check)
- **Build process** - Use bundler skills (Vite, Webpack, etc.)
- **Testing setup** - Use testing framework skills (Vitest, Jest, etc.)
- **Code quality principles** - Use `clean-code` skill for what to fix, not how to configure

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Biome Best Practice |
|--------------|--------------|---------------------|
| **Disabling recommended rules** | Misses important issues | Keep recommended, customize only what's needed |
| **Ignoring all warnings** | Warnings indicate real issues | Fix warnings or suppress with reason |
| **No CI integration** | Issues slip through | Use `biome ci` in CI pipeline |
| **Manual formatting** | Inconsistent, waste time | Use format on save + pre-commit hooks |
| **Mixing ESLint + Biome** | Conflicting rules, confusion | Fully migrate to Biome or stay with ESLint |
| **No VS Code integration** | Manual CLI runs | Install Biome extension, enable format on save |
| **Ignoring complexity rules** | Allows unmaintainable code | Set cognitive complexity limits |
| **Committing formatting issues** | Messy diffs | Use pre-commit hooks with lint-staged |

## Quick Troubleshooting

| Issue | Check | Solution |
|-------|-------|----------|
| **Biome not formatting** | VS Code extension installed? | Install `biomejs.biome`, set as default formatter |
| **Format on save not working** | Settings.json configured? | Add `"editor.formatOnSave": true` |
| **Rules not applying** | biome.json syntax valid? | Run `biome check` to validate config |
| **Too many warnings** | Rules too strict? | Adjust severity levels or disable specific rules |
| **CI failing** | Different results locally? | Ensure same Biome version, check ignore patterns |
| **Conflicts with Prettier** | Both running? | Remove Prettier, Biome replaces it |
| **Slow on large codebase** | Checking too many files? | Add ignore patterns in biome.json |
| **Can't migrate from ESLint** | Complex config? | Use `biome migrate eslint`, review output |

## Installation

```bash
npm install --save-dev @biomejs/biome

# Initialize configuration
npx @biomejs/biome init
```

## biome.json Configuration

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "complexity": {
        "noExcessiveCognitiveComplexity": {
          "level": "warn",
          "options": {
            "maxAllowedComplexity": 15
          }
        }
      },
      "correctness": {
        "noUnusedVariables": "warn",
        "noUnusedImports": "warn",
        "useExhaustiveDependencies": "warn"
      },
      "style": {
        "noNonNullAssertion": "off",
        "useImportType": "warn"
      },
      "suspicious": {
        "noExplicitAny": "warn"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "es5",
      "semicolons": "always"
    }
  },
  "files": {
    "ignore": [
      "node_modules",
      "dist",
      "build",
      ".next",
      "coverage",
      "*.gen.ts"
    ]
  }
}
```

## Package.json Scripts

```json
{
  "scripts": {
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "check": "biome check --write --unsafe ."
  }
}
```

## Common Rules

| Rule | Level | Description |
|------|-------|-------------|
| `noUnusedVariables` | warn | Flag unused variables |
| `noUnusedImports` | warn | Flag unused imports |
| `noExplicitAny` | warn | Discourage `any` type |
| `useExhaustiveDependencies` | warn | Check React hook deps |
| `noNonNullAssertion` | off | Allow `!` operator |
| `useImportType` | warn | Prefer `import type` |

## VS Code Integration

```json
// .vscode/settings.json
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "[javascript]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[typescript]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "biomejs.biome"
  }
}
```

## Pre-commit Hook

```bash
# Install husky
npm install --save-dev husky lint-staged

# package.json
{
  "lint-staged": {
    "*.{js,jsx,ts,tsx}": [
      "biome check --write --no-errors-on-unmatched"
    ]
  }
}
```

## Migration from ESLint/Prettier

```bash
# Biome can migrate your config
npx @biomejs/biome migrate eslint --write
npx @biomejs/biome migrate prettier --write
```

## CLI Commands

```bash
# Check all files
biome check .

# Fix issues
biome check --write .

# Format only
biome format --write .

# Lint only
biome lint .

# Check specific files
biome check src/components/**/*.tsx

# CI mode (exit with error)
biome ci .
```

## Ignoring Code

```typescript
// Ignore next line
// biome-ignore lint/suspicious/noExplicitAny: needed for legacy API
const data: any = await fetch('/api');

// Ignore whole file (at top)
// biome-ignore-all lint/style/useImportType
```

## Production Readiness

### Recommended Configuration

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "a11y": {
        "recommended": true
      },
      "complexity": {
        "noExcessiveCognitiveComplexity": {
          "level": "error",
          "options": { "maxAllowedComplexity": 15 }
        },
        "noExcessiveNestedTestSuites": "warn"
      },
      "correctness": {
        "noUnusedVariables": "error",
        "noUnusedImports": "error",
        "useExhaustiveDependencies": "error"
      },
      "performance": {
        "noAccumulatingSpread": "warn",
        "noDelete": "warn"
      },
      "security": {
        "noDangerouslySetInnerHtml": "error",
        "noGlobalEval": "error"
      },
      "suspicious": {
        "noExplicitAny": "warn",
        "noConsoleLog": "warn"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "es5",
      "semicolons": "always"
    }
  },
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  }
}
```

### CI Integration

```yaml
# .github/workflows/lint.yml
name: Lint

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Biome CI
        run: npx @biomejs/biome ci .

      # Or with caching
      - name: Cache Biome
        uses: actions/cache@v4
        with:
          path: ~/.cache/biome
          key: ${{ runner.os }}-biome-${{ hashFiles('biome.json') }}

      - name: Check
        run: npx @biomejs/biome check --diagnostic-level=error .
```

### Git Hooks

```json
// package.json
{
  "scripts": {
    "prepare": "husky install",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "lint:ci": "biome ci ."
  },
  "lint-staged": {
    "*.{js,jsx,ts,tsx,json}": [
      "biome check --write --no-errors-on-unmatched --files-ignore-unknown=true"
    ]
  }
}
```

```bash
# .husky/pre-commit
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
```

### Error Handling

```typescript
// biome.json - Configure severity levels
{
  "linter": {
    "rules": {
      // Block CI on these
      "correctness": {
        "noUnusedVariables": "error",
        "useExhaustiveDependencies": "error"
      },
      // Allow in development, fail in CI
      "suspicious": {
        "noConsoleLog": {
          "level": "warn",
          "options": {}
        }
      }
    }
  }
}

// Stricter CI check
// package.json
{
  "scripts": {
    "lint:dev": "biome check .",
    "lint:ci": "biome check --diagnostic-level=error --max-diagnostics=50 ."
  }
}
```

### Testing Integration

```typescript
// vitest.config.ts - Run biome before tests
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './src/test/global-setup.ts',
  },
});

// src/test/global-setup.ts
import { execSync } from 'child_process';

export default function setup() {
  try {
    execSync('npx @biomejs/biome check .', { stdio: 'pipe' });
  } catch (error) {
    console.error('Biome check failed. Fix linting issues before running tests.');
    process.exit(1);
  }
}
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Lint errors | 0 |
| Warnings | < 10 |
| Format issues | 0 |
| Cognitive complexity | < 15 |

### Checklist

- [ ] Recommended rules enabled
- [ ] Security rules enabled
- [ ] a11y rules enabled
- [ ] Cognitive complexity limit
- [ ] CI integration with biome ci
- [ ] Pre-commit hooks with lint-staged
- [ ] VS Code extension configured
- [ ] Console.log warnings
- [ ] Unused variables as errors
- [ ] VCS integration enabled

## Reference Documentation
- [Rules Reference](quick-ref/rules.md)
- [VS Code Setup](quick-ref/vscode.md)
