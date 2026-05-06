# KMP iOS Integration — Quick Reference

Three integration paths from Xcode → KMP shared module:
1. **Direct framework embed** — fastest setup, manual rebuild
2. **CocoaPods** — automated build via `pod install`
3. **SwiftPM with XCFramework** — modern, recommended for stable releases

## Path 1: Direct Framework Embed

```bash
# Build framework
./gradlew :shared:linkReleaseFrameworkIosArm64
./gradlew :shared:linkReleaseFrameworkIosSimulatorArm64
```

In Xcode:
1. Drag `shared/build/bin/iosArm64/releaseFramework/Shared.framework` into your Xcode project
2. Target → General → Frameworks, Libraries, and Embedded Content → set to "Embed & Sign"
3. Build Settings → Framework Search Paths → add `$(SRCROOT)/../shared/build/bin/iosArm64/releaseFramework`
4. For sim, configure conditional Search Paths per `EFFECTIVE_PLATFORM_NAME`

Use Gradle's helper task to automate per-build:

```kotlin
// shared/build.gradle.kts
tasks.register("embedAndSignAppleFrameworkForXcode") {
    // KMP plugin auto-registers this — invoke from Xcode build phase
}
```

In Xcode, add a Run Script build phase:

```bash
cd "$SRCROOT/.."
./gradlew :shared:embedAndSignAppleFrameworkForXcode
```

## Path 2: CocoaPods

```kotlin
// shared/build.gradle.kts
plugins {
    kotlin("multiplatform")
    kotlin("native.cocoapods")
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
    }
}
```

```bash
./gradlew :shared:podspec     # generates Shared.podspec
```

In `apps/ios/Podfile`:

```ruby
target 'BHODL' do
  use_frameworks!
  platform :ios, '16.0'
  pod 'Shared', :path => '../../shared'
end
```

```bash
cd apps/ios && pod install
```

CocoaPods triggers `gradle :shared:syncFramework` automatically on Xcode build. Slower than direct embed but more declarative.

## Path 3: SwiftPM (Recommended for Releases)

Build XCFramework once, distribute as binary SwiftPM target. Best for libraries published outside the project (or for stable releases inside monorepo).

### Build XCFramework

```kotlin
// shared/build.gradle.kts
import org.jetbrains.kotlin.gradle.plugin.mpp.apple.XCFramework

kotlin {
    val xcf = XCFramework("Shared")
    listOf(iosX64(), iosArm64(), iosSimulatorArm64()).forEach {
        it.binaries.framework {
            baseName = "Shared"
            isStatic = true
            xcf.add(this)
        }
    }
}
```

```bash
./gradlew :shared:assembleSharedReleaseXCFramework
# Output: shared/build/XCFrameworks/release/Shared.xcframework
```

### Wrap as SwiftPM Package

Local consumption (in monorepo):

```swift
// shared/Package.swift
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
            path: "./build/XCFrameworks/release/Shared.xcframework"
        ),
    ]
)
```

In Xcode: File → Add Package Dependencies → Add Local… → select `shared/`.

### Remote Distribution

For external publish:

```swift
.binaryTarget(
    name: "Shared",
    url: "https://github.com/example/shared/releases/download/v1.0.0/Shared.xcframework.zip",
    checksum: "abc123..."  // swift package compute-checksum Shared.xcframework.zip
),
```

CI publishes XCFramework as zip release asset.

## Calling KMP Code from Swift

KMP exports Kotlin types as Objective-C-style classes. Naming follows ObjC conventions:

| Kotlin | Swift |
|---|---|
| `class WalletRepository` | `class WalletRepository` (ObjC class) |
| `data class User(val id: Int, val name: String)` | `class User : KotlinBase` |
| `enum class Network { Bitcoin, Testnet }` | `enum Network` |
| `sealed class Result { class Success(val value: T); class Error(val cause: Throwable) }` | Mapped as classes — pattern match via `is`/`as?` |
| `suspend fun fetch(): User` | `func fetch() async throws -> User` |
| `Flow<Int>` | `SkieSwiftFlow<Int>` (with Skie) or `FlowAdapter<Int>` (manual) |
| `Long` | `KotlinLong` (boxed) or `Int64` (when via primitive bridge) |
| `String` | `String` |
| `List<T>` | `[T]` (auto-converted) |

```swift
import Shared

let repo = WalletRepository()

Task {
    do {
        let user = try await repo.fetchUser(id: 42)
        print(user.name)
    } catch {
        print(error)
    }
}
```

## Suspend Functions

KMP 1.9+ generates `async` Swift wrappers for `suspend` functions (with `@objc` interop layer). Older versions required completion handlers.

For `Flow<T>`, the export is `KotlinFlow` which doesn't bridge cleanly to Swift `AsyncSequence`. Solutions:

### Option A: SKIE (Highly Recommended)

[SKIE](https://skie.touchlab.co/) by Touchlab generates idiomatic Swift wrappers:
- `Flow<T>` → `AsyncSequence`
- `sealed class` → Swift enum
- Suspend → native `async`
- Default arg support
- Generic functions

```kotlin
// build.gradle.kts
plugins {
    id("co.touchlab.skie") version "0.10.0"
}
```

After integration:

```swift
import Shared

for try await balance in repository.observeBalance() {
    print(balance)
}
```

### Option B: Manual FlowAdapter

```kotlin
// commonMain — wrap Flow as iOS-friendly type
class FlowWrapper<T : Any>(private val flow: Flow<T>) {
    fun subscribe(
        scope: CoroutineScope,
        onNext: (T) -> Unit,
        onError: (Throwable) -> Unit = {},
        onCompletion: (() -> Unit)? = null,
    ): Job = scope.launch {
        flow.catch { onError(it) }
            .onCompletion { onCompletion?.invoke() }
            .collect { onNext(it) }
    }
}

class WalletRepository {
    fun observeBalanceWrapped(): FlowWrapper<Balance> =
        FlowWrapper(observeBalance())
}
```

```swift
let job = repo.observeBalanceWrapped().subscribe(
    scope: ScopeProvider.shared.io,
    onNext: { balance in print(balance) },
    onError: { error in print(error) },
    onCompletion: nil
)

// later
job.cancel()
```

## Memory Management

KMP iOS uses ARC-compatible reference counting under the hood. Most types behave like ObjC classes.

**Watch out**:
- KMP `class` instances → strong by default. For long-lived references, use `weak` if needed (but only for `class`, not `struct`-style data classes — they map to KotlinBase which Swift sees as class).
- Closures captured in Kotlin `Job`/`Flow` retain their captures. Cancel jobs on `deinit`.

```swift
final class WalletViewModel {
    private var job: Job?

    func start() {
        job = repo.observeBalanceWrapped().subscribe(
            scope: scope,
            onNext: { [weak self] balance in
                self?.update(balance)
            }
        )
    }

    deinit {
        job?.cancel()
    }
}
```

## Build Configuration Per Variant

```kotlin
// shared/build.gradle.kts
kotlin {
    targets.withType<KotlinNativeTarget>().configureEach {
        binaries.all {
            freeCompilerArgs += listOf(
                "-Xverbose-phases=Linker",
            )
        }
        binaries.getFramework("Shared", "DEBUG").apply {
            // debug-only settings
        }
        binaries.getFramework("Shared", "RELEASE").apply {
            linkerOpts("-dead_strip")               // strip unused symbols
            // freeCompilerArgs += "-Xbinary=stripDebugInfoFromNativeLibs=true"
        }
    }
}
```

## Bitcode

Apple deprecated bitcode in Xcode 14. KMP defaults to disabled. If using older Xcode:

```kotlin
target.binaries.framework {
    embedBitcode("disable")
}
```

## Privacy Manifest (iOS 17+)

For App Store submissions, KMP framework needs a privacy manifest:

```
shared/src/iosMain/resources/PrivacyInfo.xcprivacy
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key>
    <false/>
    <key>NSPrivacyCollectedDataTypes</key>
    <array/>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array><string>CA92.1</string></array>
        </dict>
    </array>
</dict>
</plist>
```

Add to framework via Gradle:

```kotlin
// custom task to embed privacy manifest in framework bundle
```

## Debugging Native Crashes from Xcode

Native crashes in KMP iOS surface as ObjC-style exceptions or fatal errors. To get readable stack traces:

1. Enable "Provisioning profile inclusion" → debug info in framework
2. Add `freeCompilerArgs += "-g"` to Native target compile options
3. In Xcode: Product → Scheme → Run → Diagnostics → enable "Address Sanitizer" / "Thread Sanitizer" during dev
4. For production: KMP exposes crash logs via `kotlin.native.internal.GC` callbacks

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `dyld: Library not loaded: @rpath/Shared.framework/Shared` | Framework not embedded | Set "Embed & Sign" in target |
| Sim build fails: `building for iOS Simulator, but linking in object file built for iOS` | Wrong arch | Build `iosSimulatorArm64`, not `iosArm64` |
| `KotlinThrowable` in Swift catch | Kotlin exceptions surface as `KotlinThrowable` | Catch as `Error`, cast `as? KotlinThrowable` |
| Hot reload broken | KMP doesn't support Xcode hot reload natively | Use `--continuous` Gradle build or rebuild on demand |
| `dlsym: Symbol not found` | Linker dropped symbol | Mark with `@CName` or `export()` in framework config |
| Slow Xcode build | Each Xcode build re-runs Gradle | Cache `:shared:embedAndSign...` task — Gradle caches outputs |
| `framework not found` for sim arm64 (M-series Mac) | Built for x86_64 only | Add `iosSimulatorArm64()` target |
