---
name: eslint-biome
description: |
  ESLint 9 flat config and Biome linter configuration. Covers typescript-eslint,
  rule categories, migration from legacy config, and performance optimization.

  USE WHEN: user mentions "ESLint 9", "Biome", "flat config", "eslint.config.mjs", asks about "typescript-eslint", "migration to ESLint 9", "linter performance", "Biome vs ESLint"

  DO NOT USE FOR: legacy ESLint - use `eslint` skill, Java/Spring - use SonarQube, basic linting concepts - use `quality-common`
allowed-tools: Read, Grep, Glob
---
# ESLint 9 & Biome Linting

## When NOT to Use This Skill
- **Legacy ESLint (.eslintrc)** - Use `eslint` skill for old config format
- **TypeScript-only rules** - Use `typescript-eslint` skill for deep TypeScript linting
- **Java/Kotlin linting** - Use `sonarqube` skill
- **Code quality principles** - Use `quality-common` for SOLID/Clean Code

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `eslint` or `biome` for comprehensive documentation.

## Official References

| Tool | Documentation |
|------|---------------|
| ESLint 9 | https://eslint.org/docs/latest/ |
| typescript-eslint | https://typescript-eslint.io/ |
| Biome | https://biomejs.dev/ |
| ESLint Rules | https://eslint.org/docs/latest/rules/ |
| Biome Rules | https://biomejs.dev/linter/rules/ |

---

## ESLint 9 Flat Config

### Basic Setup

```bash
npm install --save-dev eslint @eslint/js typescript typescript-eslint
```

```javascript
// eslint.config.mjs
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
```

### TypeScript with Type Checking

```javascript
// eslint.config.mjs
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
```

### Full Configuration Example

```javascript
// eslint.config.mjs
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default tseslint.config(
  // Ignores
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.js'],
  },

  // Base configs
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Prevent bugs
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // Code quality
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',

      // Complexity
      'complexity': ['warn', 10],
      'max-depth': ['warn', 4],
      'max-lines-per-function': ['warn', 50],
    },
  },

  // React files
  {
    files: ['**/*.tsx'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
    },
    settings: {
      react: { version: 'detect' },
    },
  },

  // Test files
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'max-lines-per-function': 'off',
    },
  },
);
```

---

## typescript-eslint Presets

| Preset | Description |
|--------|-------------|
| `recommended` | Core rules without type checking |
| `recommendedTypeChecked` | Recommended + type-aware rules |
| `strict` | All recommended + stricter rules |
| `strictTypeChecked` | Strict + type-aware rules |
| `stylistic` | Style/convention rules |
| `stylisticTypeChecked` | Stylistic + type-aware |

### Key Type-Checked Rules

```javascript
rules: {
  // Async/Promise safety
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/await-thenable': 'error',
  '@typescript-eslint/require-await': 'error',

  // Type safety
  '@typescript-eslint/no-unsafe-argument': 'error',
  '@typescript-eslint/no-unsafe-assignment': 'error',
  '@typescript-eslint/no-unsafe-call': 'error',
  '@typescript-eslint/no-unsafe-member-access': 'error',
  '@typescript-eslint/no-unsafe-return': 'error',

  // Best practices
  '@typescript-eslint/no-unnecessary-condition': 'error',
  '@typescript-eslint/prefer-nullish-coalescing': 'error',
  '@typescript-eslint/prefer-optional-chain': 'error',
}
```

---

## Biome

### Installation

```bash
npm install --save-dev @biomejs/biome
npx @biomejs/biome init
```

### Configuration (biome.json)

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
          "options": { "maxAllowedComplexity": 15 }
        }
      },
      "correctness": {
        "noUnusedImports": "error",
        "noUnusedVariables": "error",
        "useExhaustiveDependencies": "warn"
      },
      "suspicious": {
        "noExplicitAny": "error",
        "noConsoleLog": "warn"
      },
      "style": {
        "useConst": "error",
        "noNonNullAssertion": "warn"
      },
      "security": {
        "noDangerouslySetInnerHtml": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always"
    }
  }
}
```

### Rule Categories

| Category | Rules | Description |
|----------|-------|-------------|
| **a11y** | 40+ | Accessibility problems |
| **complexity** | 15+ | Code simplification |
| **correctness** | 60+ | Guaranteed errors |
| **performance** | 10+ | Efficiency improvements |
| **security** | 5+ | Security flaws |
| **style** | 50+ | Consistent code style |
| **suspicious** | 50+ | Likely incorrect patterns |
| **nursery** | 100+ | Experimental rules |

### Commands

```bash
# Check all
npx biome check .

# Fix auto-fixable issues
npx biome check --write .

# Lint only
npx biome lint .

# Format only
npx biome format --write .

# CI mode (no writes)
npx biome ci .
```

---

## Migration: ESLint to Biome

```bash
# Automatic migration
npx @biomejs/biome migrate eslint --write

# With inspired rules
npx @biomejs/biome migrate eslint --include-inspired --write

# Migrate prettier config too
npx @biomejs/biome migrate prettier --write
```

### Supported ESLint Plugins

| Plugin | Biome Support |
|--------|---------------|
| @typescript-eslint | Full |
| eslint-plugin-react | Full |
| eslint-plugin-react-hooks | Full |
| eslint-plugin-jsx-a11y | Full |
| eslint-plugin-unicorn | Partial |
| eslint-plugin-import | Partial |

### Rule Name Mapping

| ESLint | Biome |
|--------|-------|
| `no-unused-vars` | `noUnusedVariables` |
| `no-console` | `noConsoleLog` |
| `prefer-const` | `useConst` |
| `@typescript-eslint/no-explicit-any` | `noExplicitAny` |

---

## ESLint vs Biome

| Feature | ESLint 9 | Biome |
|---------|----------|-------|
| **Speed** | ~3-5s/10k lines | ~200ms/10k lines |
| **Config** | JavaScript | JSON/JSONC |
| **Plugins** | 1000+ | Built-in only |
| **Formatter** | Needs Prettier | Built-in |
| **Type-aware** | Full support | ~85% coverage |
| **Languages** | JS/TS + plugins | JS/TS/JSON/CSS |

### When to Use ESLint

- Need specific plugins (import sorting, testing rules)
- Require full type-aware linting
- Have complex dynamic configuration

### When to Use Biome

- Speed is critical (large codebase, CI)
- Want unified linting + formatting
- Don't need extensive plugin ecosystem

---

## CI Integration

### ESLint (GitHub Actions)

```yaml
- name: Lint
  run: npx eslint . --max-warnings=0

# With caching
- name: Lint with cache
  run: npx eslint . --cache --cache-location node_modules/.cache/eslint
```

### Biome (GitHub Actions)

```yaml
- name: Setup Biome
  uses: biomejs/setup-biome@v2
  with:
    version: latest

- name: Run Biome
  run: biome ci .
```

---

## Checklist

### ESLint Setup
- [ ] Using flat config (eslint.config.mjs)
- [ ] Type-checked rules enabled
- [ ] No deprecated eslintrc format
- [ ] Strict TypeScript rules
- [ ] CI caching configured

### Biome Setup
- [ ] biome.json configured
- [ ] Recommended rules enabled
- [ ] Formatter settings match team style
- [ ] CI mode in pipeline

### Metrics

| Metric | Target |
|--------|--------|
| Lint warnings | 0 |
| Lint errors | 0 |
| Type coverage | > 95% |
| Lint time (CI) | < 30s |

---

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using ESLint without type checking | Misses 50% of TS issues | Use `recommendedTypeChecked` |
| Biome + ESLint both linting same files | Duplicate work, conflicts | Choose one per file type |
| No ignores in flat config | Lints dist/, node_modules/ | Add ignores at top of config |
| Type checking all JS files | Slow, JS has no types | Limit to `**/*.ts` files only |
| Not using Biome CI mode | Different results locally vs CI | Use `biome ci .` in pipelines |
| Mixing .eslintrc and flat config | Confusing, deprecated pattern | Migrate fully to flat config |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| ESLint not finding types | `projectService` not enabled | Add `projectService: true` to parserOptions |
| Biome migration creates 1000+ errors | Stricter rules than ESLint | Use `--write` to auto-fix, adjust rules |
| Linting takes 2+ minutes | Type checking entire codebase | Use `files: ['**/*.ts']` for type rules |
| Biome doesn't support plugin X | Limited plugin ecosystem | Stick with ESLint or find alternative |
| Flat config not recognized | Wrong file name | Must be `eslint.config.mjs` (not .js) |
| Rules overriding each other | Order in config array | Later configs override earlier ones |

---

## Related Skills

- [TypeScript](../../languages/typescript/SKILL.md)
- [Quality Principles](../common/SKILL.md)
- [GitHub Actions](../../ci-cd/github-actions/SKILL.md)
