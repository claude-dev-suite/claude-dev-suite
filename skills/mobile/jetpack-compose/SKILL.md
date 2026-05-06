---
name: jetpack-compose
description: |
  Jetpack Compose for native Android UI. Covers @Composable functions, state,
  side effects, ViewModel + Compose, Hilt DI, Navigation Compose, Material 3 with
  Dynamic Color (Material You), Compose for Wear OS, Compose previews, and Android
  lifecycle integration (Activity, Fragment interop).

  USE WHEN: user mentions "Jetpack Compose", "@Composable" in Android-only context,
  "ViewModel", "Hilt", "Navigation Compose", "Material You", "Dynamic Color",
  "Compose preview", "AndroidView", "rememberLauncherForActivityResult",
  "Compose Wear OS"

  DO NOT USE FOR: Cross-platform Compose - use `frontend-frameworks/compose-multiplatform`
  DO NOT USE FOR: Kotlin language fundamentals - use `languages/kotlin`
  DO NOT USE FOR: Android non-UI APIs (Keystore, NFC, etc) - use `mobile/android-native`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Jetpack Compose (Android)

> **References**: [state-effects.md](quick-ref/state-effects.md) for ViewModel + Compose, side-effect APIs, snapshot system. [navigation.md](quick-ref/navigation.md) for Navigation Compose 2.8+ with type-safe routes, deep links, multi-stack. [interop.md](quick-ref/interop.md) for AndroidView/ComposeView interop, Activity Result Contracts, Fragment integration.
>
> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `jetpack-compose`.

## Setup

```kotlin
// app/build.gradle.kts
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android") version "2.2.0"
    id("org.jetbrains.kotlin.plugin.compose") version "2.2.0"   // required for Kotlin 2.x
    id("com.google.devtools.ksp")
    id("dagger.hilt.android.plugin")
}

android {
    buildFeatures { compose = true }
    composeOptions {
        // Compose Compiler is now part of Kotlin 2.x — no kotlinCompilerExtensionVersion needed
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.01.00")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("androidx.activity:activity-compose:1.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.0")
    implementation("androidx.navigation:navigation-compose:2.8.5")
    implementation("androidx.hilt:hilt-navigation-compose:1.2.0")
    implementation("com.google.dagger:hilt-android:2.55")
    ksp("com.google.dagger:hilt-compiler:2.55")
}
```

## Activity Entry Point

```kotlin
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()                         // draws under status/nav bars
        setContent {
            BhodlTheme {
                AppNavHost()
            }
        }
    }
}
```

`enableEdgeToEdge()` (Activity 1.8+) is the modern way to configure edge-to-edge — replaces `WindowCompat.setDecorFitsSystemWindows(window, false)`.

## ViewModel + StateFlow + Compose

```kotlin
@HiltViewModel
class WalletViewModel @Inject constructor(
    private val repo: WalletRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val walletId: String = savedStateHandle["walletId"] ?: error("missing walletId")

    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = UiState.Loading
            runCatching { repo.getWallet(walletId) }
                .onSuccess { _state.value = UiState.Success(it) }
                .onFailure { _state.value = UiState.Error(it.message ?: "unknown") }
        }
    }
}

@Composable
fun WalletScreen(
    viewModel: WalletViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    when (val s = state) {
        UiState.Loading -> CircularProgressIndicator()
        is UiState.Success -> WalletContent(s.wallet, onRefresh = viewModel::load)
        is UiState.Error -> ErrorView(s.message, onRetry = viewModel::load)
    }
}
```

`collectAsStateWithLifecycle()` (from `lifecycle-runtime-compose`) is **preferred over `collectAsState`** — automatically pauses collection when screen is in background, prevents wasted work and battery drain.

## Material 3 + Dynamic Color (Material You)

```kotlin
@Composable
fun BhodlTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,                  // Material You on Android 12+
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        darkTheme -> DarkColors
        else -> LightColors
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = bhodlTypography,
        shapes = bhodlShapes,
        content = content,
    )
}
```

For status/nav bar tinting in edge-to-edge:

```kotlin
val view = LocalView.current
if (!view.isInEditMode) {
    SideEffect {
        val window = (view.context as Activity).window
        WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
    }
}
```

## Navigation Compose (Type-Safe Routes — 2.8+)

```kotlin
@Serializable
data object HomeRoute

@Serializable
data class WalletDetailRoute(val walletId: String)

@Composable
fun AppNavHost() {
    val navController = rememberNavController()

    NavHost(
        navController = navController,
        startDestination = HomeRoute,
    ) {
        composable<HomeRoute> {
            HomeScreen(
                onWalletClick = { id -> navController.navigate(WalletDetailRoute(id)) },
            )
        }
        composable<WalletDetailRoute> { backStackEntry ->
            val route: WalletDetailRoute = backStackEntry.toRoute()
            WalletDetailScreen(
                walletId = route.walletId,
                onBack = { navController.popBackStack() },
            )
        }
    }
}
```

Type-safe routes (since Navigation Compose 2.8) replace string-based routes — no more typo-driven crashes.

For nested graphs:

```kotlin
@Serializable data object SettingsGraph
@Serializable data object ProfileSettingsRoute

NavHost(navController = nav, startDestination = HomeRoute) {
    navigation<SettingsGraph>(startDestination = ProfileSettingsRoute) {
        composable<ProfileSettingsRoute> { ProfileSettings() }
        composable<NotificationSettingsRoute> { NotificationSettings() }
    }
}
```

See [navigation.md](quick-ref/navigation.md) for deep linking, multi-stack bottom nav, dialog/bottom-sheet destinations.

## Side Effects (Android-specific)

| API | Use case |
|---|---|
| `LaunchedEffect(key)` | Suspending work, cancels on key change |
| `DisposableEffect(key)` | Setup with cleanup (lifecycle observer, BroadcastReceiver) |
| `LifecycleEventEffect(event)` | React to specific Lifecycle events (ON_RESUME, ON_PAUSE) |
| `LifecycleResumeEffect` / `LifecycleStartEffect` | Lifecycle-scoped effect with auto-pause |
| `rememberLauncherForActivityResult` | Permissions, file picker, take photo |
| `BackHandler { }` | Intercept system back button |

```kotlin
@Composable
fun CameraScreen() {
    val context = LocalContext.current

    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { granted -> /* ... */ },
    )

    LaunchedEffect(Unit) {
        cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
    }
}

@Composable
fun ProcessLifecycleObserver(onResume: () -> Unit) {
    LifecycleResumeEffect(Unit) {
        onResume()
        onPauseOrDispose { /* cleanup */ }
    }
}

@Composable
fun ConfirmExit(onExit: () -> Unit) {
    BackHandler { onExit() }
}
```

## Hilt + Compose

```kotlin
// Module
@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides @Singleton
    fun provideWalletRepository(api: WalletApi, db: AppDatabase): WalletRepository =
        WalletRepositoryImpl(api, db)
}

// ViewModel
@HiltViewModel
class WalletViewModel @Inject constructor(
    private val repo: WalletRepository,
) : ViewModel() { /* ... */ }

// Composable injection
@Composable
fun WalletScreen(viewModel: WalletViewModel = hiltViewModel()) { /* ... */ }
```

For nested `NavHost` with Hilt-scoped ViewModel:

```kotlin
@Composable
fun NestedScreen(navBackStackEntry: NavBackStackEntry) {
    val viewModel: NestedViewModel = hiltViewModel(navBackStackEntry)
    /* ViewModel scoped to this nav destination */
}
```

## Common UI Patterns

### Scaffold with TopAppBar

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WalletDetailScreen(walletId: String, onBack: () -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Wallet") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { /* share */ }) {
                        Icon(Icons.Default.Share, "Share")
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { /* send */ }) {
                Icon(Icons.Default.Send, "Send")
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding)) { /* content */ }
    }
}
```

### LazyColumn with key

```kotlin
@Composable
fun TransactionList(transactions: List<Transaction>, onClick: (String) -> Unit) {
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(
            items = transactions,
            key = { it.id },                          // stable identity
            contentType = { it.type },                // recycle composables by type
        ) { tx ->
            TransactionItem(tx, onClick = { onClick(tx.id) })
        }
    }
}
```

### Pull to Refresh

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WalletList(viewModel: WalletViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val isRefreshing = state is UiState.Loading

    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = viewModel::refresh,
    ) {
        LazyColumn { /* ... */ }
    }
}
```

## Compose Previews

```kotlin
@Preview(name = "Light", showBackground = true)
@Preview(name = "Dark", uiMode = Configuration.UI_MODE_NIGHT_YES)
@Preview(name = "Phone", device = Devices.PIXEL_7, showSystemUi = true)
@Composable
fun WalletItemPreview() {
    BhodlTheme {
        WalletItem(
            wallet = Wallet(id = "1", name = "Main", balance = 100_000),
            onClick = {},
        )
    }
}

// Multi-preview annotation
annotation class ThemeAndFontScalePreviews
@ThemeAndFontScalePreviews
@Preview(name = "Light", showBackground = true)
@Preview(name = "Dark", uiMode = Configuration.UI_MODE_NIGHT_YES)
@Preview(name = "Large Font", fontScale = 1.5f)
@Preview(name = "Small Font", fontScale = 0.8f)
@Composable
fun MyPreviews() { /* ... */ }
```

For interactive previews: tap "Interactive Mode" in Android Studio. For animation previews: tap "Animation Inspector".

## Dialogs and Bottom Sheets

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SendBottomSheet(onDismiss: () -> Unit, onSend: (String, Long) -> Unit) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    val scope = rememberCoroutineScope()

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        SendForm(onSend = { addr, amt ->
            scope.launch { sheetState.hide() }
                .invokeOnCompletion {
                    if (!sheetState.isVisible) onDismiss()
                    onSend(addr, amt)
                }
        })
    }
}

@Composable
fun ConfirmDialog(title: String, text: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = { TextButton(onClick = onConfirm) { Text("Confirm") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
```

## Permissions

Use **Accompanist Permissions** (or roll your own with `rememberLauncherForActivityResult`):

```kotlin
implementation("com.google.accompanist:accompanist-permissions:0.36.0")
```

```kotlin
@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun CameraPermissionGate(content: @Composable () -> Unit) {
    val cameraPermission = rememberPermissionState(Manifest.permission.CAMERA)

    when {
        cameraPermission.status.isGranted -> content()
        cameraPermission.status.shouldShowRationale -> RationaleScreen(
            onRequest = { cameraPermission.launchPermissionRequest() }
        )
        else -> RequestScreen(
            onRequest = { cameraPermission.launchPermissionRequest() }
        )
    }
}
```

## Performance

### Stability Annotations

```kotlin
@Immutable
data class WalletUiState(
    val wallets: List<Wallet>,
    val balance: Long,
)

@Stable
interface WalletActions {
    fun onSend()
    fun onReceive()
}
```

`@Immutable` → all fields immutable, treat as stable. `@Stable` → mutable but predictable equality. Both help Compose skip recomposition.

### Compose Compiler Metrics

```kotlin
// app/build.gradle.kts
kotlinOptions {
    freeCompilerArgs += listOf(
        "-P", "plugin:androidx.compose.compiler.plugins.kotlin:reportsDestination=" +
              project.layout.buildDirectory.dir("compose-reports").get().asFile.absolutePath,
        "-P", "plugin:androidx.compose.compiler.plugins.kotlin:metricsDestination=" +
              project.layout.buildDirectory.dir("compose-reports").get().asFile.absolutePath,
    )
}
```

Generates classes/composables stability reports. Identify which classes are unstable and fix.

### Baseline Profiles

Compose apps benefit massively from baseline profiles. Generate with `androidx.benchmark`:

```bash
./gradlew :baselineprofile:generateBaselineProfile
```

Drops cold start time 20-40%.

## Anti-Patterns (Android-specific)

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| `collectAsState()` instead of `collectAsStateWithLifecycle()` | Wastes battery in background | Always use `WithLifecycle` variant |
| `LaunchedEffect(true) { }` or `LaunchedEffect(Unit) { }` everywhere | Runs once but easy to misuse | Use proper key (id, viewModel ref) |
| `var viewModel: ViewModel` field in composable | Lost on recomp | `viewModels()` in Activity, `hiltViewModel()` in composable |
| Heavy work in `init { }` of ViewModel | Blocks UI on creation | Defer to `viewModelScope.launch` |
| Forgetting `enableEdgeToEdge()` + `Modifier.systemBarsPadding()` | UI clipped by system bars | Use `enableEdgeToEdge()` + `WindowInsets.safeDrawing` |
| String-based nav routes | Typo crashes | Use `@Serializable` route classes (2.8+) |
| `mutableStateOf<MyClass>(...)` for unstable types | Compose can't skip recomp | Mark `@Immutable` or use `derivedStateOf` |
| `AndroidView` everywhere instead of pure Compose | Bypasses optimizations | Only for missing widgets (MapView, WebView) |
| `remember { mutableStateOf(...) }` for ViewModel state | Lost on rotation | Hoist to ViewModel + `collectAsState` |
| `LocalContext.current.startActivity(intent)` | Hard to test | Use `rememberLauncherForActivityResult` |
| `BroadcastReceiver` registered in composable without `DisposableEffect` | Leak | Always register/unregister via `DisposableEffect` |

## Testing

```kotlin
// androidTest
class WalletScreenTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test fun showsWalletsWhenLoaded() {
        rule.setContent {
            BhodlTheme {
                WalletScreen(viewModel = fakeLoadedViewModel())
            }
        }
        rule.onNodeWithText("Main wallet").assertExists()
        rule.onNodeWithContentDescription("Send").performClick()
    }

    @Test fun navigatesToDetail() {
        // setup with TestNavHostController
    }
}
```

For unit tests of Composables: use **Robolectric** + `createComposeRule()`.
For visual regression: **Paparazzi** (Square) — JVM-based, fast, no emulator needed.
For Android instrumented snapshot: **Roborazzi** — runs on emulator.

## Compose for Wear OS

```kotlin
implementation("androidx.wear.compose:compose-material3:1.5.0")
implementation("androidx.wear.compose:compose-foundation:1.5.0")
implementation("androidx.wear.compose:compose-navigation:1.5.0")
```

```kotlin
@Composable
fun WearApp() {
    MaterialTheme {
        ScalingLazyColumn(
            modifier = Modifier.fillMaxSize(),
        ) {
            item { Chip(label = { Text("Send") }, onClick = { /* ... */ }) }
            item { Chip(label = { Text("Receive") }, onClick = { /* ... */ }) }
        }
    }
}
```

Wear UI uses different components (`Chip`, `ScalingLazyColumn`, `TimeText`) but same Compose paradigm.

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Cross-platform UI (Android + iOS + Desktop) | `frontend-frameworks/compose-multiplatform` |
| Pure Kotlin language patterns | `languages/kotlin` |
| Android Keystore, Biometric, NFC, sensors | `mobile/android-native` |
| KMP module setup | `mobile/kotlin-multiplatform` |
| iOS UI work | `mobile/ios-native` |
| Detailed nav patterns | [navigation.md](quick-ref/navigation.md) |
| Activity Result Contracts, AndroidView interop | [interop.md](quick-ref/interop.md) |
