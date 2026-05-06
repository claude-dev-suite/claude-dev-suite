# Kotlin Coroutines — Quick Reference

## Structured Concurrency

A coroutine launched in a scope cannot outlive its parent. Cancellation propagates downward; uncaught exceptions propagate upward (cancelling siblings).

```kotlin
suspend fun fetchAll(): Pair<User, List<Post>> = coroutineScope {
    val user = async { fetchUser() }
    val posts = async { fetchPosts() }
    user.await() to posts.await()
}
// If fetchUser throws, fetchPosts is cancelled and exception propagates.
```

`supervisorScope` isolates failures: a child failure does not cancel siblings.

## Dispatchers

| Dispatcher | Use for |
|---|---|
| `Dispatchers.Default` | CPU-intensive (JSON parsing, sorting); pool sized to CPU cores |
| `Dispatchers.IO` | Blocking I/O (file, network sync APIs); large pool |
| `Dispatchers.Main` | UI thread (Android, Swing) |
| `Dispatchers.Unconfined` | Avoid in production — runs in caller thread until first suspension |

```kotlin
suspend fun loadFile(): String = withContext(Dispatchers.IO) {
    File("data.txt").readText()  // blocking, ok on IO
}
```

## Cancellation

Cancellation is cooperative — suspend functions check `isActive` automatically. For tight loops, call `ensureActive()` or `yield()`.

```kotlin
suspend fun process(items: List<Item>) {
    for (item in items) {
        ensureActive()        // throw CancellationException if cancelled
        heavyWork(item)
    }
}

// Custom cleanup
val job = launch {
    try {
        doWork()
    } finally {
        withContext(NonCancellable) {
            cleanup()         // run even during cancellation
        }
    }
}
```

`CancellationException` is special — never wrap or swallow. Catch `Exception` first, rethrow `CancellationException`, then handle others.

```kotlin
try {
    risky()
} catch (e: CancellationException) {
    throw e
} catch (e: Exception) {
    handleError(e)
}
```

## Flow

### Cold vs Hot

- **Flow**: cold, re-runs on each `collect`
- **StateFlow**: hot, holds last value, conflates updates
- **SharedFlow**: hot, configurable replay/buffer, no initial value

```kotlin
class UserViewModel : ViewModel() {
    private val _state = MutableStateFlow(UiState.Loading)
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            _state.value = UiState.Success(fetchUser())
        }
    }
}
```

### Operators

```kotlin
flow {
    emit(1); emit(2); emit(3)
}
    .map { it * 2 }                    // 2, 4, 6
    .filter { it > 2 }                  // 4, 6
    .onEach { log("emitted: $it") }     // side effect, doesn't transform
    .catch { e -> emit(-1) }            // upstream errors only
    .flowOn(Dispatchers.Default)        // run upstream on Default
    .collect { println(it) }            // terminal
```

### combine / zip / merge

```kotlin
val authState: Flow<Auth> = ...
val prefs: Flow<Prefs> = ...

combine(authState, prefs) { auth, prefs -> Screen(auth, prefs) }
    .collect { render(it) }
// Re-emits whenever EITHER source emits, with latest values from each.
```

### debounce / throttle / sample

```kotlin
searchInput
    .debounce(300)              // wait for 300ms of silence
    .distinctUntilChanged()
    .flatMapLatest { query -> searchApi(query) }
    .collect { showResults(it) }
```

`flatMapLatest` cancels previous inner flow when new value arrives — perfect for search.

## Channels (Hot, One-Shot)

```kotlin
val events = Channel<Event>(Channel.BUFFERED)

launch {
    events.send(Event.Click)
}

launch {
    for (event in events) {
        handle(event)
    }
}
```

For one-shot UI events (snackbar, navigation) prefer `Channel` over `SharedFlow` — guaranteed delivery, no replay issues on config change.

## Exception Handling

```kotlin
val handler = CoroutineExceptionHandler { _, e ->
    log.error("Uncaught: $e")
}

// Top-level scope only
val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default + handler)

scope.launch {
    throw RuntimeException("boom")  // routed to handler
}
```

`CoroutineExceptionHandler` only catches uncaught exceptions in `launch` (root), NOT in `async` (which throws on `await`).

## Testing

```kotlin
@Test
fun `state updates on success`() = runTest {
    val vm = UserViewModel()
    advanceUntilIdle()              // run all pending coroutines
    assertEquals(UiState.Success, vm.state.value)
}

// TestDispatcher + virtual time
@Test
fun `debounce filters fast input`() = runTest {
    val flow = MutableSharedFlow<String>()
    val results = mutableListOf<String>()

    val job = launch {
        flow.debounce(300).toList(results)
    }

    flow.emit("a"); advanceTimeBy(100)
    flow.emit("ab"); advanceTimeBy(100)
    flow.emit("abc"); advanceTimeBy(400)

    assertEquals(listOf("abc"), results)
    job.cancel()
}
```

## Common Pitfalls

| Pitfall | Fix |
|---|---|
| `runBlocking` in production code | Use proper coroutine scope |
| Forgetting `withContext` for blocking calls | Wrap in `Dispatchers.IO` |
| `GlobalScope.launch` | Use lifecycle-bound scope |
| Catching `CancellationException` | Always rethrow |
| Heavy work in `flow { }` builder | Move to `flowOn(Default)` |
| Sharing mutable state across coroutines | Use `Mutex`, `StateFlow`, `Channel` |
| `Job()` instead of `SupervisorJob()` for parent | One child fails → all siblings cancel |
| `collect { launch { ... } }` | Use `flatMapLatest` or `onEach` |
