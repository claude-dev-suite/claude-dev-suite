# Jetpack Compose — State & Effects Quick Reference

## State APIs

| API | Lifetime | Use case |
|---|---|---|
| `remember { mutableStateOf(...) }` | Composition | Local UI state (text field, toggle) |
| `rememberSaveable { mutableStateOf(...) }` | Survives config change & process death (limited) | Form fields, scroll position |
| `viewModel()` / `hiltViewModel()` | Across config changes | Screen state, business logic |
| `produceState` | Composition | Convert non-Compose source to State |
| `derivedStateOf` | Composition | Memoized derived values from State |
| `mutableStateListOf` / `mutableStateMapOf` | Composition | Observable collections |
| `snapshotFlow { }` | Composition | State → Flow conversion |

## ViewModel Patterns

### Single-source-of-truth state

```kotlin
data class WalletUiState(
    val isLoading: Boolean = false,
    val wallets: List<Wallet> = emptyList(),
    val error: String? = null,
)

@HiltViewModel
class WalletViewModel @Inject constructor(
    private val repo: WalletRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(WalletUiState())
    val state: StateFlow<WalletUiState> = _state.asStateFlow()

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            try {
                val wallets = repo.all()
                _state.update { it.copy(isLoading = false, wallets = wallets) }
            } catch (e: Throwable) {
                _state.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }
}
```

`MutableStateFlow.update { }` is atomic — safe under concurrent updates.

### One-shot events (snackbar, navigation)

```kotlin
sealed interface NavEvent {
    data class Open(val route: Any) : NavEvent
    data object Back : NavEvent
}

class WalletViewModel : ViewModel() {
    private val _events = Channel<NavEvent>(Channel.BUFFERED)
    val events: Flow<NavEvent> = _events.receiveAsFlow()

    fun openDetail(id: String) = viewModelScope.launch {
        _events.send(NavEvent.Open(WalletDetailRoute(id)))
    }
}

@Composable
fun WalletScreen(vm: WalletViewModel = hiltViewModel(), nav: NavController) {
    LaunchedEffect(vm) {
        vm.events.collect { event ->
            when (event) {
                is NavEvent.Open -> nav.navigate(event.route)
                NavEvent.Back -> nav.popBackStack()
            }
        }
    }
}
```

Use `Channel` (not `SharedFlow`) for one-shot events — guaranteed delivery, no replay confusion on config change.

## collectAsStateWithLifecycle

```kotlin
val state by viewModel.state.collectAsStateWithLifecycle()
```

Pauses upstream collection when lifecycle is below `STARTED` (i.e., screen in background). Saves battery, prevents wasted recomposition.

Without it (`collectAsState()`), the composable keeps collecting even when not visible — wasted work.

For initial value with lifecycle:

```kotlin
val state by viewModel.state.collectAsStateWithLifecycle(initialValue = UiState.Loading)
```

## Side Effect APIs

### LaunchedEffect

```kotlin
@Composable
fun AutoSave(text: String, onSave: suspend (String) -> Unit) {
    LaunchedEffect(text) {
        delay(500)              // debounce
        onSave(text)
    }
}
```

Cancels and restarts when key changes. `LaunchedEffect(Unit)` runs once (on first composition).

### DisposableEffect

```kotlin
@Composable
fun NetworkObserver(onChange: (Boolean) -> Unit) {
    val context = LocalContext.current
    DisposableEffect(context) {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { onChange(true) }
            override fun onLost(network: Network) { onChange(false) }
        }
        val cm = context.getSystemService(ConnectivityManager::class.java)
        cm.registerDefaultNetworkCallback(callback)

        onDispose {
            cm.unregisterNetworkCallback(callback)
        }
    }
}
```

Always pair `register` with `unregister` in `onDispose`. Otherwise, leak.

### LifecycleEventEffect / LifecycleResumeEffect / LifecycleStartEffect

```kotlin
@Composable
fun MyScreen() {
    LifecycleResumeEffect(Unit) {
        startTracking()
        onPauseOrDispose {
            stopTracking()
        }
    }

    LifecycleEventEffect(Lifecycle.Event.ON_STOP) {
        flushAnalytics()
    }
}
```

From `androidx.lifecycle:lifecycle-runtime-compose:2.8+`. Replaces manual `LocalLifecycleOwner.current.lifecycle.addObserver`.

### produceState

```kotlin
@Composable
fun BalanceState(walletId: String, repo: WalletRepository): State<Long?> =
    produceState<Long?>(initialValue = null, walletId, repo) {
        value = repo.getBalance(walletId)
    }

@Composable
fun BalanceText(walletId: String, repo: WalletRepository) {
    val balance by BalanceState(walletId, repo)
    Text(balance?.toString() ?: "...")
}
```

Useful for converting non-Compose sources (single suspend call) to State.

### derivedStateOf

```kotlin
val canSubmit by remember(amount, address) {
    derivedStateOf {
        amount.toLongOrNull()?.let { it > 0 } == true && address.isNotBlank()
    }
}
```

Recomputes only when `amount` or `address` changes (vs every recomposition). Reduces unnecessary recomposition of consumers.

### snapshotFlow

```kotlin
@Composable
fun ScrollPosition(scrollState: ScrollState) {
    LaunchedEffect(scrollState) {
        snapshotFlow { scrollState.value }
            .debounce(100)
            .collect { offset ->
                analytics.log("scroll: $offset")
            }
    }
}
```

Converts a `State<T>` into a `Flow<T>` that emits when value changes. Useful for analytics, animations driven by scroll, etc.

### rememberCoroutineScope

```kotlin
@Composable
fun ShareButton(text: String) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    Button(onClick = {
        scope.launch {
            val link = generateLink(text)
            shareLink(context, link)
        }
    }) { Text("Share") }
}
```

Bound to composable lifecycle — cancels when composable leaves composition. Use for event-handler-launched coroutines (not for ongoing work — that goes in ViewModel).

## SavedStateHandle Integration

For state that survives process death:

```kotlin
@HiltViewModel
class SearchViewModel @Inject constructor(
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {
    val query: StateFlow<String> = savedStateHandle.getStateFlow("query", "")

    fun setQuery(q: String) {
        savedStateHandle["query"] = q
    }
}
```

`getStateFlow` returns a `StateFlow` backed by `SavedStateHandle` — survives process death. Combine with `rememberSaveable` for lightweight UI state, `SavedStateHandle` for ViewModel-owned state.

## State Hoisting vs ViewModel

```kotlin
// Stateful composable (own state) — fine for self-contained widgets
@Composable
fun ExpandableCard(content: String) {
    var expanded by remember { mutableStateOf(false) }
    Card(onClick = { expanded = !expanded }) {
        Column { /* ... */ }
    }
}

// Stateless composable (hoisted state) — preferred for screens
@Composable
fun ExpandableCard(
    expanded: Boolean,
    onToggle: () -> Unit,
    content: String,
) {
    Card(onClick = onToggle) {
        Column { /* ... */ }
    }
}
```

Default to stateless + hoisted state. Use stateful only for internal-detail widgets that no parent needs to observe.

## Pitfalls

| Pitfall | Fix |
|---|---|
| Reading `state.value` during composition | Won't trigger recomposition — use `by state` or `state.collectAsState()` |
| `LaunchedEffect(Unit) { }` for re-runnable work | Use proper key or `rememberCoroutineScope` + button trigger |
| Mutating `mutableStateOf<List>` via `add()` | List instance unchanged — use `mutableStateListOf` or assign new list |
| Heavy work in `Composable` body | Move to `LaunchedEffect`, ViewModel, or `remember` |
| `viewModel<MyVM>()` in nested composable | Returns parent activity-scoped VM — use `hiltViewModel()` for nav-scoped |
| `produceState` with no key | Won't restart on dependency change — pass keys |
| Forgetting `onDispose` in `DisposableEffect` | Leak |
| `BackHandler { }` always-on | Disable via `enabled` parameter when not needed |
| Multiple `LaunchedEffect` collecting same flow | Combine into one effect |
