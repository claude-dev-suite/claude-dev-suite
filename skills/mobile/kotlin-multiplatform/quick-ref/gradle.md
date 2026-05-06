# KMP Gradle Configuration — Quick Reference

## Project Structure

```
my-kmp-app/
├── settings.gradle.kts
├── build.gradle.kts                    # root
├── gradle/libs.versions.toml           # version catalog
├── shared/                             # KMP module
│   └── build.gradle.kts
└── apps/
    ├── android/                        # Android app
    │   └── build.gradle.kts
    ├── ios/                            # Xcode project
    └── desktop/                        # JVM desktop app
        └── build.gradle.kts
```

## Version Catalog

```toml
# gradle/libs.versions.toml
[versions]
kotlin = "2.2.0"
agp = "8.7.0"
ktor = "3.0.0"
coroutines = "1.10.0"
serialization = "1.7.0"
sqldelight = "2.0.2"
koin = "4.0.0"
compose-multiplatform = "1.7.0"

[libraries]
ktor-core = { module = "io.ktor:ktor-client-core", version.ref = "ktor" }
ktor-content-negotiation = { module = "io.ktor:ktor-client-content-negotiation", version.ref = "ktor" }
ktor-serialization = { module = "io.ktor:ktor-serialization-kotlinx-json", version.ref = "ktor" }
ktor-okhttp = { module = "io.ktor:ktor-client-okhttp", version.ref = "ktor" }
ktor-darwin = { module = "io.ktor:ktor-client-darwin", version.ref = "ktor" }
coroutines-core = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-core", version.ref = "coroutines" }
serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "serialization" }
sqldelight-android = { module = "app.cash.sqldelight:android-driver", version.ref = "sqldelight" }
sqldelight-native = { module = "app.cash.sqldelight:native-driver", version.ref = "sqldelight" }
sqldelight-jvm = { module = "app.cash.sqldelight:sqlite-driver", version.ref = "sqldelight" }
sqldelight-coroutines = { module = "app.cash.sqldelight:coroutines-extensions", version.ref = "sqldelight" }
koin-core = { module = "io.insert-koin:koin-core", version.ref = "koin" }
koin-android = { module = "io.insert-koin:koin-android", version.ref = "koin" }

[plugins]
kotlin-multiplatform = { id = "org.jetbrains.kotlin.multiplatform", version.ref = "kotlin" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
android-application = { id = "com.android.application", version.ref = "agp" }
android-library = { id = "com.android.library", version.ref = "agp" }
sqldelight = { id = "app.cash.sqldelight", version.ref = "sqldelight" }
compose = { id = "org.jetbrains.compose", version.ref = "compose-multiplatform" }
```

## settings.gradle.kts

```kotlin
pluginManagement {
    repositories {
        google()
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
    }
}

rootProject.name = "MyKmpApp"
include(":shared")
include(":apps:android")
include(":apps:desktop")
```

## Root build.gradle.kts

```kotlin
plugins {
    alias(libs.plugins.kotlin.multiplatform) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.sqldelight) apply false
    alias(libs.plugins.compose) apply false
}
```

## shared/build.gradle.kts (Full)

```kotlin
plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.sqldelight)
}

kotlin {
    androidTarget {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
        }
        publishLibraryVariants("release", "debug")
    }

    jvm("desktop") {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
        }
    }

    val xcframework = XCFramework("Shared")
    listOf(
        iosX64(),
        iosArm64(),
        iosSimulatorArm64()
    ).forEach { target ->
        target.binaries.framework {
            baseName = "Shared"
            isStatic = true
            xcframework.add(this)
            export(libs.coroutines.core.get())  // expose to Swift
        }
    }

    sourceSets {
        commonMain.dependencies {
            implementation(libs.coroutines.core)
            implementation(libs.serialization.json)
            implementation(libs.ktor.core)
            implementation(libs.ktor.content.negotiation)
            implementation(libs.ktor.serialization)
            implementation(libs.koin.core)
            implementation(libs.sqldelight.coroutines)
        }

        androidMain.dependencies {
            implementation(libs.ktor.okhttp)
            implementation(libs.sqldelight.android)
            implementation(libs.koin.android)
        }

        iosMain.dependencies {
            implementation(libs.ktor.darwin)
            implementation(libs.sqldelight.native)
        }

        desktopMain.dependencies {
            implementation(libs.ktor.okhttp)
            implementation(libs.sqldelight.jvm)
        }

        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation(libs.coroutines.test)
        }
    }
}

android {
    namespace = "com.example.shared"
    compileSdk = 35
    defaultConfig {
        minSdk = 26
        consumerProguardFiles("consumer-rules.pro")
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

sqldelight {
    databases {
        create("AppDatabase") {
            packageName.set("com.example.shared.db")
            schemaOutputDirectory.set(file("src/commonMain/sqldelight/databases"))
            verifyMigrations.set(true)
        }
    }
}
```

## Custom Intermediate Source Sets

When default hierarchy isn't enough (e.g., share code between Android + Desktop only):

```kotlin
kotlin {
    androidTarget()
    jvm("desktop")
    iosArm64()

    applyDefaultHierarchyTemplate()

    sourceSets {
        val jvmCommonMain by creating {
            dependsOn(commonMain.get())
        }

        androidMain.get().dependsOn(jvmCommonMain)
        getByName("desktopMain").dependsOn(jvmCommonMain)
    }
}
```

Now `jvmCommonMain` can use `java.util.*`, `java.io.*` etc. (not available in iosMain).

## Compiler Options

```kotlin
kotlin {
    targets.all {
        compilations.all {
            compilerOptions.configure {
                freeCompilerArgs.addAll(
                    "-Xexpect-actual-classes",                  // enable expect/actual classes (no warning)
                    "-Xcontext-parameters",                     // Kotlin 2.2+ context parameters
                    "-opt-in=kotlin.RequiresOptIn",
                    "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi",
                )
            }
        }
    }
}
```

## Multiplatform Resources

```kotlin
plugins {
    alias(libs.plugins.compose)
}

compose.resources {
    publicResClass = true
    packageOfResClass = "com.example.shared.resources"
    generateResClass = always
}
```

Resources go in `shared/src/commonMain/composeResources/`:
- `drawable/` (PNG, SVG)
- `font/`
- `values/strings.xml`
- `files/` (raw assets)

## Publishing to Maven Local (for app-side consumption)

```kotlin
// shared/build.gradle.kts
group = "com.example"
version = "1.0.0-SNAPSHOT"

publishing {
    repositories {
        mavenLocal()
    }
}
```

```bash
./gradlew :shared:publishToMavenLocal
```

Then in app:

```kotlin
repositories { mavenLocal() }
dependencies {
    implementation("com.example:shared:1.0.0-SNAPSHOT")
}
```

## CocoaPods Integration (Older but Common)

```kotlin
// shared/build.gradle.kts
plugins {
    kotlin("native.cocoapods") version "2.2.0"
}

kotlin {
    cocoapods {
        version = "1.0.0"
        summary = "Shared KMP module"
        homepage = "https://example.com"
        ios.deploymentTarget = "16.0"

        framework {
            baseName = "Shared"
            isStatic = true
        }

        pod("FirebaseAuth") {
            version = "11.0.0"
        }
    }
}
```

```bash
./gradlew :shared:podPublishXCFramework
cd apps/ios && pod install
```

## SwiftPM (Modern Alternative)

Wrap XCFramework as a SwiftPM package:

```swift
// Package.swift
// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Shared",
    platforms: [.iOS(.v16)],
    products: [
        .library(name: "Shared", targets: ["Shared"]),
    ],
    targets: [
        .binaryTarget(
            name: "Shared",
            path: "./Shared.xcframework"
        ),
    ]
)
```

Build XCFramework via Gradle, then commit Package.swift + XCFramework, or publish as a binary target on a release URL.

## Common Gradle Tasks

| Task | Purpose |
|---|---|
| `assemble` | Build all targets |
| `assembleDebug` / `assembleRelease` | Android variants |
| `linkDebugFrameworkIosArm64` | Build iOS device framework (debug) |
| `linkReleaseFrameworkIosArm64` | iOS device framework (release) |
| `linkDebugFrameworkIosSimulatorArm64` | iOS arm64 sim |
| `assembleSharedXCFramework` | All iOS architectures into XCFramework |
| `iosSimulatorArm64Test` | Run tests on iOS arm64 simulator |
| `desktopJar` | Build JVM desktop jar |
| `publishToMavenLocal` | Publish all targets to local Maven |

## Performance Tweaks

```kotlin
// gradle.properties
kotlin.mpp.androidSourceSetLayoutVersion=2
kotlin.mpp.enableCInteropCommonization=true
kotlin.native.cacheKind=static                  # Faster Native compilation
org.gradle.jvmargs=-Xmx4g -XX:+UseG1GC
org.gradle.parallel=true
org.gradle.caching=true
org.gradle.configureondemand=true
```

For CI:

```kotlin
// shared/build.gradle.kts
tasks.withType<KotlinNativeCompile>().configureEach {
    compilerOptions.freeCompilerArgs.add("-Xbinary=disableCompilerChecks=true")
}
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Resolving NPM dependencies" hangs | Skip JS target if not needed |
| iOS framework not found in Xcode | Check `embedAndSignAppleFrameworkForXcode` task ran |
| Mismatched Kotlin versions across modules | Use single `libs.versions.toml` |
| AndroidManifest.xml not found | Add `manifest.srcFile("src/androidMain/AndroidManifest.xml")` to `android.sourceSets["main"]` |
| `expect class` warning in Kotlin 2.x | Add `-Xexpect-actual-classes` compiler arg |
| Slow `linkDebugFrameworkIos*` | Enable Native cache: `kotlin.native.cacheKind=static` |
| KSP not running on KMP | KSP 1.0.x supports KMP — ensure plugin version matches Kotlin |
