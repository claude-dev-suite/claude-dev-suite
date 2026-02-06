# Biome Configuration Quick Reference

> **Knowledge Base:** Read `knowledge/biome/configuration.md` for complete documentation.

## Installation

```bash
npm install --save-dev --save-exact @biomejs/biome
npx @biomejs/biome init
```

## Basic Configuration

```json
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  }
}
```

## Formatter Configuration

```json
{
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf",
    "ignore": ["**/dist", "**/build"]
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "jsxQuoteStyle": "double",
      "quoteProperties": "asNeeded",
      "trailingCommas": "all",
      "semicolons": "always",
      "arrowParentheses": "always",
      "bracketSpacing": true,
      "bracketSameLine": false
    }
  },
  "json": {
    "formatter": {
      "trailingCommas": "none"
    }
  }
}
```

## Linter Configuration

```json
{
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "complexity": {
        "noExcessiveCognitiveComplexity": "warn",
        "noForEach": "off"
      },
      "correctness": {
        "noUnusedVariables": "error",
        "useExhaustiveDependencies": "warn"
      },
      "style": {
        "noNonNullAssertion": "warn",
        "useConst": "error",
        "useTemplate": "error"
      },
      "suspicious": {
        "noExplicitAny": "warn",
        "noArrayIndexKey": "warn"
      },
      "nursery": {
        "noConsole": "warn"
      }
    }
  }
}
```

## Rule Categories

```json
{
  "linter": {
    "rules": {
      // Code quality and maintainability
      "complexity": {
        "noBannedTypes": "error",
        "noExcessiveCognitiveComplexity": "warn",
        "noExcessiveNestedTestSuites": "error",
        "noForEach": "off",
        "noStaticOnlyClass": "error",
        "noUselessCatch": "error",
        "noUselessConstructor": "error",
        "noUselessEmptyExport": "error",
        "noUselessFragments": "error",
        "noUselessLabel": "error",
        "noUselessLoneBlockStatements": "error",
        "noUselessRename": "error",
        "noUselessSwitchCase": "error",
        "noUselessTernary": "error",
        "noUselessThisAlias": "error",
        "noUselessTypeConstraint": "error",
        "noVoid": "error",
        "noWith": "error",
        "useFlatMap": "error",
        "useLiteralKeys": "error",
        "useOptionalChain": "error",
        "useSimpleNumberKeys": "error",
        "useSimplifiedLogicExpression": "error"
      },

      // Bug prevention
      "correctness": {
        "noChildrenProp": "error",
        "noConstAssign": "error",
        "noConstantCondition": "error",
        "noConstructorReturn": "error",
        "noEmptyCharacterClassInRegex": "error",
        "noEmptyPattern": "error",
        "noGlobalObjectCalls": "error",
        "noInnerDeclarations": "error",
        "noInvalidConstructorSuper": "error",
        "noInvalidNewBuiltin": "error",
        "noNewSymbol": "error",
        "noNonoctalDecimalEscape": "error",
        "noPrecisionLoss": "error",
        "noSelfAssign": "error",
        "noSetterReturn": "error",
        "noStringCaseMismatch": "error",
        "noSwitchDeclarations": "error",
        "noUndeclaredVariables": "error",
        "noUnreachable": "error",
        "noUnreachableSuper": "error",
        "noUnsafeFinally": "error",
        "noUnsafeOptionalChaining": "error",
        "noUnusedLabels": "error",
        "noUnusedVariables": "error",
        "useArrayLiterals": "error",
        "useExhaustiveDependencies": "warn",
        "useHookAtTopLevel": "error",
        "useIsNan": "error",
        "useValidForDirection": "error",
        "useYield": "error"
      },

      // Code style
      "style": {
        "noArguments": "error",
        "noCommaOperator": "error",
        "noDefaultExport": "off",
        "noImplicitBoolean": "off",
        "noInferrableTypes": "error",
        "noNamespace": "error",
        "noNegationElse": "error",
        "noNonNullAssertion": "warn",
        "noParameterAssign": "error",
        "noParameterProperties": "off",
        "noRestrictedGlobals": "off",
        "noShoutyConstants": "off",
        "noUnusedTemplateLiteral": "error",
        "noUselessElse": "error",
        "noVar": "error",
        "useBlockStatements": "off",
        "useCollapsedElseIf": "error",
        "useConst": "error",
        "useDefaultParameterLast": "error",
        "useEnumInitializers": "error",
        "useExponentiationOperator": "error",
        "useExportType": "error",
        "useFilenamingConvention": "off",
        "useForOf": "error",
        "useFragmentSyntax": "error",
        "useImportType": "error",
        "useLiteralEnumMembers": "error",
        "useNamingConvention": "off",
        "useNodejsImportProtocol": "error",
        "useNumberNamespace": "error",
        "useNumericLiterals": "error",
        "useSelfClosingElements": "error",
        "useShorthandArrayType": "error",
        "useShorthandAssign": "error",
        "useShorthandFunctionType": "error",
        "useSingleCaseStatement": "error",
        "useSingleVarDeclarator": "error",
        "useTemplate": "error"
      },

      // Suspicious code patterns
      "suspicious": {
        "noArrayIndexKey": "warn",
        "noAssignInExpressions": "error",
        "noAsyncPromiseExecutor": "error",
        "noCatchAssign": "error",
        "noClassAssign": "error",
        "noCommentText": "error",
        "noCompareNegZero": "error",
        "noConfusingLabels": "error",
        "noConfusingVoidType": "error",
        "noConsoleLog": "off",
        "noConstEnum": "error",
        "noControlCharactersInRegex": "error",
        "noDebugger": "error",
        "noDoubleEquals": "error",
        "noDuplicateCase": "error",
        "noDuplicateClassMembers": "error",
        "noDuplicateJsxProps": "error",
        "noDuplicateObjectKeys": "error",
        "noDuplicateParameters": "error",
        "noEmptyBlockStatements": "error",
        "noExplicitAny": "warn",
        "noExtraNonNullAssertion": "error",
        "noFallthroughSwitchClause": "error",
        "noFunctionAssign": "error",
        "noGlobalAssign": "error",
        "noImportAssign": "error",
        "noLabelVar": "error",
        "noMisleadingCharacterClass": "error",
        "noMisleadingInstantiation": "error",
        "noPrototypeBuiltins": "error",
        "noRedeclare": "error",
        "noRedundantUseStrict": "error",
        "noSelfCompare": "error",
        "noShadowRestrictedNames": "error",
        "noSparseArray": "error",
        "noThenProperty": "error",
        "noUnsafeDeclarationMerging": "error",
        "noUnsafeNegation": "error",
        "useAwait": "error",
        "useDefaultSwitchClauseLast": "error",
        "useGetterReturn": "error",
        "useIsArray": "error",
        "useNamespaceKeyword": "error",
        "useValidTypeof": "error"
      }
    }
  }
}
```

## CLI Commands

```bash
# Format files
npx @biomejs/biome format --write .

# Lint files
npx @biomejs/biome lint .

# Lint and fix
npx @biomejs/biome lint --write .

# Check everything
npx @biomejs/biome check .

# Check and fix
npx @biomejs/biome check --write .

# Organize imports
npx @biomejs/biome check --organize-imports-enabled=true --write .

# Specific files
npx @biomejs/biome format src/index.ts
npx @biomejs/biome lint "src/**/*.ts"
```

## package.json Scripts

```json
{
  "scripts": {
    "lint": "biome lint .",
    "lint:fix": "biome lint --write .",
    "format": "biome format --write .",
    "check": "biome check .",
    "check:fix": "biome check --write ."
  }
}
```

**Official docs:** https://biomejs.dev/reference/configuration/
