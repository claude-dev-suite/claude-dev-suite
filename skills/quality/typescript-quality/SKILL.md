---
name: typescript-quality
description: |
  TypeScript/JavaScript code quality with ESLint, Biome, and strict TypeScript.
  Covers linting, formatting, type safety, and best practices.

  USE WHEN: user works with "TypeScript", "JavaScript", "ESLint", "Biome", asks about "TS strict mode", "type safety", "linting rules", "code formatting"

  DO NOT USE FOR: SonarQube - use `sonarqube` skill, testing - use Vitest/Jest skills, security - use security skills
allowed-tools: Read, Grep, Glob, Bash
---
# TypeScript Quality - Quick Reference

## When NOT to Use This Skill
- **SonarQube integration** - Use `sonarqube` skill
- **Test configuration** - Use `vitest` skill
- **Security scanning** - Use security skills
- **React-specific patterns** - Use `react` skill

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `typescript` or `biome` for comprehensive documentation.

## Tool Comparison

| Tool | Speed | Type-aware | Configuration |
|------|-------|------------|---------------|
| **Biome** | Fastest | No | Minimal |
| **ESLint** | Slower | Yes (with TS) | Extensive |
| **TypeScript** | N/A | Yes | tsconfig.json |

**Recommendation**: Use Biome for formatting + basic linting, ESLint for type-aware rules.

## Biome Setup (Recommended)

### Installation

```bash
npm install -D @biomejs/biome
npx biome init
```

### biome.json

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": { "enabled": true },
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
      "suspicious": {
        "noExplicitAny": "error",
        "noImplicitAnyLet": "error"
      },
      "style": {
        "noNonNullAssertion": "warn",
        "useConst": "error"
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
  }
}
```

### Commands

```bash
# Check all
npx biome check .

# Fix auto-fixable
npx biome check --write .

# Format only
npx biome format --write .

# Lint only
npx biome lint .

# CI mode (no write)
npx biome ci .
```

## ESLint Setup (Type-aware)

### Installation

```bash
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

### eslint.config.js (Flat Config - ESLint 9+)

```javascript
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Type safety
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',

      // Best practices
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // Code quality
      'complexity': ['warn', { max: 10 }],
      'max-depth': ['warn', { max: 4 }],
      'max-lines-per-function': ['warn', { max: 50 }],
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.config.js'],
  }
);
```

### Commands

```bash
# Lint
npx eslint .

# Fix auto-fixable
npx eslint --fix .

# Show rule details
npx eslint --print-config src/index.ts
```

## TypeScript Strict Mode

### tsconfig.json (Maximum Strictness)

```json
{
  "compilerOptions": {
    // Strict type checking
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noPropertyAccessFromIndexSignature": true,

    // Additional checks
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,

    // Module resolution
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ES2022",

    // Interop
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

### Key Strict Flags Explained

| Flag | Effect | Example |
|------|--------|---------|
| `noUncheckedIndexedAccess` | Array access returns `T \| undefined` | `arr[0]` is `T \| undefined` |
| `exactOptionalPropertyTypes` | `{ a?: string }` means string or missing, not `undefined` | Can't assign `undefined` explicitly |
| `noPropertyAccessFromIndexSignature` | Forces bracket notation for index signatures | `obj['key']` not `obj.key` |

## Common Code Smells & Fixes

### 1. Excessive `any` Usage

```typescript
// BAD
function process(data: any): any {
  return data.value;
}

// GOOD
interface DataItem {
  value: string;
}

function process(data: DataItem): string {
  return data.value;
}

// GOOD - When truly unknown
function process(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'value' in data) {
    return String((data as { value: unknown }).value);
  }
  throw new Error('Invalid data');
}
```

### 2. Type Assertions Overuse

```typescript
// BAD
const user = response.data as User;

// GOOD - Use type guards
function isUser(data: unknown): data is User {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'email' in data
  );
}

if (isUser(response.data)) {
  // response.data is User here
}

// GOOD - Use Zod for runtime validation
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
});

const user = UserSchema.parse(response.data);
```

### 3. Non-null Assertion

```typescript
// BAD
const element = document.getElementById('app')!;

// GOOD
const element = document.getElementById('app');
if (!element) {
  throw new Error('App element not found');
}

// GOOD - Optional chaining when appropriate
const value = element?.textContent ?? 'default';
```

### 4. Complex Conditionals

```typescript
// BAD
if (user && user.isActive && user.role === 'admin' && !user.suspended) {
  // ...
}

// GOOD - Extract to function
function canAccessAdmin(user: User | null): user is User {
  return (
    user !== null &&
    user.isActive &&
    user.role === 'admin' &&
    !user.suspended
  );
}

if (canAccessAdmin(user)) {
  // ...
}
```

### 5. Long Functions

```typescript
// BAD - 100+ line function
async function processOrder(order: Order) {
  // validation
  // calculation
  // database operations
  // notifications
  // logging
}

// GOOD - Split responsibilities
async function processOrder(order: Order) {
  validateOrder(order);
  const total = calculateTotal(order);
  await saveOrder(order, total);
  await notifyUser(order);
  logOrderProcessed(order);
}
```

## Pre-commit Setup

### package.json Scripts

```json
{
  "scripts": {
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "typecheck": "tsc --noEmit",
    "quality": "npm run typecheck && npm run lint"
  }
}
```

### Husky + lint-staged

```bash
npm install -D husky lint-staged
npx husky init
```

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": [
      "biome check --write --no-errors-on-unmatched"
    ]
  }
}
```

```bash
# .husky/pre-commit
npx lint-staged
```

## VS Code Settings

```json
// .vscode/settings.json
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.organizeImports.biome": "explicit",
    "quickfix.biome": "explicit"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

## Quality Metrics Targets

| Metric | Target | Tool |
|--------|--------|------|
| Cyclomatic Complexity | < 10 | ESLint complexity rule |
| Cognitive Complexity | < 15 | Biome/SonarQube |
| Function Length | < 50 lines | ESLint max-lines-per-function |
| File Length | < 300 lines | ESLint max-lines |
| Nesting Depth | < 4 levels | ESLint max-depth |
| Parameters | < 4 | ESLint max-params |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| `any` everywhere | Defeats type safety | Use proper types or `unknown` |
| `as` type assertions | Runtime errors | Use type guards or Zod |
| `!` non-null assertion | Potential runtime null | Proper null checking |
| Disabling lint rules inline | Technical debt | Fix the issue or configure globally |
| `@ts-ignore` | Hides real errors | Use `@ts-expect-error` with comment |
| No strict mode | Weaker guarantees | Enable all strict flags |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| ESLint slow on large projects | Type-aware rules expensive | Use project references, cache |
| Biome conflicts with ESLint | Both trying to format | Use Biome for format, ESLint for type rules |
| TypeScript error not caught by lint | Need type-aware rule | Use typescript-eslint with projectService |
| Import order inconsistent | No auto-organize | Enable Biome organizeImports |
| Pre-commit too slow | Running on all files | Use lint-staged for changed files only |

## Related Skills
- [Biome](../eslint-biome/SKILL.md)
- [ESLint](../eslint/SKILL.md)
- [SonarQube](../sonarqube/SKILL.md)
- [Clean Code](../../best-practices/clean-code/SKILL.md)
