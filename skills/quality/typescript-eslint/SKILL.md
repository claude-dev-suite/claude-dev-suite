---
name: typescript-eslint
description: |
  typescript-eslint - ESLint plugin for TypeScript

  USE WHEN: user mentions "typescript-eslint", "TypeScript linting", "type-aware rules", asks about "no-floating-promises", "TypeScript ESLint config", "@typescript-eslint rules"

  DO NOT USE FOR: ESLint 9 full setup - use `eslint-biome` skill, Biome - use `eslint-biome`, general quality - use `quality-common`
allowed-tools: Read, Grep, Glob
---
# typescript-eslint - Quick Reference

## When to Use This Skill
- Configure ESLint for TypeScript projects
- Type-aware rules for TypeScript
- Migration from TSLint

## When NOT to Use This Skill
- **Full ESLint 9 setup** - Use `eslint-biome` skill for complete configuration
- **Biome linter** - Use `eslint-biome` skill for Biome setup
- **Code quality principles** - Use `quality-common` for SOLID/Clean Code
- **Java/Kotlin** - Use `sonarqube` skill for JVM languages

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `typescript-eslint` for comprehensive documentation.

## Basic Setup

```bash
npm install -D eslint typescript-eslint
```

## Flat Config (ESLint 9+)

### eslint.config.mjs
```javascript
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
```

### Type-Aware Linting
```javascript
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

### Strict Configuration
```javascript
export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
);
```

## Common Rules

```javascript
{
  rules: {
    // Prevent unused variables
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_'
    }],

    // Require explicit return types
    '@typescript-eslint/explicit-function-return-type': 'warn',

    // Prevent any usage
    '@typescript-eslint/no-explicit-any': 'error',

    // Require await in async functions
    '@typescript-eslint/require-await': 'error',

    // Prevent floating promises
    '@typescript-eslint/no-floating-promises': 'error',

    // Consistent type imports
    '@typescript-eslint/consistent-type-imports': 'error',
  }
}
```

## File-Specific Rules

```javascript
export default tseslint.config(
  // ... base config
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Not using type-aware rules | Misses Promise, async issues | Use `recommendedTypeChecked` |
| Allowing `any` everywhere | Defeats TypeScript purpose | Set `no-explicit-any: error` |
| No `require-await` rule | Unnecessary async keywords | Enable type-aware async rules |
| Type checking JS files | JS has no types | Use `disableTypeChecked` for .js |
| Disabling rules in test files | Tests need quality too | Only disable `no-explicit-any` if needed |
| Ignoring unused variables | Code smell, unused imports | Use `no-unused-vars` with ignore pattern |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Type-aware rules not working | Missing `projectService: true` | Add to languageOptions.parserOptions |
| Linting very slow | Type checking all files | Limit type rules to `**/*.ts` only |
| "Unsafe" errors everywhere | Strict type checking | Use `strictTypeChecked` or disable specific rules |
| Promise errors not caught | Missing `no-floating-promises` | Enable in recommendedTypeChecked preset |
| Unused imports not detected | Wrong rule configuration | Use `@typescript-eslint/no-unused-vars` |
| Rules conflict with Prettier | Both formatting code | Add `eslint-config-prettier` last |
