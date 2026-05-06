# Navigation Compose 2.8+ — Quick Reference

Type-safe routes, deep links, multi-stack bottom nav, dialog/bottom-sheet destinations.

## Type-Safe Routes (2.8+)

```kotlin
@Serializable
data object HomeRoute

@Serializable
data class WalletDetailRoute(val walletId: String, val showBalance: Boolean = true)

@Serializable
data class TransactionRoute(val txId: String)

@Composable
fun AppNavHost() {
    val nav = rememberNavController()

    NavHost(navController = nav, startDestination = HomeRoute) {
        composable<HomeRoute> {
            HomeScreen(
                onWalletClick = { id -> nav.navigate(WalletDetailRoute(id)) },
            )
        }
        composable<WalletDetailRoute> { entry ->
            val route: WalletDetailRoute = entry.toRoute()
            WalletDetailScreen(
                walletId = route.walletId,
                showBalance = route.showBalance,
                onTxClick = { txId -> nav.navigate(TransactionRoute(txId)) },
                onBack = { nav.popBackStack() },
            )
        }
        composable<TransactionRoute> { entry ->
            val route: TransactionRoute = entry.toRoute()
            TransactionScreen(txId = route.txId, onBack = { nav.popBackStack() })
        }
    }
}
```

Mark routes `@Serializable` (kotlinx.serialization). Compiler checks navigation arg types at compile time.

## Pop Patterns

```kotlin
nav.popBackStack()                              // pop current
nav.popBackStack(HomeRoute, inclusive = false) // pop until Home
nav.popBackStack(HomeRoute, inclusive = true)  // pop and remove Home too

// Pop with result
nav.previousBackStackEntry?.savedStateHandle?.set("result", data)
nav.popBackStack()

// Read result on previous screen
val result by nav.currentBackStackEntry
    ?.savedStateHandle
    ?.getStateFlow<String?>("result", null)
    ?.collectAsStateWithLifecycle() ?: remember { mutableStateOf(null) }
```

## Navigate with Options

```kotlin
nav.navigate(WalletDetailRoute(id)) {
    popUpTo(HomeRoute) { inclusive = false }   // clear stack up to Home
    launchSingleTop = true                      // prevent duplicate destination
    restoreState = true                          // restore saved UI state
}
```

`launchSingleTop` prevents stacking the same destination if user taps twice.

## Nested Graphs

```kotlin
@Serializable data object SettingsGraph
@Serializable data object ProfileSettingsRoute
@Serializable data object NotificationSettingsRoute

NavHost(navController = nav, startDestination = HomeRoute) {
    composable<HomeRoute> { /* ... */ }

    navigation<SettingsGraph>(startDestination = ProfileSettingsRoute) {
        composable<ProfileSettingsRoute> { ProfileScreen() }
        composable<NotificationSettingsRoute> { NotificationsScreen() }
    }
}

// Navigate to graph (lands on its startDestination)
nav.navigate(SettingsGraph)
```

Useful for grouping related screens, scoping shared ViewModel via `hiltViewModel(navBackStackEntry)`.

## Bottom Bar Multi-Stack

Each tab keeps its own back stack. Switching tabs doesn't reset state.

```kotlin
@Serializable data object HomeTabRoute
@Serializable data object WalletsTabRoute
@Serializable data object SettingsTabRoute

@Composable
fun MainScaffold() {
    val nav = rememberNavController()
    val backStackEntry by nav.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route

    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = currentRoute?.startsWith("...HomeTabRoute") == true,
                    onClick = {
                        nav.navigate(HomeTabRoute) {
                            popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                    icon = { Icon(Icons.Default.Home, null) },
                    label = { Text("Home") },
                )
                // ... more tabs
            }
        }
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = HomeTabRoute,
            modifier = Modifier.padding(padding),
        ) {
            composable<HomeTabRoute> { HomeScreen() }
            composable<WalletsTabRoute> { WalletsScreen() }
            composable<SettingsTabRoute> { SettingsScreen() }
        }
    }
}
```

Key options for tab nav: `popUpTo(startDest, saveState = true)` + `launchSingleTop = true` + `restoreState = true`.

## Dialog Destinations

```kotlin
@Serializable data class ConfirmDialogRoute(val message: String)

NavHost(navController = nav, startDestination = HomeRoute) {
    composable<HomeRoute> { /* ... */ }

    dialog<ConfirmDialogRoute> { entry ->
        val route: ConfirmDialogRoute = entry.toRoute()
        AlertDialog(
            onDismissRequest = { nav.popBackStack() },
            title = { Text("Confirm") },
            text = { Text(route.message) },
            confirmButton = {
                TextButton(onClick = {
                    nav.previousBackStackEntry?.savedStateHandle?.set("confirmed", true)
                    nav.popBackStack()
                }) { Text("Yes") }
            },
        )
    }
}

// Trigger
nav.navigate(ConfirmDialogRoute("Send 1000 sats?"))
```

`dialog<T>` builder is a normal composable destination but rendered inside Compose `Dialog`.

## Bottom Sheet Destinations (Material 3 Nav)

Compose Navigation 2.8 doesn't ship a `bottomSheet` builder out of the box. Two approaches:

### A. Material Navigation (Compose Material) — older

```kotlin
implementation("androidx.navigation:navigation-compose:2.8.5")
implementation("androidx.compose.material:material-navigation:1.7.0")    // Material 2
```

```kotlin
val sheetState = rememberBottomSheetNavigatorSheetState()
val bottomSheetNav = rememberBottomSheetNavigator(sheetState)
val nav = rememberNavController(bottomSheetNav)

ModalBottomSheetLayout(bottomSheetNavigator = bottomSheetNav) {
    NavHost(nav, startDestination = HomeRoute) {
        composable<HomeRoute> { /* ... */ }
        bottomSheet<SendBottomSheetRoute> { /* ... */ }
    }
}
```

### B. Manual Material 3 sheet via state

```kotlin
@Composable
fun AppNavHost() {
    val nav = rememberNavController()
    var showSendSheet by remember { mutableStateOf(false) }

    NavHost(nav, startDestination = HomeRoute) {
        composable<HomeRoute> {
            HomeScreen(onSendClick = { showSendSheet = true })
        }
    }

    if (showSendSheet) {
        ModalBottomSheet(onDismissRequest = { showSendSheet = false }) {
            SendForm(onSubmit = { /* ... */; showSendSheet = false })
        }
    }
}
```

Approach B is simpler for one-off sheets; A scales for many sheet routes.

## Deep Links

```kotlin
composable<WalletDetailRoute>(
    deepLinks = listOf(
        navDeepLink<WalletDetailRoute>(basePath = "https://bhodl.app/wallet")
    ),
) { /* ... */ }
```

App receives `https://bhodl.app/wallet?walletId=abc&showBalance=true` → routes to `WalletDetailRoute(walletId="abc", showBalance=true)`.

In `AndroidManifest.xml`:

```xml
<activity android:name=".MainActivity" android:exported="true">
    <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="https" android:host="bhodl.app" />
    </intent-filter>
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="bitcoin" />               <!-- bitcoin: URI -->
    </intent-filter>
</activity>
```

For Bitcoin URI handling (BIP21):

```kotlin
@Composable
fun BitcoinUriHandler(intent: Intent?) {
    val nav = LocalNavController.current
    LaunchedEffect(intent) {
        intent?.data?.takeIf { it.scheme == "bitcoin" }?.let { uri ->
            val address = uri.host                    // bc1q...
            val amount = uri.getQueryParameter("amount")?.toLongOrNull()
            nav.navigate(SendRoute(address = address, amount = amount))
        }
    }
}
```

## Animation Between Destinations

```kotlin
NavHost(
    navController = nav,
    startDestination = HomeRoute,
    enterTransition = { slideInHorizontally { it } + fadeIn() },
    exitTransition = { slideOutHorizontally { -it } + fadeOut() },
    popEnterTransition = { slideInHorizontally { -it } + fadeIn() },
    popExitTransition = { slideOutHorizontally { it } + fadeOut() },
) { /* ... */ }
```

Per-destination override:

```kotlin
composable<WalletDetailRoute>(
    enterTransition = { fadeIn() },
    exitTransition = { fadeOut() },
) { /* ... */ }
```

## Custom Navigators (advanced)

For fully custom navigation behavior (full-screen overlays, side panels), implement `Navigator` subclass. Rarely needed.

## Testing Navigation

```kotlin
@Test fun navigatesToDetailOnClick() {
    val nav = TestNavHostController(ApplicationProvider.getApplicationContext())
    nav.navigatorProvider.addNavigator(ComposeNavigator())

    composeTestRule.setContent {
        nav.setGraph(R.navigation.app_nav)         // or programmatic NavHost
        NavHost(nav, startDestination = HomeRoute) { /* ... */ }
    }

    composeTestRule.onNodeWithText("Wallet 1").performClick()

    val current = nav.currentBackStackEntry?.toRoute<WalletDetailRoute>()
    assertEquals("1", current?.walletId)
}
```

## Pitfalls

| Pitfall | Fix |
|---|---|
| Forgetting `@Serializable` on route class | Compile error or runtime crash |
| Two destinations with same route serializer | Routing ambiguous — use distinct types |
| `popBackStack()` on first destination | Returns `false`, stays — handle with `BackHandler` to exit |
| Lost state when switching tabs | Use `saveState = true` + `restoreState = true` |
| Hilt-scoped ViewModel survives across nav | Use `hiltViewModel(navBackStackEntry)` for destination scope |
| Deep link not opening from launcher | `launchSingleTop = true` in deep link options |
| Animations janky | Lower complexity, profile with Compose tracing |
| `currentBackStackEntryAsState()` recomposes too often | Use `currentDestinationAsState()` or filter by route |
