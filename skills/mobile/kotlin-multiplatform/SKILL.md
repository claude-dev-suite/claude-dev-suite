---
name: kotlin-multiplatform
description: |
  Kotlin Multiplatform (KMP) — share Kotlin code across Android, iOS, JVM Desktop,
  and JS/Wasm. Covers Gradle setup, source set hierarchy, expect/actual, target
  configuration, kotlinx-serialization, ktor-client, SQLDelight, multiplatform
  resources, and iOS framework export.

  USE WHEN: user mentions "Kotlin Multiplatform", "KMP", "expect/actual",
  "shared module", "cross-platform Kotlin", "iOSMain", "commonMain", "Kotlin/Native",
  "kotlinx-serialization", "SQLDelight"

  DO NOT USE FOR: Compose UI cross-platform - use `frontend-frameworks/compose-multiplatform`
  DO NOT USE FOR: Pure Kotlin language features - use `languages/kotlin`
  DO NOT USE FOR: Jetpack Compose Android-only - use `mobile/jetpack-compose`
  DO NOT USE FOR: Rust ↔ KMP bindings - use `languages/uniffi`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Kotlin Multiplatform

> **References**: [gradle.md](quick-ref/gradle.md) for full Gradle config, source set hierarchy, target setup. [ios-integration.md](quick-ref/ios-integration.md) for iOS framework export, CocoaPods, SwiftPM, Xcode integration. [libraries.md](quick-ref/libraries.md) for ktor, kotlinx-serialization, SQLDelight, Koin patterns in KMP.
>
> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `kotlin-multiplatform`.

## What KMP Solves

Share business logic (networking, persistence, domain, view models) across platforms. Each platform retains native UI:

```
shared/                                        # commonMain — Kotlin code shared everywhere
├── domain                                     # Models, use cases
├── data                                       # Repositories, DTOs, mappers
├── network                                    # Ktor client
└── persistence                                # SQLDelight queries

apps/
├── android (Kotlin + Jetpack Compose)         # uses shared
├── ios (Swift + SwiftUI)                      # uses shared via XCFramework
└── desktop (Kotlin + Compose Desktop)         # uses shared
```

KMP is **not** "write once run anywhere" — UI stays native (or use Compose Multiplatform for shared UI).

## Module Structure

```
shared/
├── build.gradle.kts
└── src/
    ├── commonMain/kotlin/                     # platform-agnostic code
    │   └── com/example/Wallet.kt
    ├── commonTest/kotlin/                     # shared tests
    │
    ├── androidMain/kotlin/                    # Android-specific
    │   └── com/example/AndroidPlatform.kt
    ├── androidUnitTest/kotlin/
    │
    ├── iosMain/kotlin/                        # iOS-specific (all iOS targets)
    │   └── com/example/IosPlatform.kt
    ├── iosTest/kotlin/
    │
    ├── desktopMain/kotlin/                    # JVM Desktop
    └── jsMain/kotlin/                         # Browser/Node (optional)
```

## expect / actual

The cross-platform mechanism. `expect` declares an API in `commonMain`; each target provides `actual` implementation.

### Functions

```kotlin
// commonMain
expect fun platformName(): String
expect fun openUrl(url: String)
```

```kotlin
// androidMain
import android.content.Intent
import android.net.Uri

actual fun platformName(): String = "Android ${android.os.Build.VERSION.SDK_INT}"

actual fun openUrl(url: String) {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    appContext.startActivity(intent)
}
```

```kotlin
// iosMain
import platform.UIKit.UIApplication
import platform.Foundation.NSURL

actual fun platformName(): String = "iOS ${UIDevice.currentDevice.systemVersion}"

actual fun openUrl(url: String) {
    NSURL.URLWithString(url)?.let {
        UIApplication.sharedApplication.openURL(it)
    }
}
```

### Classes

```kotlin
// commonMain
expect class SecureStorage {
    fun put(key: String, value: ByteArray)
    fun get(key: String): ByteArray?
    fun delete(key: String)
}
```

```kotlin
// androidMain — Android Keystore-backed
actual class SecureStorage(private val context: Context) {
    actual fun put(key: String, value: ByteArray) { /* AndroidX EncryptedSharedPreferences */ }
    actual fun get(key: String): ByteArray? { /* ... */ }
    actual fun delete(key: String) { /* ... */ }
}
```

```kotlin
// iosMain — Keychain-backed
import platform.Security.*

actual class SecureStorage {
    actual fun put(key: String, value: ByteArray) { /* SecItemAdd */ }
    actual fun get(key: String): ByteArray? { /* SecItemCopyMatching */ }
    actual fun delete(key: String) { /* SecItemDelete */ }
}
```

### Type Aliases (lightweight expect)

For simple wrappers around platform types:

```kotlin
// commonMain
expect class UUID

// androidMain
actual typealias UUID = java.util.UUID

// iosMain
actual typealias UUID = platform.Foundation.NSUUID
```

## Source Set Hierarchy (Default)

KMP 1.9+ uses a default hierarchy template:

```
commonMain
├── androidMain
├── jvmMain        (desktop)
├── jsMain
├── nativeMain
│   ├── linuxMain
│   ├── mingwMain  (Windows)
│   ├── appleMain
│   │   ├── iosMain
│   │   │   ├── iosX64Main
│   │   │   ├── iosArm64Main
│   │   │   └── iosSimulatorArm64Main
│   │   ├── macosMain
│   │   ├── tvosMain
│   │   └── watchosMain
```

Code in `appleMain` is shared across all Apple targets. Code in `iosMain` only across iOS targets. Useful for Apple-wide APIs (Keychain, NSURLSession) vs iOS-specific (UIKit).

```kotlin
// Custom intermediate source set (rare)
kotlin {
    sourceSets {
        val mobileMain by creating {
            dependsOn(getByName("commonMain"))
        }
        getByName("androidMain").dependsOn(mobileMain)
        getByName("iosMain").dependsOn(mobileMain)
    }
}
```

## Minimal Gradle Setup

```kotlin
// shared/build.gradle.kts
plugins {
    kotlin("multiplatform") version "2.2.0"
    id("com.android.library") version "8.7.0"
    kotlin("plugin.serialization") version "2.2.0"
}

kotlin {
    androidTarget {
        compilations.all {
            kotlinOptions { jvmTarget = "17" }
        }
    }

    listOf(
        iosX64(),
        iosArm64(),
        iosSimulatorArm64()
    ).forEach { target ->
        target.binaries.framework {
            baseName = "Shared"
            isStatic = true
        }
    }

    jvm("desktop")

    sourceSets {
        commonMain.dependencies {
            implementation("io.ktor:ktor-client-core:3.0.0")
            implementation("io.ktor:ktor-client-content-negotiation:3.0.0")
            implementation("io.ktor:ktor-serialization-kotlinx-json:3.0.0")
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.0")
            implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.0")
            implementation("org.jetbrains.kotlinx:kotlinx-datetime:0.6.1")
        }
        androidMain.dependencies {
            implementation("io.ktor:ktor-client-okhttp:3.0.0")
        }
        iosMain.dependencies {
            implementation("io.ktor:ktor-client-darwin:3.0.0")
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.0")
        }
    }
}

android {
    namespace = "com.example.shared"
    compileSdk = 35
    defaultConfig {
        minSdk = 26
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
```

See [gradle.md](quick-ref/gradle.md) for advanced setup (custom intermediate source sets, version catalogs, Compose KMP, multiplatform resources).

## iOS Framework Export

```kotlin
listOf(iosX64(), iosArm64(), iosSimulatorArm64()).forEach { target ->
    target.binaries.framework {
        baseName = "Shared"
        isStatic = true     // recommended — smaller bundle, faster link
        embedBitcode("disable")
    }
}
```

Build:

```bash
./gradlew :shared:linkReleaseFrameworkIosArm64
./gradlew :shared:linkReleaseFrameworkIosSimulatorArm64
```

To create a single XCFramework consumable by Xcode:

```kotlin
val xcf = XCFramework("Shared")
listOf(iosX64(), iosArm64(), iosSimulatorArm64()).forEach {
    it.binaries.framework {
        baseName = "Shared"
        xcf.add(this)
    }
}

// Task: ./gradlew :shared:assembleSharedXCFramework
```

For SwiftPM consumption, see [ios-integration.md](quick-ref/ios-integration.md).

## Networking — Ktor Client

```kotlin
// commonMain
import io.ktor.client.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.Json

@Serializable
data class User(val id: Long, val name: String)

class UserApi(private val client: HttpClient) {
    suspend fun getUser(id: Long): User =
        client.get("https://api.example.com/users/$id").body()
}

// httpClient construction with platform engine
expect fun createHttpClient(): HttpClient

// commonMain helper
fun makeClient(): HttpClient = HttpClient(engine = httpClientEngine()) {
    install(ContentNegotiation) {
        json(Json { ignoreUnknownKeys = true })
    }
}
```

```kotlin
// androidMain
import io.ktor.client.engine.okhttp.OkHttp
actual fun httpClientEngine() = OkHttp.create { /* ... */ }

// iosMain
import io.ktor.client.engine.darwin.Darwin
actual fun httpClientEngine() = Darwin.create { /* ... */ }
```

## Persistence — SQLDelight

```kotlin
// commonMain
import app.cash.sqldelight.db.SqlDriver

expect class DriverFactory {
    fun createDriver(): SqlDriver
}

class WalletDatabase(driver: SqlDriver) {
    val database = AppDatabase(driver)
    val txQueries = database.transactionQueries
}
```

```kotlin
// androidMain
import app.cash.sqldelight.driver.android.AndroidSqliteDriver

actual class DriverFactory(private val context: Context) {
    actual fun createDriver(): SqlDriver =
        AndroidSqliteDriver(AppDatabase.Schema, context, "wallet.db")
}

// iosMain
import app.cash.sqldelight.driver.native.NativeSqliteDriver

actual class DriverFactory {
    actual fun createDriver(): SqlDriver =
        NativeSqliteDriver(AppDatabase.Schema, "wallet.db")
}
```

SQL files in `commonMain/sqldelight/com/example/AppDatabase.sq`:

```sql
CREATE TABLE Transaction (
    id TEXT PRIMARY KEY,
    amount INTEGER NOT NULL,
    timestamp INTEGER NOT NULL
);

selectAll:
SELECT * FROM Transaction ORDER BY timestamp DESC;

insert:
INSERT INTO Transaction(id, amount, timestamp) VALUES (?, ?, ?);
```

Generated Kotlin code is type-safe and async-aware (returns `Flow` with `asFlow()` extension).

## DI — Koin Multiplatform

```kotlin
// commonMain
val sharedModule = module {
    single { createHttpClient() }
    single { UserApi(get()) }
    single { DriverFactory(get()) }
    single { WalletDatabase(get<DriverFactory>().createDriver()) }
}

fun initKoin(extraModules: List<Module> = emptyList()) = startKoin {
    modules(sharedModule + extraModules)
}
```

Android side passes `Context`:

```kotlin
// AndroidMainActivity
initKoin(extraModules = listOf(module {
    single<Context> { applicationContext }
}))
```

iOS calls `initKoin()` from Swift via the generated bridge.

## Multiplatform Resources

KMP supports shared resources (images, fonts, strings) via `compose-multiplatform-resources` (works without Compose too):

```
shared/src/commonMain/composeResources/
├── drawable/
│   └── logo.png
├── values/
│   └── strings.xml
└── font/
    └── inter.ttf
```

Access from Kotlin:

```kotlin
import org.jetbrains.compose.resources.painterResource
import org.jetbrains.compose.resources.stringResource

@Composable
fun Logo() {
    Image(painterResource(Res.drawable.logo), contentDescription = null)
}
```

For non-Compose code use `Res.readBytes("files/data.json")`.

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Putting everything in `commonMain` | Bloats unused code on each platform | Split by feature; use intermediate source sets |
| Using `Java.util.*` in commonMain | Not available on iOS/JS | Use `kotlinx-datetime`, `kotlinx.io`, etc. |
| Synchronous network in commonMain | Blocks platform threads | Use Ktor + suspend |
| Forgetting to add `iosMain` ktor engine | Runtime crash on iOS | Each platform needs its engine actualized |
| `expect class X(arg: Type)` with constructor mismatch | Compile error | Match constructor signatures across actuals |
| `lateinit var` on multiplatform shared state | Native targets don't enforce same way | Use nullable + check |
| Heavy serialization in `commonMain` without `flowOn` | Blocks UI on iOS main | Use `Dispatchers.Default` |

## Build & Distribution

| Target | Output | How consumers use it |
|---|---|---|
| Android | `.aar` library | Gradle dependency |
| iOS device | `Shared.framework` | Embed in Xcode project |
| iOS sim+device combined | `Shared.xcframework` | Single artifact for SwiftPM/CocoaPods |
| JVM Desktop | `.jar` | Gradle/Maven dependency |
| JS/Wasm | `.js` package | npm |

```bash
# Common Gradle tasks
./gradlew :shared:assemble                    # build all targets
./gradlew :shared:assembleSharedXCFramework   # iOS XCFramework
./gradlew :shared:packForXcode                # CocoaPods integration
./gradlew :shared:publishToMavenLocal         # local Maven for testing
```

## Testing

```kotlin
// commonTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.coroutines.test.runTest

class UserApiTest {
    @Test fun `parses user response`() = runTest {
        val api = UserApi(mockClient(""" {"id":1,"name":"Alice"} """))
        val user = api.getUser(1)
        assertEquals("Alice", user.name)
    }
}
```

Tests run on all targets by default. Use `expect class TestUtil` for platform-specific test helpers (mock HTTP engines).

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Compose UI shared across platforms | `frontend-frameworks/compose-multiplatform` |
| Android Jetpack Compose only | `mobile/jetpack-compose` |
| iOS native SwiftUI | `mobile/ios-native` (when added) + `languages/swift` |
| Pure Kotlin language patterns | `languages/kotlin` |
| Bridging Rust to KMP | `languages/uniffi` (KMP fork section) |
| KMP iOS framework export details | [ios-integration.md](quick-ref/ios-integration.md) |
