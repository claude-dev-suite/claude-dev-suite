# Biome Migration Quick Reference

> **Knowledge Base:** Read `knowledge/biome/migration.md` for complete documentation.

## From ESLint + Prettier

```bash
# Install Biome
npm install --save-dev --save-exact @biomejs/biome

# Initialize config
npx @biomejs/biome init

# Migrate ESLint config
npx @biomejs/biome migrate eslint --write

# Migrate Prettier config
npx @biomejs/biome migrate prettier --write

# Remove old packages
npm uninstall eslint prettier eslint-config-prettier eslint-plugin-react \
  eslint-plugin-react-hooks @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser eslint-plugin-import

# Remove old config files
rm .eslintrc* .prettierrc* .eslintignore .prettierignore
```

## ESLint Rule Mapping

```json
// ESLint -> Biome mapping

// @typescript-eslint rules
"@typescript-eslint/no-explicit-any" -> "suspicious/noExplicitAny"
"@typescript-eslint/no-unused-vars" -> "correctness/noUnusedVariables"
"@typescript-eslint/no-non-null-assertion" -> "style/noNonNullAssertion"
"@typescript-eslint/ban-types" -> "complexity/noBannedTypes"
"@typescript-eslint/prefer-as-const" -> "style/useAsConstAssertion"

// React rules
"react-hooks/rules-of-hooks" -> "correctness/useHookAtTopLevel"
"react-hooks/exhaustive-deps" -> "correctness/useExhaustiveDependencies"
"react/no-array-index-key" -> "suspicious/noArrayIndexKey"
"react/jsx-key" -> "correctness/useJsxKeyInIterable"

// Import rules
"import/no-duplicates" -> "correctness/noDuplicateImports" (partial)

// General ESLint rules
"no-console" -> "suspicious/noConsoleLog"
"no-debugger" -> "suspicious/noDebugger"
"no-unused-vars" -> "correctness/noUnusedVariables"
"no-var" -> "style/noVar"
"prefer-const" -> "style/useConst"
"eqeqeq" -> "suspicious/noDoubleEquals"
"no-empty" -> "suspicious/noEmptyBlockStatements"
```

## Prettier Option Mapping

```json
// Prettier -> Biome mapping

// biome.json
{
  "formatter": {
    // printWidth -> lineWidth
    "lineWidth": 100,

    // tabWidth -> indentWidth
    "indentWidth": 2,

    // useTabs -> indentStyle
    "indentStyle": "space",

    // endOfLine -> lineEnding
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      // singleQuote -> quoteStyle
      "quoteStyle": "single",

      // jsxSingleQuote -> jsxQuoteStyle
      "jsxQuoteStyle": "double",

      // quoteProps -> quoteProperties
      "quoteProperties": "asNeeded",

      // trailingComma -> trailingCommas
      "trailingCommas": "all",

      // semi -> semicolons
      "semicolons": "always",

      // arrowParens -> arrowParentheses
      "arrowParentheses": "always",

      // bracketSpacing -> bracketSpacing
      "bracketSpacing": true,

      // bracketSameLine -> bracketSameLine
      "bracketSameLine": false
    }
  }
}
```

## Update Scripts

```json
// Before (ESLint + Prettier)
{
  "scripts": {
    "lint": "eslint . --ext .ts,.tsx",
    "lint:fix": "eslint . --ext .ts,.tsx --fix",
    "format": "prettier --write \"**/*.{ts,tsx,json,md}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,json,md}\""
  }
}

// After (Biome)
{
  "scripts": {
    "lint": "biome lint .",
    "lint:fix": "biome lint --write .",
    "format": "biome format --write .",
    "format:check": "biome format .",
    "check": "biome check .",
    "check:fix": "biome check --write ."
  }
}
```

## VS Code Setup

```json
// .vscode/settings.json
{
  // Disable ESLint and Prettier
  "eslint.enable": false,
  "prettier.enable": false,

  // Enable Biome
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "quickfix.biome": "explicit",
    "source.organizeImports.biome": "explicit"
  },

  // Specific language settings
  "[javascript]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[typescript]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[json]": {
    "editor.defaultFormatter": "biomejs.biome"
  }
}
```

## Git Hooks (lint-staged)

```json
// package.json
{
  "lint-staged": {
    "*.{js,ts,jsx,tsx,json}": [
      "biome check --write --no-errors-on-unmatched"
    ]
  }
}
```

## CI Configuration

```yaml
# GitHub Actions
name: CI

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx @biomejs/biome ci .
```

## Ignore Patterns

```json
// biome.json
{
  "files": {
    "ignore": [
      "node_modules",
      "dist",
      "build",
      ".next",
      "coverage",
      "*.min.js",
      "generated/**"
    ]
  },
  "formatter": {
    "ignore": ["**/*.md"]
  },
  "linter": {
    "ignore": ["**/*.test.ts"]
  }
}
```

## Inline Ignores

```typescript
// Ignore next line
// biome-ignore lint/suspicious/noExplicitAny: reason
const data: any = {};

// Ignore specific rule
// biome-ignore lint/correctness/noUnusedVariables: will be used later
const unused = 'value';

// Ignore formatting
// biome-ignore format: keep manual formatting
const matrix = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
```

**Official docs:** https://biomejs.dev/guides/migrate-eslint-prettier/
