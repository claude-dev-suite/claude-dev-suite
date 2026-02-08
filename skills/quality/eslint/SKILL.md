---
name: eslint
description: |
  ESLint - pluggable JavaScript/TypeScript linter

  USE WHEN: user mentions "ESLint", "JavaScript linting", ".eslintrc", asks about "eslint config", "linting rules", "eslint plugins", "flat config"

  DO NOT USE FOR: Biome - use `eslint-biome` skill, TypeScript-specific - use `typescript-eslint` skill, code quality principles - use `quality-common`
allowed-tools: Read, Grep, Glob
---
# ESLint - Quick Reference

## When to Use This Skill
- Configure linting for JavaScript/TypeScript projects
- Create custom rules
- Integrate with Prettier and other tools

## When NOT to Use This Skill
- **ESLint 9 flat config + Biome** - Use `eslint-biome` skill for modern setup
- **TypeScript-specific rules** - Use `typescript-eslint` skill
- **Code quality principles** - Use `quality-common` for SOLID/Clean Code
- **SonarQube integration** - Use `sonarqube` skill

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `eslint` for comprehensive documentation.

## Basic Setup

```bash
npm install -D eslint @eslint/js
npx eslint --init
```

## Flat Config (ESLint 9+)

### eslint.config.js
```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/explicit-function-return-type': 'warn',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.config.js'],
  },
];
```

### With Prettier
```javascript
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier, // Must be last
];
```

## Legacy Config (.eslintrc)

```json
{
  "root": true,
  "env": { "browser": true, "es2021": true, "node": true },
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "rules": {
    "no-console": "warn",
    "@typescript-eslint/no-explicit-any": "error"
  }
}
```

## CLI Usage

```bash
# Lint files
npx eslint src/

# Fix auto-fixable issues
npx eslint src/ --fix

# Check specific files
npx eslint "src/**/*.{ts,tsx}"
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using legacy .eslintrc in new projects | Deprecated in ESLint 9 | Use flat config (eslint.config.mjs) |
| No TypeScript type checking | Misses type-aware issues | Use `recommendedTypeChecked` preset |
| Disabling rules with comments everywhere | Code smell, defeats purpose | Fix the issue or adjust rule config |
| Not caching in CI | Slow linting | Use `--cache` flag |
| Conflicting Prettier rules | Formatting wars | Use `eslint-config-prettier` |
| Ignoring warnings | Accumulate tech debt | Treat warnings as errors in CI |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| "Failed to load config" error | Wrong config format | Check eslint.config.mjs syntax |
| Type-aware rules not working | Missing parserOptions | Add `projectService: true` to config |
| Linting very slow | No caching, type checking all files | Enable cache, limit type checking to TS files |
| Rules from plugin not found | Plugin not in flat config format | Check plugin compatibility with ESLint 9 |
| Prettier conflicts | Both formatting same code | Add `eslint-config-prettier` last |
| File not being linted | In ignores array | Check `ignores` in config |
