---
name: turbine
description: |
  Turbine — small Kotlin testing library for kotlinx.coroutines Flows. Provides
  ergonomic API to test Flow emissions deterministically: awaitItem, expectMostRecentItem,
  awaitComplete, awaitError. Works with StateFlow, SharedFlow, Channel-backed flows,
  combine/map/debounce. KMP-friendly.

  USE WHEN: user mentions "Turbine", "app.cash.turbine", ".test {}",
  "awaitItem", "Flow testing", "StateFlow test", "SharedFlow test",
  "expectMostRecentItem", "cancelAndIgnoreRemainingEvents"

  DO NOT USE FOR: Mobile E2E - use `testing/maestro`
  DO NOT USE FOR: Compose snapshot - use `testing/compose-snapshot`
  DO NOT USE FOR: Generic Kotlin testing - use `testing/kotest`
  DO NOT USE FOR: Suspend function (non-Flow) testing - use `kotlinx-coroutines-test` directly
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Turbine — Flow Testing

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `turbine`.

## Why Turbine

Testing `Flow` is awkward without a helper:
- `Flow.toList()` works for finite flows but never returns for hot/infinite ones
- Manual `collect { }` in test launches coroutines that race with assertions
- StateFlow/SharedFlow have replay semantics that confuse test setup

Turbine gives a deterministic, suspend-friendly API:

```kotlin
flow.test {
    awaitItem() shouldBe expected1
    awaitItem() shouldBe expected2
    cancelAndIgnoreRemainingEvents()
}
```

Used by Cash App, Square, JetBrains tooling teams. KMP-compatible.

## Setup

```kotlin
// build.gradle.kts (or KMP commonTest)
testImplementation("app.cash.turbine:turbine:1.2.0")
testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.0")
```

```kotlin
// KMP
sourceSets.commonTest.dependencies {
    implementation("app.cash.turbine:turbine:1.2.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.0")
}
```

## Basic Usage

```kotlin
import app.cash.turbine.test
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

class FlowTest {
    @Test fun `emits 3 items`() = runTest {
        flowOf(1, 2, 3).test {
            assertEquals(1, awaitItem())
            assertEquals(2, awaitItem())
            assertEquals(3, awaitItem())
            awaitComplete()
        }
    }
}
```

`test { }` collects the flow within an isolated coroutine and exposes a DSL with assertion helpers.

## API Reference

| Method | Purpose |
|---|---|
| `awaitItem(): T` | Wait for next emission, return it |
| `awaitItem(timeout: Duration)` | With custom timeout |
| `awaitComplete()` | Assert flow completes (no error) |
| `awaitError(): Throwable` | Wait for terminal error and return it |
| `expectNoEvents()` | Assert no pending emissions / completion / error |
| `expectMostRecentItem()` | Drain all pending emissions, return latest |
| `cancel()` | Cancel collection and verify no untested events |
| `cancelAndIgnoreRemainingEvents()` | Cancel and discard remaining emissions |
| `cancelAndConsumeRemainingEvents(): List<Event<T>>` | Cancel and return remaining as list |
| `skipItems(count: Int)` | Discard N items |

## StateFlow Patterns

StateFlow always replays its current value to new collectors → first `awaitItem()` is the **initial value**.

```kotlin
@Test fun `state updates correctly`() = runTest {
    val state = MutableStateFlow(0)

    state.test {
        assertEquals(0, awaitItem())            // initial
        state.value = 1
        assertEquals(1, awaitItem())
        state.value = 2
        assertEquals(2, awaitItem())
        cancelAndIgnoreRemainingEvents()
    }
}
```

For ViewModel state flows:

```kotlin
@Test fun `loads wallets and updates state`() = runTest {
    val viewModel = WalletViewModel(repo = fakeRepo)

    viewModel.state.test {
        // Initial state
        val initial = awaitItem()
        initial.isLoading shouldBe true
        initial.wallets shouldBe emptyList()

        // After load completes
        val loaded = awaitItem()
        loaded.isLoading shouldBe false
        loaded.wallets shouldHaveSize 3

        cancelAndIgnoreRemainingEvents()
    }
}
```

## SharedFlow / Events Pattern

```kotlin
@Test fun `emits navigation event on save`() = runTest {
    val viewModel = WalletViewModel()

    viewModel.events.test {
        viewModel.save()
        val event = awaitItem()
        event.shouldBeInstanceOf<NavEvent.PopBack>()
        cancelAndIgnoreRemainingEvents()
    }
}
```

For replay-cache SharedFlow, you can use `expectMostRecentItem()`:

```kotlin
@Test fun `most recent value`() = runTest {
    val flow = MutableSharedFlow<Int>(replay = 1)
    flow.emit(1)
    flow.emit(2)
    flow.emit(3)

    flow.test {
        // 3 was the last emission; replay buffer of 1 holds 3
        assertEquals(3, expectMostRecentItem())
        cancelAndIgnoreRemainingEvents()
    }
}
```

## Combine / Map / Filter

```kotlin
@Test fun `combine emits when either source changes`() = runTest {
    val a = MutableStateFlow("foo")
    val b = MutableStateFlow(1)

    combine(a, b) { x, y -> "$x:$y" }.test {
        assertEquals("foo:1", awaitItem())

        a.value = "bar"
        assertEquals("bar:1", awaitItem())

        b.value = 2
        assertEquals("bar:2", awaitItem())

        cancelAndIgnoreRemainingEvents()
    }
}
```

## Debounce / FlatMapLatest (Virtual Time)

`runTest` provides virtual time. Use `advanceTimeBy` and `advanceUntilIdle`:

```kotlin
@Test fun `debounce filters fast input`() = runTest {
    val source = MutableSharedFlow<String>()

    source.debounce(300).test {
        source.emit("a"); advanceTimeBy(100)
        source.emit("ab"); advanceTimeBy(100)
        source.emit("abc"); advanceTimeBy(400)

        assertEquals("abc", awaitItem())
        cancelAndIgnoreRemainingEvents()
    }
}

@Test fun `flatMapLatest cancels previous`() = runTest {
    val query = MutableStateFlow("")

    query
        .debounce(300)
        .flatMapLatest { q -> searchApi(q) }
        .test {
            query.value = "btc"
            advanceTimeBy(300)
            val first = awaitItem()
            first shouldContain "btc"

            query.value = "eth"
            advanceTimeBy(300)
            val second = awaitItem()
            second shouldContain "eth"

            cancelAndIgnoreRemainingEvents()
        }
}
```

## Errors

```kotlin
@Test fun `propagates upstream error`() = runTest {
    flow<Int> {
        emit(1)
        throw IllegalStateException("boom")
    }.test {
        assertEquals(1, awaitItem())
        val error = awaitError()
        error.shouldBeInstanceOf<IllegalStateException>()
        error.message shouldBe "boom"
    }
}

@Test fun `handles error and continues`() = runTest {
    val source = flow {
        emit(1)
        throw IOException()
    }

    source.catch { emit(-1) }.test {
        assertEquals(1, awaitItem())
        assertEquals(-1, awaitItem())
        awaitComplete()
    }
}
```

## Multiple Flows in One Test

```kotlin
@Test fun `multiple flow assertions`() = runTest {
    val state = MutableStateFlow(0)
    val events = MutableSharedFlow<String>()

    turbineScope {
        val stateTurbine = state.testIn(backgroundScope)
        val eventsTurbine = events.testIn(backgroundScope)

        assertEquals(0, stateTurbine.awaitItem())

        state.value = 1
        events.emit("changed")

        assertEquals(1, stateTurbine.awaitItem())
        assertEquals("changed", eventsTurbine.awaitItem())

        stateTurbine.cancelAndIgnoreRemainingEvents()
        eventsTurbine.cancelAndIgnoreRemainingEvents()
    }
}
```

## Custom Timeouts

Default timeout: 1 second per `awaitItem()`. For slow operations:

```kotlin
flow.test(timeout = 10.seconds) {
    awaitItem() shouldBe expected
}

// Per-call
awaitItem(timeout = 5.seconds)
```

## ExpectNoEvents / VerifyEmpty

Useful to confirm a flow does NOT emit during a window:

```kotlin
@Test fun `does not emit when input below threshold`() = runTest {
    val flow = MutableStateFlow(0)

    flow.filter { it > 10 }.test {
        flow.value = 5
        flow.value = 7
        expectNoEvents()                       // confirms no emissions

        flow.value = 11
        assertEquals(11, awaitItem())

        cancelAndIgnoreRemainingEvents()
    }
}
```

## Patterns for ViewModel Testing

### MVI / Single State

```kotlin
class HomeViewModelTest {
    private val testDispatcher = StandardTestDispatcher()

    @BeforeTest fun setup() {
        Dispatchers.setMain(testDispatcher)
    }

    @AfterTest fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test fun `load updates state correctly`() = runTest {
        val repo = FakeRepo(wallets = listOf(testWallet()))
        val viewModel = HomeViewModel(repo)

        viewModel.state.test {
            // Initial
            awaitItem().wallets shouldBe emptyList()

            viewModel.load()

            // Loading
            val loading = awaitItem()
            loading.isLoading shouldBe true

            // Settled
            val loaded = awaitItem()
            loaded.isLoading shouldBe false
            loaded.wallets shouldHaveSize 1

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

### Side-effect events

```kotlin
@Test fun `emits navigation on click`() = runTest {
    val viewModel = HomeViewModel(repo)

    viewModel.events.test {
        viewModel.openWallet("abc")
        val event = awaitItem()
        event shouldBe NavEvent.Open(WalletDetailRoute("abc"))
        cancelAndIgnoreRemainingEvents()
    }
}
```

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Using `flow.toList()` on hot flow | Never returns | Use `flow.test { }` |
| Forgetting `cancelAndIgnoreRemainingEvents()` | Test fails with "untested events" | Always cancel at end |
| Asserting via outer-scope variables instead of `awaitItem()` | Race conditions | Use awaitItem inside test block |
| `runBlocking` instead of `runTest` | No virtual time | `runTest` for coroutines |
| Forgetting `Dispatchers.setMain` for ViewModelScope | Coroutines never run | Setup test dispatcher |
| Asserting `state.value` directly without test {} | Misses transitional states | Use Turbine to capture all emissions |
| Missing `advanceTimeBy` for time-based operators | Stuck waiting | Drive virtual time forward |
| Putting `delay(real_ms)` in test | Slow + flaky | Use virtual time |
| `awaitItem()` after `awaitComplete()` | Throws | Order matters — items first, then complete |
| Multiple flows without `turbineScope` | One blocks the other | Use `testIn(scope)` for parallel testing |

## KMP / Multiplatform

Turbine works in `commonTest`:

```kotlin
// shared/src/commonTest/kotlin/WalletViewModelTest.kt
import app.cash.turbine.test
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

class WalletViewModelTest {
    @Test fun `loads wallets`() = runTest {
        val viewModel = WalletViewModel(FakeRepo())

        viewModel.state.test {
            assertEquals(UiState.Loading, awaitItem())

            viewModel.load()
            advanceUntilIdle()

            val loaded = awaitItem() as UiState.Success
            loaded.wallets shouldHaveSize 1

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

Runs on JVM, iOS, Desktop targets:

```bash
./gradlew :shared:jvmTest
./gradlew :shared:iosSimulatorArm64Test
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Expected event.. but got nothing within 1000ms` | Slow operation, no virtual time | `runTest` + `advanceTimeBy` / longer timeout |
| `Unconsumed events found` | Flow emitted more than asserted | `cancelAndIgnoreRemainingEvents()` |
| Test passes locally, fails in CI | Real Dispatchers.Main | `Dispatchers.setMain(testDispatcher)` in setup |
| `awaitItem()` returns initial state instead of update | StateFlow replays current value | Either await initial then update, or use SharedFlow |
| Flow never completes | Hot flow (StateFlow/SharedFlow) | They never `awaitComplete` — always `cancelAndIgnoreRemainingEvents()` |
| `combine` emits twice on setup | Both sources have replay | Filter initial duplicate or use distinctUntilChanged |
| `flatMapLatest` doesn't cancel previous in test | Missing time advance between emissions | `advanceTimeBy` to trigger debounce + new branch |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Mobile E2E | `testing/maestro` |
| Compose snapshot | `testing/compose-snapshot` |
| Generic Kotlin tests | `testing/kotest` |
| Pure suspend (no Flow) | `kotlinx-coroutines-test` `runTest` |
| Java reactive (RxJava) | RxJava test schedulers |
