---
name: compose-snapshot
description: |
  Compose snapshot testing — pixel-by-pixel verification of @Composable output.
  Covers Paparazzi (JVM, fast, no emulator) and Roborazzi (Robolectric-based,
  emulator-free or device). Catches regressions in design system, theming, dark
  mode, font scaling, and locale rendering. CI integration with image diff
  reporting.

  USE WHEN: user mentions "Paparazzi", "Roborazzi", "Compose snapshot", "screenshot test",
  "visual regression", "pixel comparison", "showkase paparazzi", "compose preview test"

  DO NOT USE FOR: Mobile E2E - use `testing/maestro`
  DO NOT USE FOR: SwiftUI snapshots - use swift-snapshot-testing (separate)
  DO NOT USE FOR: Compose Multiplatform iOS snapshots - immature; use Paparazzi for shared composables on JVM
  DO NOT USE FOR: Logic tests - use `testing/kotest` or `testing/turbine`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Compose Snapshot Testing — Paparazzi & Roborazzi

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `paparazzi` or `roborazzi`.

## Two Tools, Different Trade-offs

| Aspect | Paparazzi (Square) | Roborazzi (Takahirom) |
|---|---|---|
| Runs on | JVM (no emulator) | Robolectric (JVM with Android shadows) |
| Speed | ⚡ Very fast | Fast |
| Setup | Minimal | Robolectric required |
| Compose support | ✅ Stable since 1.3+ | ✅ |
| Real Android resources | ❌ Renders via Layoutlib | ✅ Through Robolectric |
| Theming accuracy | ✅ Material 3 supported | ✅ |
| Compose Compiler version coupling | Strict (matches Compose BOM) | Flexible |
| KMP commonMain composables | ✅ (run from androidUnitTest) | ✅ |
| Animations frozen | At first frame | Configurable |
| Best for | Pure UI components, design system | Composables that depend on Android APIs |

**Recommendation**: use **Paparazzi** for design-system / UI-kit tests; use **Roborazzi** when composables touch `Context`, `Resources`, or other Android APIs that Layoutlib doesn't fully simulate.

## Paparazzi — Setup

```kotlin
// app/build.gradle.kts (or library module)
plugins {
    id("app.cash.paparazzi") version "1.3.5"
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("androidx.compose.ui:ui-tooling")              // for previews
}
```

Paparazzi works in `src/test/` (JUnit 4 by default).

## Paparazzi — Basic Test

```kotlin
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import org.junit.Rule
import org.junit.Test

class WalletItemSnapshot {
    @get:Rule val paparazzi = Paparazzi(
        deviceConfig = DeviceConfig.PIXEL_6_PRO,
        theme = "android:Theme.Material.Light.NoActionBar",
    )

    @Test fun light() {
        paparazzi.snapshot {
            BhodlTheme(darkTheme = false) {
                WalletItem(
                    wallet = Wallet(id = "1", name = "Main", balance = 100_000),
                    onClick = {},
                )
            }
        }
    }

    @Test fun dark() {
        paparazzi.snapshot {
            BhodlTheme(darkTheme = true) {
                WalletItem(/* ... */)
            }
        }
    }
}
```

Run:
```bash
./gradlew :app:recordPaparazziDebug      # capture baseline images
./gradlew :app:verifyPaparazziDebug      # diff against baseline
./gradlew :app:cleanRecordPaparazziDebug # delete baselines
```

Baseline images stored in `src/test/snapshots/images/`.

## Paparazzi — Multi-Variant Tests

```kotlin
class WalletItemSnapshot {
    @get:Rule val paparazzi = Paparazzi()

    private fun snap(name: String, content: @Composable () -> Unit) {
        paparazzi.snapshot(name = name, composable = content)
    }

    @Test fun all_themes() {
        snap("light") { BhodlTheme(darkTheme = false) { WalletItem(testWallet()) } }
        snap("dark") { BhodlTheme(darkTheme = true) { WalletItem(testWallet()) } }
    }

    @Test fun font_scales() {
        listOf(0.85f, 1.0f, 1.5f, 2.0f).forEach { scale ->
            paparazzi.unsafeUpdateConfig(
                deviceConfig = DeviceConfig.PIXEL_6_PRO.copy(fontScale = scale),
            )
            snap("font_${scale}x") { BhodlTheme { WalletItem(testWallet()) } }
        }
    }

    @Test fun locales() {
        listOf("en", "it", "ar").forEach { locale ->
            paparazzi.unsafeUpdateConfig(
                deviceConfig = DeviceConfig.PIXEL_6_PRO.copy(locale = locale),
            )
            snap(locale) { BhodlTheme { WalletItem(testWallet()) } }
        }
    }
}
```

## Paparazzi — Multi-Preview Annotation Pattern

Reuse Compose's `@Preview` multi-preview annotations:

```kotlin
@Preview(name = "Light", showBackground = true)
@Preview(name = "Dark", uiMode = Configuration.UI_MODE_NIGHT_YES)
@Preview(name = "Large Font", fontScale = 1.5f)
@Preview(name = "Small Font", fontScale = 0.85f)
annotation class ThemedPreviews

@ThemedPreviews
@Composable
fun WalletItemPreviews() {
    BhodlTheme {
        WalletItem(wallet = testWallet(), onClick = {})
    }
}
```

```kotlin
class PreviewSnapshotTest {
    @get:Rule val paparazzi = Paparazzi()

    @Test fun walletItemPreviews() {
        // Iterate through all @Preview annotations
        previewsOf<WalletItemPreviews>().forEach { preview ->
            paparazzi.unsafeUpdateConfig(deviceConfig = preview.deviceConfig)
            paparazzi.snapshot(name = preview.name) { preview.invoke() }
        }
    }
}
```

For full automation: use **Showkase** (Airbnb) to discover all `@Preview` composables and snapshot them.

## Showkase + Paparazzi (Auto-Discovery)

```kotlin
implementation("com.airbnb.android:showkase:1.0.4")
ksp("com.airbnb.android:showkase-processor:1.0.4")
testImplementation("com.airbnb.android:showkase-screenshot-testing-paparazzi:1.0.4")
```

Annotate composables:

```kotlin
@ShowkaseComposable(name = "WalletItem", group = "Wallet")
@Composable
fun WalletItemPreview() {
    BhodlTheme { WalletItem(testWallet()) }
}
```

Generate snapshots for all annotated composables:

```kotlin
class ShowkaseSnapshotTest : PaparazziShowkaseTest() {
    @get:Rule override val paparazzi = Paparazzi()

    override fun providePaparazziPreviews(): List<ShowkasePaparazziPreviewProvider.PaparazziPreview> {
        return Showkase.getMetadata()
            .componentList
            .filter { it.group == "Wallet" }
            .map { it.toPaparazziPreview() }
    }
}
```

## Roborazzi — Setup

```kotlin
plugins {
    id("io.github.takahirom.roborazzi") version "1.32.0"
}

dependencies {
    testImplementation("org.robolectric:robolectric:4.14")
    testImplementation("io.github.takahirom.roborazzi:roborazzi:1.32.0")
    testImplementation("io.github.takahirom.roborazzi:roborazzi-compose:1.32.0")
    testImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
```

```kotlin
// app/build.gradle.kts
android {
    testOptions {
        unitTests {
            isIncludeAndroidResources = true             // required for Roborazzi
        }
    }
}
```

## Roborazzi — Basic Test

```kotlin
import androidx.compose.ui.test.junit4.createComposeRule
import io.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w411dp-h891dp-xxxhdpi")
class WalletItemRoborazziTest {

    @get:Rule val composeRule = createComposeRule()

    @Test fun light() {
        composeRule.setContent {
            BhodlTheme(darkTheme = false) {
                WalletItem(testWallet())
            }
        }
        composeRule.onRoot().captureRoboImage("src/test/snapshots/wallet_item_light.png")
    }

    @Test fun dark() {
        composeRule.setContent {
            BhodlTheme(darkTheme = true) {
                WalletItem(testWallet())
            }
        }
        composeRule.onRoot().captureRoboImage("src/test/snapshots/wallet_item_dark.png")
    }
}
```

Run:
```bash
./gradlew :app:recordRoborazziDebug
./gradlew :app:verifyRoborazziDebug
./gradlew :app:compareRoborazziDebug    # generates HTML diff report
```

Outputs HTML diff with side-by-side images.

## Roborazzi — Compare Modes

```kotlin
captureRoboImage(
    "snapshot.png",
    roborazziOptions = RoborazziOptions(
        compareOptions = RoborazziOptions.CompareOptions(
            changeThreshold = 0.01,                    // 1% pixel diff allowed
            outputDirectoryPath = "build/roborazzi/diff",
        ),
        recordOptions = RoborazziOptions.RecordOptions(
            resizeScale = 0.5,                         // 50% to save space
        ),
    ),
)
```

## Snapshot Testing in CI

### GitHub Actions

```yaml
name: Snapshot tests

on: [pull_request]

jobs:
  paparazzi:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { java-version: '17', distribution: 'temurin' }

      - name: Verify snapshots
        run: ./gradlew :app:verifyPaparazziDebug

      - name: Upload diff on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: paparazzi-diff
          path: app/out/failures/

  roborazzi:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { java-version: '17', distribution: 'temurin' }

      - run: ./gradlew :app:verifyRoborazziDebug

      - name: Upload report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: roborazzi-report
          path: app/build/reports/roborazzi/
```

### Re-recording Workflow

When intentional UI changes happen:

```bash
./gradlew :app:recordPaparazziDebug
./gradlew :app:recordRoborazziDebug
git add src/test/snapshots/
git commit -m "ui: refresh wallet item baseline"
```

For PR-based recording, set up a workflow that re-records when label `record-snapshots` is added, commits back to PR branch.

## KMP Snapshots

Compose Multiplatform composables in `commonMain` can be snapshot-tested via the Android side:

```
shared/
├── src/
│   ├── commonMain/kotlin/ui/WalletItem.kt        # @Composable in shared
│   ├── androidUnitTest/kotlin/                   # Paparazzi tests here
│   │   └── WalletItemSnapshot.kt
```

Same Composables compile for iOS/Desktop too — visual coverage is via Android target.

For iOS-specific rendering issues, fall back to **screenshot tests in XCUITest** (separate, native).

## Image Diff Strategies

| Strategy | When |
|---|---|
| **Exact match** (default) | Strict — fails on any pixel diff |
| **Threshold** (e.g., 1%) | Accept minor anti-aliasing differences |
| **Region masking** | Ignore dynamic regions (timestamps, balances) |
| **Perceptual hash** (custom) | Tolerate visual changes that don't impact UX |

For Roborazzi:

```kotlin
captureRoboImage(
    "snapshot.png",
    roborazziOptions = RoborazziOptions(
        compareOptions = RoborazziOptions.CompareOptions(
            changeThreshold = 0.01,
        ),
    ),
)
```

For Paparazzi:

```kotlin
paparazzi.snapshot(name = "test", composable = { /* ... */ })
// Threshold via JVM args:
// ./gradlew test -Dpaparazzi.testing.threshold=0.01
```

## Wallet App Snapshot Coverage

Recommended test matrix:
- **Theming**: light + dark + Material You (Android 12+)
- **Locales**: English + Italian + Arabic (RTL)
- **Font scales**: 0.85, 1.0, 1.5, 2.0
- **Edge cases**: empty state, loading state, error state, very long names, max balance, zero balance
- **Variants**: confirmed vs pending vs failed transaction items

For BHODL: snapshot every screen × {light, dark} × {EN, IT} = ~60-80 snapshots. Manageable in CI under 2 minutes with Paparazzi.

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Snapshotting actual user data (real Bitcoin addresses, balances) | Images leak in repo | Use static test data |
| No baseline review in PR | Visual regressions slip in | Require image diff approval |
| Snapshot tests with timing-dependent content (Clock.now()) | Flaky | Inject test clock or freeze time |
| Snapshot animations | Different frame each run | Disable animations in test, snapshot first frame |
| Massive single test class with 100s of snapshots | Slow IDE | Split by component / feature |
| No threshold | False positives from rendering library updates | Set 0.5-1% threshold |
| Re-recording without inspection | Bugs become baseline | Always inspect diff before re-recording |
| Storing huge PNGs (3000×4000 px) | Repo bloat | Resize to ~50% via Roborazzi `resizeScale` or Paparazzi config |
| Snapshot tests run on emulator | Slow + flaky | Use Paparazzi (no emulator) or Roborazzi (Robolectric) |
| Mixing Paparazzi + Roborazzi for same component | Two baselines to maintain | Pick one per component |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "ResourceNotFoundException" in Paparazzi | Resource referenced from layoutlib not in test classpath | Use Roborazzi (Robolectric) for Android-resource-heavy components |
| Different output in CI vs local | Different JDK / Skia version | Pin Paparazzi version + use same JDK in CI |
| Snapshots invalid after Compose Compiler upgrade | Layout changes | Re-record + review |
| Roborazzi NATIVE graphics mode crash | Linux GLX missing | Install `libgl1-mesa-glx` (Ubuntu) or use Docker base image |
| Slow test run | Many snapshots, no parallelism | Set `maxParallelForks` in test task |
| Image diff shows tiny shifts (1-2 px) | Anti-aliasing / font hinting | Set threshold ≥ 0.5% |
| `.png` files in git LFS | Repo size growing | Use git LFS or `resizeScale` |
| Test class can't find composable | Missing `androidx.compose.ui:ui-test-manifest` debugImplementation | Add it |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Mobile E2E flows | `testing/maestro` |
| ViewModel/Flow logic | `testing/turbine` + `testing/kotest` |
| Behavior of composables (clicks, state) | Compose Test (`createComposeRule`) without snapshot |
| iOS native UI | `swift-snapshot-testing` (PointFree) |
| Compose Multiplatform iOS-only rendering | Manual review or XCUITest screenshots |
| Web visual regression | `testing/playwright` (visual comparisons) |
