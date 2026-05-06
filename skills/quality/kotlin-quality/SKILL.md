---
name: kotlin-quality
description: |
  Kotlin code quality toolchain — detekt (static analysis with rule sets, baseline,
  custom rules), ktlint (formatter + linter for the Kotlin style guide), and
  Compose-specific lint rules. Covers Gradle integration (KMP-aware), pre-commit
  hooks, CI integration, baseline files for legacy code, and config patterns for
  production apps including Jetpack Compose specifics (detekt-compose-rules).

  USE WHEN: user mentions "detekt", "ktlint", "ktlint-gradle", "detekt-gradle",
  "kotlin static analysis", "kotlin formatter", "kotlin lint",
  "compose-rules detekt", "kotlin code style", "detekt baseline"

  DO NOT USE FOR: Java-only static analysis - use SpotBugs/Checkstyle skill
  DO NOT USE FOR: Rust code quality - use `quality/rust-supply-chain`
  DO NOT USE FOR: Security-specific Kotlin issues - use `security/kotlin-security`
  DO NOT USE FOR: TypeScript linting - use eslint-specific skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Kotlin Quality — detekt + ktlint

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `detekt` or `ktlint`.

## Tool Comparison

| Tool | Purpose |
|---|---|
| **ktlint** | Formatter + minimal linter — enforces Kotlin official style. Auto-fixes most issues. |
| **detekt** | Comprehensive static analyzer — code smells, complexity, security, naming, magic numbers, performance, style. Highly configurable. |
| **Compose Rules (Twitter/Slack/Mrtn)** | Compose-specific lint rules — composable naming, side-effects, parameter ordering. Plugs into both detekt and ktlint. |
| **Android Lint** | Android-specific (resources, manifest, lifecycle). Run alongside, not replaced. |

**Use both ktlint and detekt** — complementary. ktlint for formatting, detekt for everything else.

## Setup — ktlint (Gradle Plugin)

```kotlin
// build.gradle.kts (root)
plugins {
    id("org.jlleitschuh.gradle.ktlint") version "12.1.1" apply false
}

subprojects {
    apply(plugin = "org.jlleitschuh.gradle.ktlint")

    configure<org.jlleitschuh.gradle.ktlint.KtlintExtension> {
        version.set("1.4.1")
        verbose.set(true)
        outputToConsole.set(true)
        coloredOutput.set(true)
        ignoreFailures.set(false)
        enableExperimentalRules.set(false)
        filter {
            exclude("**/generated/**")
            exclude("**/build/**")
            include("**/kotlin/**")
        }
    }
}
```

```bash
./gradlew ktlintCheck                              # check all modules
./gradlew ktlintFormat                              # auto-fix
./gradlew :shared:ktlintCheck                       # one module
```

### ktlint Configuration via .editorconfig

```editorconfig
# .editorconfig
root = true

[*.{kt,kts}]
indent_size = 4
max_line_length = 120
ij_kotlin_imports_layout = *,java.**,javax.**,kotlin.**,^

# ktlint-specific
ktlint_standard = enabled
ktlint_experimental = disabled
ktlint_function_naming_ignore_when_annotated_with = Composable,Test
ktlint_compose = enabled
```

## Setup — detekt

```kotlin
// build.gradle.kts (root)
plugins {
    id("io.gitlab.arturbosch.detekt") version "1.23.7" apply false
}

subprojects {
    apply(plugin = "io.gitlab.arturbosch.detekt")

    configure<io.gitlab.arturbosch.detekt.extensions.DetektExtension> {
        config.setFrom(files("$rootDir/config/detekt/detekt.yml"))
        baseline = file("$projectDir/detekt-baseline.xml")
        buildUponDefaultConfig = true
        autoCorrect = false                          // CI-safe
        parallel = true
    }

    dependencies {
        "detektPlugins"("io.gitlab.arturbosch.detekt:detekt-formatting:1.23.7")
        "detektPlugins"("io.nlopez.compose.rules:detekt:0.4.16")    // Compose rules
    }
}

tasks.withType<io.gitlab.arturbosch.detekt.Detekt>().configureEach {
    reports {
        html.required.set(true)
        xml.required.set(true)
        sarif.required.set(true)
    }
}
```

```bash
./gradlew detekt
./gradlew detektBaseline                              # generate baseline
./gradlew :shared:detekt
```

### detekt.yml — Production Config

```yaml
# config/detekt/detekt.yml
build:
  maxIssues: 0
  weights:

complexity:
  CyclomaticComplexMethod:
    threshold: 15
  LongMethod:
    threshold: 60
  LongParameterList:
    functionThreshold: 8
  TooManyFunctions:
    thresholdInClasses: 30
    ignoreAnnotatedFunctions:
      - 'Composable'

empty-blocks:
  active: true

exceptions:
  TooGenericExceptionCaught:
    exceptionNames:
      - 'Exception'
      - 'RuntimeException'
      - 'Throwable'
    allowedExceptionNameRegex: '_|(ignore|expected).*'

naming:
  FunctionNaming:
    functionPattern: '[a-z][a-zA-Z0-9]*'
    excludes: ['**/test/**', '**/androidTest/**']
    ignoreAnnotated:
      - 'Composable'                                  # PascalCase composables OK

performance:
  active: true

potential-bugs:
  HasPlatformType:
    active: true                                       # KMP-friendly: catch missing nullability

style:
  MagicNumber:
    ignoreNumbers: ['-1', '0', '1', '2', '100', '1000']
    ignoreEnums: true
  MaxLineLength:
    maxLineLength: 120
  ReturnCount:
    max: 4
  WildcardImport:
    active: true

formatting:                                            # ktlint-formatting plugin
  active: true
  android: false
  autoCorrect: false
```

### Baseline (For Legacy Code)

```bash
./gradlew detektBaseline    # generates detekt-baseline.xml — commit it
```

New issues fail CI; existing ones silently allowed. Reduce baseline over time.

## Compose Rules

Twitter/Slack/Mrtn maintain Compose-specific lint rules:

```kotlin
dependencies {
    "detektPlugins"("io.nlopez.compose.rules:detekt:0.4.16")
    // OR for ktlint
    "ktlintRuleset"("io.nlopez.compose.rules:ktlint:0.4.16")
}
```

Catches:
- `@Composable` not in PascalCase
- Modifier parameter not first
- `remember { mutableStateOf() }` instead of `by remember`
- Side effects outside `LaunchedEffect`
- Missing `key` in `LazyColumn.items`
- Composable returning unit named like accessor

## CI Integration — GitHub Actions

```yaml
# .github/workflows/quality.yml
name: Kotlin Quality

on: [push, pull_request]

jobs:
  ktlint-detekt:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { java-version: '17', distribution: 'temurin' }
      - uses: gradle/actions/setup-gradle@v4

      - name: ktlint
        run: ./gradlew ktlintCheck

      - name: detekt
        run: ./gradlew detekt

      - name: Upload SARIF (GitHub Code Scanning)
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: build/reports/detekt/detekt.sarif

      - name: Upload reports on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: quality-reports
          path: |
            **/build/reports/ktlint/
            **/build/reports/detekt/
```

## Pre-Commit Hook

```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    ktlint:
      glob: "*.{kt,kts}"
      run: ./gradlew ktlintFormat -PfilesToFormat={staged_files}
      stage_fixed: true
    detekt:
      glob: "*.{kt,kts}"
      run: ./gradlew detekt
```

## Custom detekt Rules

```kotlin
class NoPrintStatement : Rule() {
    override val issue = Issue(
        id = "NoPrintStatement",
        severity = Severity.Style,
        description = "Use Logger.d() instead of println()",
        debt = Debt.FIVE_MINS,
    )

    override fun visitCallExpression(expression: KtCallExpression) {
        super.visitCallExpression(expression)
        val name = expression.calleeExpression?.text
        if (name in setOf("println", "print")) {
            report(CodeSmell(issue, Entity.from(expression), "Use a logger"))
        }
    }
}

class CustomRuleSet : RuleSetProvider {
    override val ruleSetId: String = "custom"
    override fun instance(config: Config) = RuleSet(ruleSetId, listOf(NoPrintStatement()))
}
```

Register via `META-INF/services/io.gitlab.arturbosch.detekt.api.RuleSetProvider`.

## Wallet App Quality Checklist

For BHODL-style production:

- [ ] `ktlintCheck` and `detekt` in CI
- [ ] No baseline regressions (new issues block PR)
- [ ] Compose rules enabled (consistent composable patterns)
- [ ] No `println` / `Log.d` (use `Kermit` / `Timber`)
- [ ] No `TODO`/`FIXME` in main code (use issue tracker)
- [ ] Magic numbers explained or named constants
- [ ] Cyclomatic complexity ≤ 15 per function
- [ ] No `@Suppress` without comment explaining why
- [ ] All public types documented (KDoc)
- [ ] No platform types from Java interop without explicit nullability
- [ ] No `!!` force-unwrap in main code (review usage)

## detekt Rule Sets Cheat Sheet

| Rule set | Highlights |
|---|---|
| `complexity` | CyclomaticComplexMethod, LongMethod, LongParameterList, NestedBlockDepth |
| `coroutines` | RedundantSuspendModifier, GlobalCoroutineUsage |
| `empty-blocks` | EmptyFunctionBlock, EmptyCatchBlock |
| `exceptions` | TooGenericExceptionCaught, SwallowedException |
| `naming` | FunctionNaming, ClassNaming, VariableNaming |
| `performance` | ForEachOnRange, SpreadOperator |
| `potential-bugs` | EqualsAlwaysReturnsTrueOrFalse, HasPlatformType, NullableToStringCall |
| `style` | MagicNumber, ReturnCount, ThrowsCount, WildcardImport |
| `formatting` (via plugin) | All ktlint rules as detekt issues |

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Skipping ktlint/detekt in CI | Style/quality drifts | Both in CI on every PR |
| `autoCorrect = true` in CI | Mutates code unexpectedly | Set false in CI; true only for pre-commit |
| Massive baseline never reduced | Quality debt accumulates | Reduce baseline by ≥1 issue per PR rule |
| Hardcoded suppressions everywhere | Defeats lint | Use baseline for legacy, fix new issues |
| Per-developer `.editorconfig` overrides | Inconsistent | Single root `.editorconfig`, no exceptions |
| Skipping Compose rules in Compose project | Misses real bugs | Always enable Compose rules |
| `MagicNumber` rule disabled globally | Misses real magic numbers | Configure ignore list, don't disable |
| `WildcardImport` allowed | IDE auto-import noise | Disable wildcard imports project-wide |
| `TooGenericExceptionCaught` disabled | Hides bugs | Allow only with `_` or `ignore` named param |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ktlint`: line too long but config says 120 | Editorconfig override | Check nested `.editorconfig` |
| `detekt`: false positive on Composable | Compose rules not loaded | Add `detekt-compose-rules` plugin |
| Slow detekt | Many files | `parallel = true`, exclude generated/build |
| Baseline drift between branches | Auto-regenerated | Commit baseline manually |
| `detekt-formatting` and `ktlint` conflict | Same rules, different config | Pick one for each rule |
| KMP `commonMain` not analyzed | Source set config | Apply ktlint/detekt to all source sets |
| Compose preview functions flagged as unused | `@Preview` lint exception missing | Configure `excludeAnnotatedFunctions: ['Preview']` |
| `MaxLineLength` flagged inside string template | Hard to break | `// ktlint-disable max-line-length` or refactor |
| KSP-generated code flagged | Excludes wrong | Add `**/generated/**` to excludes |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Rust supply chain | `quality/rust-supply-chain` |
| Generic vuln scanning across languages | `quality/osv-scanner` |
| Java SpotBugs/Checkstyle | Java-specific quality skill |
| TypeScript ESLint | TypeScript-specific |
| Android Lint (manifest, resources) | Android Lint built-in |
| Kotlin security-specific issues | `security/kotlin-security` |
| KMP code patterns | `mobile/kotlin-multiplatform` |
