# Compose Multiplatform on iOS — Quick Reference

CMP iOS hit Stable in 1.8.0 (early 2025). It runs Compose UI through Skia on top of `UIViewController`. This reference covers iOS-specific patterns, interop, and pitfalls.

## Entry Point

```kotlin
// shared/src/iosMain/kotlin/MainViewController.kt
import androidx.compose.ui.window.ComposeUIViewController

fun MainViewController() = ComposeUIViewController(
    configure = {
        // Optional config
        delegate = object : ComposeUIViewControllerDelegate {
            override fun viewDidAppear(animated: Boolean) {
                // ...
            }
        }
        opaque = false                    // transparent background
    }
) { App() }
```

```swift
// SwiftUI host
struct ContentView: View {
    var body: some View {
        ComposeView()
            .ignoresSafeArea(.keyboard)
            .ignoresSafeArea(.container, edges: .bottom)
    }
}

struct ComposeView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        Main_iosKt.MainViewController()
    }
    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}
```

## Embedding UIViewController in Compose

```kotlin
import androidx.compose.ui.viewinterop.UIKitViewController
import platform.MapKit.MKMapView
import platform.UIKit.UIViewController

@Composable
fun MapScreen(modifier: Modifier = Modifier) {
    UIKitViewController(
        modifier = modifier.fillMaxSize(),
        factory = {
            UIViewController().apply {
                view = MKMapView()
            }
        },
    )
}
```

For raw `UIView`:

```kotlin
import androidx.compose.ui.viewinterop.UIKitView

@Composable
fun NativeButton(modifier: Modifier = Modifier, onClick: () -> Unit) {
    UIKitView(
        modifier = modifier,
        factory = {
            val button = UIButton(type = UIButtonTypeSystem)
            button.setTitle("Native", forState = UIControlStateNormal)
            button.addTarget(
                target = NSObject().apply { /* handler closure */ },
                action = NSSelectorFromString("clicked"),
                forControlEvents = UIControlEventTouchUpInside,
            )
            button
        },
        update = { /* ... */ },
    )
}
```

## SwiftUI ↔ Compose

For best UX, mix:
- **SwiftUI** for screens that benefit from native feel (lists, settings, sheets, share)
- **Compose** for screens with custom design system, animations, complex state

Wrap Compose screens as `UIViewControllerRepresentable` (shown above). Wrap SwiftUI views as `UIViewController` for embedding in Compose nav stack:

```swift
// SwiftUI side — expose UIViewController
@objc public class SettingsViewControllerWrapper: NSObject {
    @objc public static func create() -> UIViewController {
        UIHostingController(rootView: SettingsView())
    }
}
```

```kotlin
// Compose side
import platform.UIKit.UIViewController

@Composable
fun SettingsScreen(modifier: Modifier = Modifier) {
    UIKitViewController(
        modifier = modifier,
        factory = { SettingsViewControllerWrapper.create() },
    )
}
```

## Keyboard Handling

iOS doesn't auto-adjust UI for keyboard like Android. Use `Modifier.imePadding()` + configure `ComposeUIViewController`:

```kotlin
fun MainViewController() = ComposeUIViewController(
    configure = {
        onFocusBehavior = OnFocusBehavior.FocusableAboveKeyboard   // scroll content
    }
) { App() }
```

In SwiftUI, also handle:

```swift
ComposeView()
    .ignoresSafeArea(.keyboard)         // let Compose handle keyboard
```

For complex forms, use `Modifier.imePadding()` + `Modifier.verticalScroll(rememberScrollState())`.

## Safe Area / Notch / Dynamic Island

```kotlin
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding

@Composable
fun App() {
    Scaffold(
        modifier = Modifier.windowInsetsPadding(WindowInsets.safeDrawing),
    ) {
        // content
    }
}
```

For full-screen content extending under status bar:

```swift
ComposeView()
    .ignoresSafeArea(.container)
```

Then handle insets in Compose via `WindowInsets.statusBars` / `WindowInsets.navigationBars`.

## Gestures

CMP iOS supports Compose's gesture system but doesn't replicate every native iOS gesture by default:

| Gesture | Status |
|---|---|
| Tap | ✅ |
| Long-press | ✅ |
| Drag | ✅ |
| Pinch-to-zoom | ✅ |
| Swipe-back | ⚠️ — must implement via `Modifier.draggable` or use Decompose's iOS swipe-back |
| Edge swipe | Manual via `Modifier.pointerInput` |
| 3D Touch / Force Touch | ❌ — bridge to UIKit if needed |
| Haptic feedback | ❌ — call native via expect/actual |

```kotlin
// Haptic feedback via expect/actual
expect fun hapticImpact(style: HapticStyle)

enum class HapticStyle { Light, Medium, Heavy, Soft, Rigid }

// iosMain
import platform.UIKit.UIImpactFeedbackGenerator
import platform.UIKit.UIImpactFeedbackStyle

actual fun hapticImpact(style: HapticStyle) {
    val iosStyle = when (style) {
        HapticStyle.Light -> UIImpactFeedbackStyle.UIImpactFeedbackStyleLight
        HapticStyle.Medium -> UIImpactFeedbackStyle.UIImpactFeedbackStyleMedium
        HapticStyle.Heavy -> UIImpactFeedbackStyle.UIImpactFeedbackStyleHeavy
        HapticStyle.Soft -> UIImpactFeedbackStyle.UIImpactFeedbackStyleSoft
        HapticStyle.Rigid -> UIImpactFeedbackStyle.UIImpactFeedbackStyleRigid
    }
    UIImpactFeedbackGenerator(style = iosStyle).apply {
        prepare()
        impactOccurred()
    }
}
```

## Sharing & System Sheets

```kotlin
// commonMain
expect class ShareController {
    fun share(text: String, title: String? = null)
}

// iosMain
import platform.UIKit.*
import platform.Foundation.NSURL

actual class ShareController {
    actual fun share(text: String, title: String?) {
        val items = listOf<Any?>(text)
        val controller = UIActivityViewController(
            activityItems = items,
            applicationActivities = null,
        )
        UIApplication.sharedApplication.keyWindow?.rootViewController
            ?.presentViewController(controller, animated = true, completion = null)
    }
}
```

## Status Bar Style

```swift
// Info.plist
// Set "View controller-based status bar appearance" = NO for global control
// Or set per ComposeUIViewController via configure block
```

```kotlin
fun MainViewController() = ComposeUIViewController(
    configure = {
        // statusBarStyle is on UIViewController override — wrap if needed
    }
) { App() }
```

For dynamic status bar style based on theme, override in Swift:

```swift
class CustomComposeHost: UIViewController {
    var preferredStyle: UIStatusBarStyle = .default
    override var preferredStatusBarStyle: UIStatusBarStyle { preferredStyle }
}
```

## Fonts

```kotlin
// commonMain
import org.jetbrains.compose.resources.Font

@Composable
fun bhodlTypography(): Typography {
    val inter = FontFamily(
        Font(Res.font.inter_regular, FontWeight.Normal),
        Font(Res.font.inter_medium, FontWeight.Medium),
        Font(Res.font.inter_bold, FontWeight.Bold),
    )
    return Typography(
        bodyLarge = TextStyle(fontFamily = inter, fontSize = 16.sp),
        // ...
    )
}
```

System fonts:

```kotlin
// iosMain — use San Francisco
val sfFontFamily = FontFamily(
    SystemFontFamily()    // Uses iOS system font
)
```

## Performance Considerations

- **First frame latency**: CMP iOS startup includes Skia init (~150-300ms). Show splash from SwiftUI before Compose loads
- **Image decoding**: Coil 3 KMP works on iOS. For large lists, use `LazyColumn` with `key` and consider thumbnails
- **Scrolling**: smooth on iOS but feels different from native UIScrollView. For pixel-perfect lists, fall back to `UICollectionView` via `UIKitViewController`
- **Memory**: Skia + Compose use more RAM than SwiftUI. Profile with Xcode Instruments

## Bundle Size

A Compose Multiplatform iOS framework adds ~5-8MB to the app binary (Skia + Compose runtime + Kotlin/Native runtime). Acceptable for most apps but compare against SwiftUI's near-zero overhead.

Optimize:
- Static framework + dead-code stripping (`linkerOpts("-dead_strip")`)
- Disable Compose Material if unused, ship only Foundation
- Avoid bundling unused resources

## Privacy Manifest (App Store Required)

CMP framework needs `PrivacyInfo.xcprivacy`:

```kotlin
// shared/src/iosMain/resources/PrivacyInfo.xcprivacy — gets bundled in framework
```

Declare any iOS APIs the Compose runtime touches (UserDefaults, file timestamps, etc.).

## Debugging

- **Layout inspector**: Xcode's view debugger shows Compose's `UIView` host but NOT individual composables
- **Compose tracing**: enable via `enableLayoutHelpers()` in `ComposeUIViewController` config (debug builds only)
- **Logs**: use Kermit or Napier for cross-platform logs visible in Xcode console

## Known Issues / Gotchas (Mid-2026)

| Issue | Workaround |
|---|---|
| `WebView` not supported | Bridge to `WKWebView` via `UIKitViewController` |
| `BackHandler` no-op on iOS | Decompose handles back gesture; or implement via `UIScreenEdgePanGestureRecognizer` bridge |
| Snapshot test infra immature | Use Paparazzi for shared logic; SwiftUI snapshot tests at integration boundary |
| Hot reload limited | Restart app after most changes; live edit works for state-preserving tweaks |
| Right-to-left layouts | Manual `LayoutDirection.Rtl` setting per locale |
| Accessibility (VoiceOver) | Works via Compose semantics, but verify with XCUITest |
| Native iOS context menus | Bridge via UIMenu or use Compose dropdowns (visual mismatch) |

## Build & Iterate

```bash
# Common cycle: change Compose code, rebuild iOS framework, refresh Xcode
./gradlew :shared:embedAndSignAppleFrameworkForXcode
# Then Cmd+R in Xcode
```

For faster iteration, set up Xcode Run Script build phase (see `mobile/kotlin-multiplatform/quick-ref/ios-integration.md`).

## When to Choose Compose iOS vs SwiftUI vs Hybrid

| Goal | Choice |
|---|---|
| Single design system across iOS+Android+Desktop | Compose Multiplatform |
| Maximum native iOS feel + animation | SwiftUI |
| Reuse business logic, native UI per platform | KMP shared logic + native UI (no CMP) |
| Compose iOS for content + SwiftUI for system surfaces | Hybrid (recommended for production wallets) |

For BHODL: **Compose Multiplatform for screens, SwiftUI for system sheets (share, biometric prompt UI, settings)**. Maximum reuse + native fidelity where it matters.
