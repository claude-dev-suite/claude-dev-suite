---
name: compose-multiplatform
description: |
  Compose Multiplatform (CMP) by JetBrains — declarative UI framework that runs
  on Android, iOS, JVM Desktop, and Web (Wasm). Built on top of Jetpack Compose.
  Covers @Composable functions, state hoisting, side effects, navigation (Voyager,
  Decompose), Material 3, theming, and platform-specific UI bridging on iOS.

  USE WHEN: user mentions "Compose Multiplatform", "@Composable", "remember",
  "MutableState", "Compose iOS", "Compose Desktop", "Compose Wasm", "JetBrains Compose",
  "Voyager", "Decompose", "compose-multiplatform-resources"

  DO NOT USE FOR: KMP module setup (gradle, expect/actual) - use `mobile/kotlin-multiplatform`
  DO NOT USE FOR: Jetpack Compose Android-only - use `mobile/jetpack-compose`
  DO NOT USE FOR: SwiftUI native - use `mobile/ios-native` or `languages/swift`
  DO NOT USE FOR: Pure Kotlin language - use `languages/kotlin`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Compose Multiplatform

> **References**: [ios-platform.md](quick-ref/ios-platform.md) for iOS-specific patterns (UIViewController interop, gesture differences, native scroll). [navigation-di.md](quick-ref/navigation-di.md) for navigation libraries (Voyager, Decompose) and DI integration. [theming.md](quick-ref/theming.md) for Material 3 + custom design systems, dark mode, dynamic color.
>
> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `compose-multiplatform`.

## What CMP Is

Compose Multiplatform brings Jetpack Compose to **Android, iOS, JVM Desktop, and Web (Wasm)**. Same `@Composable` code renders on every target via Skia.

**Status (Mid-2026)**:
- Android: Stable (it's Jetpack Compose underneath)
- Desktop: Stable
- iOS: **Stable since 1.8.0** (early 2025)
- Web (Wasm): Beta — usable for prototypes, some gaps

**Trade-offs vs native**:
- ✅ Single UI codebase, fast iteration
- ✅ Pixel-perfect parity, custom design systems easy
- ⚠️ iOS gestures, accessibility, system fonts, share sheets need bridging
- ⚠️ Bundle size larger than pure SwiftUI (Skia ~5-8MB)
- ⚠️ iOS Core Animation transitions don't apply automatically

## Minimal Setup

```kotlin
// shared/build.gradle.kts
plugins {
    kotlin("multiplatform") version "2.2.0"
    id("com.android.library") version "8.7.0"
    id("org.jetbrains.compose") version "1.8.0"
    kotlin("plugin.compose") version "2.2.0"   // Required for Kotlin 2.x
}

kotlin {
    androidTarget()
    listOf(iosX64(), iosArm64(), iosSimulatorArm64()).forEach { target ->
        target.binaries.framework {
            baseName = "Shared"
            isStatic = true
        }
    }
    jvm("desktop")

    sourceSets {
        commonMain.dependencies {
            implementation(compose.runtime)
            implementation(compose.foundation)
            implementation(compose.material3)
            implementation(compose.ui)
            implementation(compose.components.resources)
            implementation("org.jetbrains.compose.material:material-icons-extended:1.8.0")
        }
        androidMain.dependencies {
            implementation("androidx.activity:activity-compose:1.10.0")
        }
        desktopMain.dependencies {
            implementation(compose.desktop.currentOs)
        }
    }
}

compose.resources {
    publicResClass = true
    packageOfResClass = "com.example.shared.resources"
}
```

## First Composable

```kotlin
// shared/src/commonMain/kotlin/App.kt
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun App() {
    MaterialTheme {
        var count by remember { mutableStateOf(0) }
        Column(
            modifier = Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Count: $count", style = MaterialTheme.typography.headlineMedium)
            Button(onClick = { count++ }) {
                Text("Increment")
            }
        }
    }
}
```

## Wiring Per Platform

### Android

```kotlin
// apps/android/MainActivity.kt
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { App() }
    }
}
```

### iOS

```kotlin
// shared/src/iosMain/kotlin/MainViewController.kt
import androidx.compose.ui.window.ComposeUIViewController

fun MainViewController() = ComposeUIViewController { App() }
```

```swift
// apps/ios/ContentView.swift
import SwiftUI
import Shared

struct ContentView: View {
    var body: some View {
        ComposeView()
            .ignoresSafeArea(.keyboard)
    }
}

struct ComposeView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        Main_iosKt.MainViewController()
    }
    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}
```

### Desktop

```kotlin
// apps/desktop/Main.kt
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application

fun main() = application {
    Window(onCloseRequest = ::exitApplication, title = "BHODL") {
        App()
    }
}
```

## State

### `remember` and `mutableStateOf`

```kotlin
@Composable
fun NameField() {
    var name by remember { mutableStateOf("") }
    OutlinedTextField(
        value = name,
        onValueChange = { name = it },
        label = { Text("Name") },
    )
}
```

`remember` survives recomposition; lost on configuration change/process death. Use `rememberSaveable` to persist across config changes.

```kotlin
var name by rememberSaveable { mutableStateOf("") }
```

### State Hoisting

Lift state to the lowest common ancestor. Children become stateless and reusable.

```kotlin
@Composable
fun NameForm(
    name: String,
    onNameChange: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    Column {
        OutlinedTextField(value = name, onValueChange = onNameChange)
        Button(onClick = onSubmit) { Text("Submit") }
    }
}

@Composable
fun ParentScreen() {
    var name by remember { mutableStateOf("") }
    NameForm(
        name = name,
        onNameChange = { name = it },
        onSubmit = { /* ... */ },
    )
}
```

### Collecting Flows

```kotlin
@Composable
fun WalletScreen(viewModel: WalletViewModel) {
    val state by viewModel.state.collectAsState()

    when (val s = state) {
        is UiState.Loading -> CircularProgressIndicator()
        is UiState.Success -> WalletList(s.wallets)
        is UiState.Error -> ErrorView(s.message)
    }
}
```

`collectAsState` works on all CMP targets (uses platform-appropriate Flow collection).

## Side Effects

| Effect | Use case |
|---|---|
| `LaunchedEffect(key1, ...)` | Run suspending work; cancels on key change |
| `DisposableEffect(key)` | Setup with cleanup (listeners) |
| `SideEffect { }` | Run on every successful recomposition (rare) |
| `produceState` | Convert non-Compose source to State |
| `derivedStateOf` | Memoize computation depending on multiple states |
| `rememberCoroutineScope()` | Launch coroutines tied to composable lifecycle |
| `snapshotFlow { ... }` | Convert State to Flow |

```kotlin
@Composable
fun BalanceObserver(walletId: String, repo: WalletRepository) {
    val balance by produceState<Balance?>(initialValue = null, walletId) {
        value = repo.getBalance(walletId)
    }
    Text("Balance: ${balance?.confirmed ?: "..."}")
}

@Composable
fun TickerExample() {
    var seconds by remember { mutableStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1000)
            seconds++
        }
    }
    Text("Elapsed: $seconds")
}

@Composable
fun ScrollPositionTracker(scrollState: ScrollState) {
    LaunchedEffect(scrollState) {
        snapshotFlow { scrollState.value }
            .collect { offset -> log("scroll: $offset") }
    }
}
```

## Common UI Patterns

### Lists

```kotlin
@Composable
fun WalletList(wallets: List<Wallet>) {
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(wallets, key = { it.id }) { wallet ->
            WalletItem(wallet)
        }
    }
}
```

`key = { it.id }` enables Compose to track items across reorders/animations.

### Forms

```kotlin
@Composable
fun SendForm(onSend: (String, Long) -> Unit) {
    var address by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    val canSend = address.isNotBlank() && amount.toLongOrNull() != null

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(
            value = address,
            onValueChange = { address = it },
            label = { Text("Address") },
            singleLine = true,
        )
        OutlinedTextField(
            value = amount,
            onValueChange = { if (it.all(Char::isDigit)) amount = it },
            label = { Text("Amount (sats)") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
        )
        Button(
            onClick = { onSend(address, amount.toLong()) },
            enabled = canSend,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Send") }
    }
}
```

### Dialogs

```kotlin
@Composable
fun ConfirmDialog(
    title: String,
    text: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text("Confirm") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}
```

## Resources

```kotlin
import org.jetbrains.compose.resources.painterResource
import org.jetbrains.compose.resources.stringResource

@Composable
fun WelcomeBanner() {
    Column {
        Image(
            painter = painterResource(Res.drawable.logo),
            contentDescription = null,
        )
        Text(stringResource(Res.string.welcome))
    }
}
```

Resources live in `shared/src/commonMain/composeResources/`:
- `drawable/` (PNG, SVG via androidx.compose.ui.graphics.vector)
- `font/` → `Font(Res.font.inter, FontWeight.Normal)`
- `values/strings.xml` → multi-language via `values-it/strings.xml`
- `files/` → raw bytes via `Res.readBytes("files/data.json")`

## Theming — Material 3

```kotlin
private val LightColors = lightColorScheme(
    primary = Color(0xFFFF9500),       // BHODL orange
    onPrimary = Color.White,
    surface = Color(0xFFFAFAFA),
    onSurface = Color.Black,
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFFFB740),
    onPrimary = Color.Black,
    surface = Color(0xFF121212),
    onSurface = Color.White,
)

@Composable
fun BhodlTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) DarkColors else LightColors
    MaterialTheme(
        colorScheme = colors,
        typography = bhodlTypography,
        shapes = bhodlShapes,
        content = content,
    )
}
```

For deeper customization (custom design tokens, multi-brand) see [theming.md](quick-ref/theming.md).

## Modifier Order Matters

```kotlin
// padding inside background → padding shows background
Box(
    Modifier
        .background(Color.Red)
        .padding(16.dp)
)

// padding outside background → padding empty
Box(
    Modifier
        .padding(16.dp)
        .background(Color.Red)
)
```

Modifier chain executes left-to-right for layout/measurement. Always apply `clickable`, `focusable`, `clip` in the right position.

## Performance

### Use `remember` Wisely

```kotlin
// ❌ Bad — calculation runs every recomposition
@Composable
fun ExpensiveItem(items: List<Item>) {
    val sorted = items.sortedBy { it.priority }    // O(n log n) per recomp
    LazyColumn { items(sorted) { Item(it) } }
}

// ✅ Good — memoized
@Composable
fun ExpensiveItem(items: List<Item>) {
    val sorted = remember(items) { items.sortedBy { it.priority } }
    LazyColumn { items(sorted) { Item(it) } }
}
```

### Stable Types

Mark data classes `@Immutable` or `@Stable` to help Compose skip recomposition:

```kotlin
@Immutable
data class Balance(val confirmed: Long, val pending: Long)
```

Without it, Compose may recompose every time the parent does, even if the same instance is passed.

### `derivedStateOf` for Multi-State Computations

```kotlin
val isFormValid by remember {
    derivedStateOf {
        address.isNotBlank() && amount.toLongOrNull() != null && amount.toLong() > 0
    }
}
```

Recomputes only when one of the dependencies changes value — not on every recomposition.

## Animations

```kotlin
@Composable
fun ExpandableCard(text: String) {
    var expanded by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier.animateContentSize(),
        onClick = { expanded = !expanded },
    ) {
        Column(Modifier.padding(16.dp)) {
            Text("Tap to expand", style = MaterialTheme.typography.titleMedium)
            if (expanded) {
                Text(text, modifier = Modifier.padding(top = 8.dp))
            }
        }
    }
}

@Composable
fun PulseDot() {
    val infiniteTransition = rememberInfiniteTransition()
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            tween(800, easing = LinearEasing),
            RepeatMode.Reverse,
        ),
    )
    Box(
        Modifier
            .size(12.dp)
            .alpha(alpha)
            .background(Color.Green, CircleShape)
    )
}
```

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Mutable lists in state (`mutableListOf()` in `mutableStateOf`) | Compose doesn't observe additions | Use `mutableStateListOf()` or assign new list |
| Heavy work in composable body | Runs on every recomp | Use `remember`, side effects, or move out |
| Reading state outside `@Composable` | Won't recompose | Pass via parameter, or use `snapshotFlow` |
| `@Composable` with side effects | Order undefined | Use `LaunchedEffect`, `DisposableEffect` |
| Forgetting `key` in `LazyColumn.items` | Slow scrolling, lost state | Always pass stable key |
| Modifying `Modifier` chain inside loop | Recreated each pass | Hoist Modifier or use `remember` |
| Nested `LazyColumn` inside `Column` | Layout error | Use single `LazyColumn` with `item { }` blocks for headers |
| Wrapping every screen in `Box(Modifier.fillMaxSize())` | Verbose | Use `Scaffold` for consistent structure |

## Anti-Patterns Specific to iOS

- **Pull-to-refresh**: native iOS uses UIRefreshControl. Compose `pullToRefresh` is available but feels less native — consider hybrid `UIViewControllerRepresentable`
- **Native scroll bounce**: enabled by default in CMP iOS, but customize via `Modifier.scrollable` if needed
- **Keyboard avoidance**: Compose iOS doesn't auto-handle. Use `Modifier.imePadding()` and configure `ComposeUIViewController` keyboard mode
- **Share sheet**: no Compose API — bridge to `UIActivityViewController` via `UIViewControllerRepresentable`
- **Haptics**: use platform expect/actual to call `UIImpactFeedbackGenerator` / `Vibrator`

## Testing

```kotlin
// commonTest with createComposeRule
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick

class CounterTest {
    @get:Rule val rule = createComposeRule()

    @Test fun `increments on click`() {
        rule.setContent { App() }
        rule.onNodeWithText("Count: 0").assertExists()
        rule.onNodeWithText("Increment").performClick()
        rule.onNodeWithText("Count: 1").assertExists()
    }
}
```

Compose tests run on JVM by default (Robolectric-style). For real device tests use `androidUITest` or `iosTest`.

For snapshot testing: **Paparazzi** (Square) on JVM, **Roborazzi** for Android. CMP iOS snapshot testing is still rough — use SwiftUI's snapshot tools at the app boundary.

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| KMP setup (gradle, expect/actual) | `mobile/kotlin-multiplatform` |
| Native iOS UI (SwiftUI, UIKit) | `mobile/ios-native` (when added) |
| Pure Jetpack Compose Android-only | `mobile/jetpack-compose` (when added) |
| Pure Kotlin language patterns | `languages/kotlin` |
| Navigation deep dive | [navigation-di.md](quick-ref/navigation-di.md) |
| iOS-specific gotchas | [ios-platform.md](quick-ref/ios-platform.md) |
