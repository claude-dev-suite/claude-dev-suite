---
name: gradle-kmp
description: |
  Gradle build system for Kotlin Multiplatform projects. Covers settings.gradle.kts,
  version catalogs (libs.versions.toml), KMP plugin configuration, source set
  hierarchy, target binaries (JAR, AAR, XCFramework, JS bundle), publishing
  (Maven Central, GitHub Packages), CI presets (build matrix, caching, parallel
  execution), composite builds, and dependency management.

  USE WHEN: user mentions "Gradle KMP", "settings.gradle.kts", "version catalog",
  "libs.versions.toml", "XCFramework Gradle", "publishToMavenCentral", "Gradle
  composite build", "Gradle build cache", "configuration cache", "Gradle CI"

  DO NOT USE FOR: Cross-compiling Rust crates - use `build-tools/rust-cross-compile`
  DO NOT USE FOR: Reproducible builds spec - use `infrastructure/reproducible-builds`
  DO NOT USE FOR: KMP source code patterns - use `mobile/kotlin-multiplatform`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Gradle for Kotlin Multiplatform

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `gradle-kmp` or `gradle`.

## settings.gradle.kts

```kotlin
pluginManagement {
    repositories {
        google { content { includeGroupByRegex("com\\.android.*"); includeGroupByRegex("androidx.*") } }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven("https://maven.pkg.jetbrains.space/public/p/compose/dev")
        // For UniFFI KMP fork
        maven("https://maven.ubique.ch/snapshots")
    }
}

plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "0.8.0"
    id("com.gradle.develocity") version "3.18.1"          // optional: build scan + cache
}

develocity {
    buildScan {
        termsOfUseUrl = "https://gradle.com/terms-of-service"
        termsOfUseAgree = "yes"
        publishing.onlyIf { System.getenv("CI") != null }
    }
}

rootProject.name = "BHODL"
include(":shared")
include(":apps:android")
include(":apps:desktop")
```

## Version Catalog (`gradle/libs.versions.toml`)

Single source of truth for dependency versions. Replaces ad-hoc `ext` blocks.

```toml
[versions]
kotlin = "2.2.0"
agp = "8.7.0"
compose-multiplatform = "1.8.0"
ktor = "3.0.0"
coroutines = "1.10.0"
serialization = "1.7.3"
sqldelight = "2.0.2"
koin = "4.0.0"

[libraries]
kotlin-bom = { module = "org.jetbrains.kotlin:kotlin-bom", version.ref = "kotlin" }
kotlin-stdlib = { module = "org.jetbrains.kotlin:kotlin-stdlib", version.ref = "kotlin" }
coroutines-core = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-core", version.ref = "coroutines" }
coroutines-test = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-test", version.ref = "coroutines" }
serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "serialization" }
ktor-core = { module = "io.ktor:ktor-client-core", version.ref = "ktor" }
ktor-content-negotiation = { module = "io.ktor:ktor-client-content-negotiation", version.ref = "ktor" }
ktor-serialization = { module = "io.ktor:ktor-serialization-kotlinx-json", version.ref = "ktor" }
ktor-okhttp = { module = "io.ktor:ktor-client-okhttp", version.ref = "ktor" }
ktor-darwin = { module = "io.ktor:ktor-client-darwin", version.ref = "ktor" }
sqldelight-runtime = { module = "app.cash.sqldelight:runtime", version.ref = "sqldelight" }
sqldelight-android = { module = "app.cash.sqldelight:android-driver", version.ref = "sqldelight" }
sqldelight-native = { module = "app.cash.sqldelight:native-driver", version.ref = "sqldelight" }
koin-core = { module = "io.insert-koin:koin-core", version.ref = "koin" }

[bundles]
ktor-common = ["ktor-core", "ktor-content-negotiation", "ktor-serialization"]

[plugins]
kotlin-multiplatform = { id = "org.jetbrains.kotlin.multiplatform", version.ref = "kotlin" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
android-application = { id = "com.android.application", version.ref = "agp" }
android-library = { id = "com.android.library", version.ref = "agp" }
compose = { id = "org.jetbrains.compose", version.ref = "compose-multiplatform" }
sqldelight = { id = "app.cash.sqldelight", version.ref = "sqldelight" }
```

Use:

```kotlin
plugins {
    alias(libs.plugins.kotlin.multiplatform)
}

dependencies {
    implementation(libs.coroutines.core)
    implementation(libs.bundles.ktor.common)
}
```

## gradle.properties

```properties
# JVM
org.gradle.jvmargs=-Xmx4g -XX:+UseG1GC -XX:MaxMetaspaceSize=1g

# Performance
org.gradle.parallel=true
org.gradle.caching=true
org.gradle.configureondemand=true
org.gradle.configuration-cache=true                # Gradle 8+ stable
org.gradle.unsafe.configuration-cache-problems=warn

# Kotlin
kotlin.code.style=official
kotlin.mpp.androidSourceSetLayoutVersion=2
kotlin.mpp.enableCInteropCommonization=true
kotlin.native.cacheKind=static                      # Faster Native build
kotlin.native.ignoreDisabledTargets=true            # Skip iOS targets on Linux

# Android
android.useAndroidX=true
android.nonTransitiveRClass=true
android.nonFinalResIds=true

# Compose
org.jetbrains.compose.experimental.uikit.enabled=true
```

## Source Set Hierarchy

KMP 1.9+ has a default template — most projects don't need custom intermediate sets.

```kotlin
kotlin {
    androidTarget()
    jvm("desktop")
    listOf(iosX64(), iosArm64(), iosSimulatorArm64()).forEach { /* ... */ }

    sourceSets {
        commonMain.dependencies {
            implementation(libs.coroutines.core)
        }
        androidMain.dependencies {
            implementation(libs.ktor.okhttp)
        }
        iosMain.dependencies {
            implementation(libs.ktor.darwin)
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation(libs.coroutines.test)
        }
    }
}
```

For custom intermediate set (e.g., shared between Android + Desktop):

```kotlin
sourceSets {
    val jvmCommonMain by creating {
        dependsOn(commonMain.get())
    }
    androidMain.get().dependsOn(jvmCommonMain)
    getByName("desktopMain").dependsOn(jvmCommonMain)
}
```

## XCFramework Output

```kotlin
import org.jetbrains.kotlin.gradle.plugin.mpp.apple.XCFramework

kotlin {
    val xcf = XCFramework("Shared")
    listOf(iosX64(), iosArm64(), iosSimulatorArm64()).forEach { target ->
        target.binaries.framework {
            baseName = "Shared"
            isStatic = true
            xcf.add(this)
            export(libs.coroutines.core.get())          // expose to Swift consumers
        }
    }
}
```

Build:
```bash
./gradlew :shared:assembleSharedXCFramework
# Output: shared/build/XCFrameworks/release/Shared.xcframework
```

## CocoaPods Plugin

```kotlin
plugins {
    kotlin("native.cocoapods") version "2.2.0"
}

kotlin {
    cocoapods {
        version = "1.0.0"
        summary = "Shared KMP module"
        homepage = "https://github.com/example/bhodl"
        ios.deploymentTarget = "16.0"
        framework {
            baseName = "Shared"
            isStatic = true
        }
        // Optionally consume CocoaPods deps from Kotlin
        pod("FirebaseAuth") { version = "11.0.0" }
    }
}
```

```bash
./gradlew :shared:podPublishXCFramework
cd apps/ios && pod install
```

## Embed-and-Sign for Xcode

Auto-build framework when Xcode builds:

```bash
# In Xcode build phase:
cd "$SRCROOT/.."
./gradlew :shared:embedAndSignAppleFrameworkForXcode
```

The `embedAndSignAppleFrameworkForXcode` task is auto-registered by KMP plugin.

## Kotlin Compiler Options

```kotlin
kotlin {
    targets.all {
        compilations.all {
            compilerOptions.configure {
                freeCompilerArgs.addAll(
                    "-Xexpect-actual-classes",
                    "-Xcontext-parameters",
                    "-opt-in=kotlin.RequiresOptIn",
                    "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi",
                    "-Xjsr305=strict",
                )
            }
        }
    }
    androidTarget {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
        }
    }
    jvm("desktop") {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
        }
    }
}
```

## Maven Publishing

```kotlin
plugins {
    `maven-publish`
    signing
}

group = "com.bhodl"
version = "1.0.0"

publishing {
    repositories {
        maven {
            name = "GitHubPackages"
            url = uri("https://maven.pkg.github.com/bhodl/shared")
            credentials {
                username = providers.gradleProperty("gpr.user").orNull
                    ?: System.getenv("GITHUB_ACTOR")
                password = providers.gradleProperty("gpr.token").orNull
                    ?: System.getenv("GITHUB_TOKEN")
            }
        }
        maven {
            name = "MavenCentral"
            url = uri("https://s01.oss.sonatype.org/service/local/staging/deploy/maven2/")
            credentials {
                username = providers.gradleProperty("ossrhUsername").orNull
                password = providers.gradleProperty("ossrhPassword").orNull
            }
        }
    }
    publications.withType<MavenPublication> {
        pom {
            name.set("Shared")
            description.set("Shared KMP module")
            url.set("https://github.com/bhodl/shared")
            licenses {
                license {
                    name.set("MIT")
                    url.set("https://opensource.org/licenses/MIT")
                }
            }
            developers {
                developer { id.set("bhodl"); name.set("BHODL Team") }
            }
            scm {
                url.set("https://github.com/bhodl/shared")
            }
        }
    }
}

signing {
    val signingKey = providers.environmentVariable("SIGNING_KEY").orNull
    val signingPassword = providers.environmentVariable("SIGNING_PASSWORD").orNull
    if (signingKey != null) {
        useInMemoryPgpKeys(signingKey, signingPassword)
        sign(publishing.publications)
    }
}
```

For modern Maven Central → use **vanniktech/gradle-maven-publish-plugin**:

```kotlin
plugins {
    id("com.vanniktech.maven.publish") version "0.30.0"
}

mavenPublishing {
    publishToMavenCentral(SonatypeHost.CENTRAL_PORTAL)
    signAllPublications()
    coordinates("com.bhodl", "shared", "1.0.0")
    pom { /* ... */ }
}
```

## Build Cache

### Local cache

```properties
# gradle.properties
org.gradle.caching=true
```

Stored in `~/.gradle/caches/build-cache-1`.

### Remote cache (CI / team)

```kotlin
// settings.gradle.kts
buildCache {
    local { enabled = true }
    remote<HttpBuildCache> {
        url = uri("https://cache.bhodl.dev/cache/")
        push = System.getenv("CI") != null               // only CI pushes
        credentials {
            username = providers.gradleProperty("buildCacheUser").orNull
            password = providers.gradleProperty("buildCachePass").orNull
        }
    }
}
```

Or use **Gradle Develocity** (formerly Gradle Enterprise) — best-in-class with build scans.

## Configuration Cache (Gradle 8+)

```properties
# gradle.properties
org.gradle.configuration-cache=true
org.gradle.unsafe.configuration-cache-problems=warn
```

Caches build configuration → faster subsequent builds (skip configuration phase).

If a plugin doesn't support it, set `=warn` and gradually fix incompatible code (no `Project.afterEvaluate`, no `Task.project`, etc.).

## Composite Builds

For monorepos splitting independent modules:

```kotlin
// settings.gradle.kts
includeBuild("../bhodl-core") {
    dependencySubstitution {
        substitute(module("com.bhodl:core")).using(project(":"))
    }
}
```

Build of root project automatically builds and uses local `bhodl-core`. No publish needed.

## Common Gradle Tasks

```bash
# Build everything
./gradlew build

# Just one target
./gradlew :shared:assembleDebug                  # Android library debug
./gradlew :shared:linkReleaseFrameworkIosArm64   # iOS device framework
./gradlew :shared:assembleSharedXCFramework      # All iOS arch into XCFramework
./gradlew :shared:desktopJar
./gradlew :apps:android:assembleRelease
./gradlew :apps:android:bundleRelease            # AAB for Play Store
./gradlew :apps:android:installDebug             # Install on connected device

# Tests
./gradlew test                                   # JVM tests
./gradlew :shared:jvmTest
./gradlew :shared:iosSimulatorArm64Test
./gradlew :shared:desktopTest

# Quality
./gradlew :shared:detekt
./gradlew :shared:ktlintCheck
./gradlew :shared:lintDebug                      # Android lint

# Publishing
./gradlew :shared:publishToMavenLocal
./gradlew :shared:publishAllPublicationsToMavenCentralRepository

# Cleanup
./gradlew clean
./gradlew --refresh-dependencies                 # force re-resolve

# Diagnostics
./gradlew :shared:dependencies
./gradlew :shared:dependencyInsight --dependency kotlinx-coroutines-core
./gradlew :shared:tasks --all
./gradlew help --task assembleDebug              # docs for a task

# Performance
./gradlew --scan                                 # build scan to scans.gradle.com
./gradlew --profile                              # local HTML profile in build/reports/profile/
./gradlew --build-cache                          # force cache use
```

## CI: GitHub Actions

```yaml
# .github/workflows/build.yml
name: Build

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-14]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with: { java-version: '17', distribution: 'temurin' }

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v4
        with:
          cache-read-only: ${{ github.ref != 'refs/heads/main' }}

      - name: Build (Linux: skip iOS targets)
        if: runner.os == 'Linux'
        run: ./gradlew assembleDebug -Pkotlin.native.ignoreDisabledTargets=true

      - name: Build full (macOS: includes iOS)
        if: runner.os == 'macOS'
        run: ./gradlew assemble

      - name: Test
        run: ./gradlew test

      - name: Upload reports
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: reports-${{ matrix.os }}
          path: |
            **/build/reports/
            **/build/test-results/
```

### Caching tips for CI

- Use `gradle/actions/setup-gradle@v4` — handles Gradle home + dependency cache automatically
- `cache-read-only` on PRs to avoid polluting cache from forks
- For Konan (Native), cache `~/.konan` separately

## CI: GitLab CI Snippet

```yaml
build:
  image: eclipse-temurin:17-jdk
  cache:
    paths:
      - .gradle/
      - ~/.gradle/caches/
  script:
    - ./gradlew assembleDebug --build-cache --parallel
    - ./gradlew test
  artifacts:
    when: on_failure
    paths:
      - "**/build/reports/"
```

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| `ext { }` for versions in root build.gradle.kts | Hard to refactor, no IDE support | Use version catalog |
| Hardcoded versions in `build.gradle.kts` | Drift across modules | `libs.versions.toml` single source |
| `apply plugin: 'X'` (Groovy syntax) | Old | `plugins { id("X") }` block |
| `compileOptions.sourceCompatibility = JavaVersion.VERSION_8` | Old JVM target | At least 17 for KMP |
| `useFakeStrictMode()` workarounds | Hides bugs | Fix incompatibilities |
| Duplicate config across subprojects | Drift | Use convention plugin in `buildSrc/` or `build-logic/` |
| Disabling configuration cache | Slow | Fix compat issues progressively |
| `gradle.properties` per-module | Confusing | Single root `gradle.properties` |
| Push to remote build cache from PR forks | Pollution | Set `push = System.getenv("CI") != null` and gate by branch |
| Heavy `afterEvaluate` blocks | Confg cache breaks | Use lazy properties (Provider API) |

## Convention Plugins (`build-logic/`)

For monorepos with many modules sharing config:

```
build-logic/
├── settings.gradle.kts
├── convention/
│   ├── build.gradle.kts
│   └── src/main/kotlin/
│       ├── bhodl.kotlin-multiplatform.gradle.kts
│       ├── bhodl.android-application.gradle.kts
│       └── bhodl.android-library.gradle.kts
```

```kotlin
// bhodl.kotlin-multiplatform.gradle.kts
plugins {
    kotlin("multiplatform")
}

kotlin {
    targets.all {
        compilations.all {
            compilerOptions.configure {
                freeCompilerArgs.addAll("-Xexpect-actual-classes", "-Xcontext-parameters")
            }
        }
    }
}

// In a module
plugins {
    id("bhodl.kotlin-multiplatform")
}
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Could not find method ... for arguments` | Plugin version mismatch | Align all Kotlin/AGP/Compose plugin versions |
| `Could not determine the dependencies of task ...` | Configuration cache incompatibility | Disable plugin temporarily or fix lazy access |
| Slow Native compilation (iOS) | No cache | `kotlin.native.cacheKind=static` |
| `:apps:android:lintDebug` fails | Lint baseline outdated | Update with `./gradlew updateLintBaseline` |
| OOM during build | Too many parallel workers | Reduce `org.gradle.parallel.threads` or increase Xmx |
| `Cannot create variant 'metadataApiElements'` | Multiple KMP plugin applications | Apply once per module, use convention plugin |
| `INSTALL_FAILED_NO_MATCHING_ABIS` on emulator | Wrong APK ABI | Build matching emulator (x86_64 → build x86_64) |
| iOS framework "module not found" | Wrong target built | Build for `iosArm64` (device) AND `iosSimulatorArm64` (M-series sim) |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Cross-compiling Rust crates for mobile | `build-tools/rust-cross-compile` |
| Reproducible build spec | `infrastructure/reproducible-builds` |
| KMP code patterns | `mobile/kotlin-multiplatform` |
| Compose Multiplatform UI patterns | `frontend-frameworks/compose-multiplatform` |
| Gradle for plain Spring Boot | Generic Gradle skill |
