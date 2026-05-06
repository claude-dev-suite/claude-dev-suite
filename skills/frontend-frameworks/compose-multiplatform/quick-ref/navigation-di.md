# CMP Navigation & DI — Quick Reference

Compose Multiplatform doesn't bundle a navigation library — pick from Voyager, Decompose, or Jetpack Navigation Compose (limited cross-platform).

## Voyager

Compose-native, ergonomic API. Each screen is a `Screen` object.

```kotlin
// build.gradle.kts
implementation("cafe.adriel.voyager:voyager-navigator:1.1.0")
implementation("cafe.adriel.voyager:voyager-screenmodel:1.1.0")        // ViewModel-equivalent
implementation("cafe.adriel.voyager:voyager-koin:1.1.0")               // Koin integration
implementation("cafe.adriel.voyager:voyager-tab-navigator:1.1.0")
implementation("cafe.adriel.voyager:voyager-bottom-sheet-navigator:1.1.0")
implementation("cafe.adriel.voyager:voyager-transitions:1.1.0")
```

### Screens

```kotlin
class HomeScreen : Screen {
    @Composable
    override fun Content() {
        val navigator = LocalNavigator.currentOrThrow
        Column {
            Button(onClick = { navigator.push(WalletDetailScreen(id = "abc")) }) {
                Text("Open wallet")
            }
        }
    }
}

class WalletDetailScreen(val id: String) : Screen {
    @Composable
    override fun Content() {
        val navigator = LocalNavigator.currentOrThrow
        val model = rememberScreenModel { WalletDetailModel(id) }
        val state by model.state.collectAsState()

        Column {
            Text("Wallet $id")
            Button(onClick = { navigator.pop() }) { Text("Back") }
        }
    }
}
```

### Setup

```kotlin
@Composable
fun App() {
    BhodlTheme {
        Navigator(HomeScreen()) { navigator ->
            SlideTransition(navigator)
        }
    }
}
```

### ScreenModel (Voyager's ViewModel)

```kotlin
class WalletDetailModel(walletId: String) : ScreenModel {
    private val _state = MutableStateFlow(WalletState.Loading)
    val state: StateFlow<WalletState> = _state.asStateFlow()

    init {
        screenModelScope.launch {
            // load
        }
    }
}
```

`screenModelScope` is bound to the screen's lifecycle — cancels on pop. Survives configuration changes.

### Tab Navigation

```kotlin
object HomeTab : Tab {
    override val options: TabOptions
        @Composable get() = TabOptions(0u, "Home", rememberVectorPainter(Icons.Default.Home))

    @Composable override fun Content() { HomeScreen().Content() }
}

object WalletsTab : Tab { /* ... */ }

@Composable
fun MainScreen() {
    TabNavigator(HomeTab) {
        Scaffold(
            content = { CurrentTab() },
            bottomBar = {
                NavigationBar {
                    listOf(HomeTab, WalletsTab).forEach { tab ->
                        NavigationBarItem(
                            selected = LocalTabNavigator.current.current == tab,
                            onClick = { LocalTabNavigator.current.current = tab },
                            icon = { Icon(tab.options.icon!!, null) },
                            label = { Text(tab.options.title) },
                        )
                    }
                }
            },
        )
    }
}
```

### Pros/Cons

✅ Compose-idiomatic, low boilerplate
✅ Built-in screen model with lifecycle
✅ Easy back stack manipulation
⚠️ Process-death restoration manual
⚠️ Less powerful for deep-linking and complex flows

## Decompose

UI-agnostic (works with Compose, SwiftUI, Jetpack Compose). More architectural, better for complex apps.

```kotlin
implementation("com.arkivanov.decompose:decompose:3.2.0")
implementation("com.arkivanov.decompose:extensions-compose:3.2.0")
implementation("com.arkivanov.essenty:lifecycle:2.2.0")
```

### Component

```kotlin
interface RootComponent {
    val stack: Value<ChildStack<*, Child>>

    sealed class Child {
        class Home(val component: HomeComponent) : Child()
        class WalletDetail(val component: WalletDetailComponent) : Child()
    }

    fun openWallet(id: String)
    fun onBack()
}

class DefaultRootComponent(componentContext: ComponentContext) :
    RootComponent, ComponentContext by componentContext {

    private val nav = StackNavigation<Config>()

    override val stack = childStack(
        source = nav,
        serializer = Config.serializer(),
        initialConfiguration = Config.Home,
        handleBackButton = true,
        childFactory = ::child,
    )

    private fun child(config: Config, ctx: ComponentContext): RootComponent.Child =
        when (config) {
            Config.Home -> RootComponent.Child.Home(
                DefaultHomeComponent(ctx, ::openWallet)
            )
            is Config.WalletDetail -> RootComponent.Child.WalletDetail(
                DefaultWalletDetailComponent(ctx, walletId = config.id)
            )
        }

    override fun openWallet(id: String) { nav.push(Config.WalletDetail(id)) }
    override fun onBack() { nav.pop() }

    @Serializable
    private sealed class Config {
        @Serializable data object Home : Config()
        @Serializable data class WalletDetail(val id: String) : Config()
    }
}
```

### Compose Side

```kotlin
@Composable
fun RootContent(component: RootComponent) {
    Children(stack = component.stack, animation = stackAnimation(slide())) {
        when (val child = it.instance) {
            is RootComponent.Child.Home -> HomeContent(child.component)
            is RootComponent.Child.WalletDetail -> WalletDetailContent(child.component)
        }
    }
}
```

### Lifecycle

Each component receives a `ComponentContext` with built-in lifecycle. Use `lifecycle.subscribe(onCreate = ..., onDestroy = ...)` or `coroutineScope()` extension.

```kotlin
class DefaultHomeComponent(
    componentContext: ComponentContext,
    private val onWalletClick: (String) -> Unit,
) : HomeComponent, ComponentContext by componentContext {

    private val scope = coroutineScope(Dispatchers.Default + SupervisorJob())

    init {
        scope.launch { /* ... */ }
    }
}
```

### Pros/Cons

✅ Process-death survival via `serializer`
✅ UI-agnostic — same components for Compose + SwiftUI
✅ Strong architecture; testable without Compose
✅ Built-in back-button handling, deep linking
⚠️ More boilerplate than Voyager
⚠️ Steeper learning curve

## Jetpack Navigation Compose (KMP support)

As of 2025, Jetpack Navigation Compose has KMP support but iOS support is still maturing. Use only if you're already on Jetpack Nav and want to extend gradually.

## Comparison

| Concern | Voyager | Decompose | Jetpack Nav Compose |
|---|---|---|---|
| Setup boilerplate | Low | Medium-High | Medium |
| Process death | Manual | Built-in | Built-in (Android) |
| iOS-friendly | Yes | Yes (excellent) | Limited |
| Type-safe routes | Partial | Yes | Yes (with type-safe nav) |
| Deep linking | Manual | Excellent | Good |
| Back stack manipulation | Easy | Verbose | Medium |
| Animation control | Built-in | Pluggable | Built-in |
| iOS swipe-back | Manual | Built-in helper | Limited |
| Best for | Small-medium apps | Large multi-platform apps | Android-first apps |

**Recommendation**:
- New small/medium KMP app → **Voyager**
- Production wallet, complex flows, multi-platform → **Decompose**
- Existing Android app extending to KMP → **Jetpack Nav Compose**

## DI Integration

### Koin + Voyager

```kotlin
class WalletDetailModel(
    walletId: String,
    private val repo: WalletRepository,    // Koin-injected
) : ScreenModel { /* ... */ }

class WalletDetailScreen(val id: String) : Screen {
    @Composable
    override fun Content() {
        val model = getScreenModel<WalletDetailModel> { parametersOf(id) }
        // ...
    }
}
```

```kotlin
val viewModelModule = module {
    factory { (id: String) -> WalletDetailModel(id, get()) }
}
```

### Koin + Decompose

```kotlin
class DefaultRootComponent(
    componentContext: ComponentContext,
    private val koin: Koin,
) : RootComponent, ComponentContext by componentContext {

    private fun child(config: Config, ctx: ComponentContext): RootComponent.Child =
        when (config) {
            is Config.WalletDetail -> RootComponent.Child.WalletDetail(
                DefaultWalletDetailComponent(
                    componentContext = ctx,
                    walletId = config.id,
                    repo = koin.get(),
                )
            )
            // ...
        }
}
```

For larger projects, define a `ComponentFactory` per child rather than passing dependencies one-by-one.

### kotlin-inject (compile-time)

For best performance and compile-time safety:

```kotlin
@Component
@Singleton
abstract class AppComponent {
    abstract val rootComponentFactory: (ComponentContext) -> DefaultRootComponent

    @Provides @Singleton fun walletRepository(
        api: WalletApi,
        db: WalletDatabase,
    ): WalletRepository = WalletRepositoryImpl(api, db)
}

// Generated: AppComponent::class.create()
```

## Bottom Sheets

### Voyager

```kotlin
BottomSheetNavigator { bottomSheetNavigator ->
    Navigator(HomeScreen())
}

// Open bottom sheet from anywhere
LocalBottomSheetNavigator.current.show(SendBottomSheet())
```

### Decompose

```kotlin
class DefaultRootComponent {
    private val sheetNav = SlotNavigation<SheetConfig>()

    val sheet = childSlot(
        source = sheetNav,
        serializer = SheetConfig.serializer(),
        handleBackButton = true,
    ) { config, ctx ->
        // sheet child
    }

    fun openSendSheet() { sheetNav.activate(SheetConfig.Send) }
}
```

```kotlin
@Composable
fun RootContent(component: RootComponent) {
    Box {
        Children(component.stack) { /* main */ }

        val sheet by component.sheet.subscribeAsState()
        sheet.child?.let { child ->
            ModalBottomSheet(onDismissRequest = component::onSheetDismiss) {
                // sheet content
            }
        }
    }
}
```

## Deep Linking

### Decompose Example

```kotlin
fun handleDeepLink(uri: String) {
    val parsed = Url(uri)
    when (parsed.host) {
        "wallet" -> {
            val id = parsed.encodedPath.removePrefix("/")
            nav.replaceAll(Config.Home, Config.WalletDetail(id))
        }
        "send" -> {
            val address = parsed.parameters["address"]
            nav.push(Config.Send(address))
        }
    }
}
```

iOS receives deep links via SceneDelegate / `onOpenURL` SwiftUI modifier — bridge to root component:

```swift
@StateObject var rootHolder = RootHolder()

ComposeView(component: rootHolder.root)
    .onOpenURL { url in
        rootHolder.root.handleDeepLink(uri: url.absoluteString)
    }
```

## Troubleshooting

| Issue | Fix |
|---|---|
| Screen state lost on rotation (Voyager) | Use `rememberScreenModel`, not `remember` |
| Decompose serializer error | Annotate Config sealed class hierarchy with `@Serializable` |
| Navigator scope leaks | Cancel `screenModelScope` / `coroutineScope` on dispose |
| iOS swipe-back doesn't work (Voyager) | Manual implementation via `Modifier.draggable` or use Decompose |
| Deep link opens wrong screen | Verify back stack reconstruction logic |
| Bottom sheet flickers on dismiss | Use `ModalBottomSheet` with proper `sheetState` management |
