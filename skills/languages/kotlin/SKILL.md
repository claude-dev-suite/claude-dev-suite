---
name: kotlin
description: |
  Kotlin language fundamentals. Covers null safety, coroutines, flow, sealed
  classes, data classes, scope functions, and Kotlin 2.x features (K2 compiler,
  context parameters). Use for Kotlin/JVM, Kotlin/Native, Kotlin/JS work.

  USE WHEN: user mentions "Kotlin", "coroutines", "suspend", "Flow", "sealed class",
  "data class", "scope functions", "K2 compiler", "ksp", "Kotlin 2.x"

  DO NOT USE FOR: Kotlin Multiplatform setup - use `mobile/kotlin-multiplatform`
  DO NOT USE FOR: Compose UI - use `frontend-frameworks/compose-multiplatform`
  DO NOT USE FOR: Spring Boot Kotlin - use `spring-boot` framework skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Kotlin Core Knowledge

> **Reference**: [coroutines.md](quick-ref/coroutines.md) for structured concurrency, Flow, channels. [advanced.md](quick-ref/advanced.md) for sealed hierarchies, generics variance, context parameters, KSP.
>
> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `kotlin`.

## Null Safety

```kotlin
var name: String = "Alice"        // Non-nullable
var maybe: String? = null         // Nullable

val len = maybe?.length ?: 0      // Safe call + Elvis
val forced = maybe!!.length       // Throws NPE if null — avoid

// Smart casts
fun describe(x: Any?): String = when (x) {
    is String -> "String of length ${x.length}"  // smart-cast to String
    null -> "null"
    else -> x.toString()
}
```

## Data Classes

```kotlin
data class User(
    val id: Long,
    val name: String,
    val email: String,
    val active: Boolean = true,
)

val u = User(1, "Alice", "alice@example.com")
val updated = u.copy(active = false)
val (id, name) = u   // destructuring
```

Auto-generates `equals`, `hashCode`, `toString`, `copy`, `componentN`. Avoid for entities with identity (use regular class).

## Sealed Classes & When

```kotlin
sealed interface Result<out T> {
    data class Success<T>(val value: T) : Result<T>
    data class Error(val cause: Throwable) : Result<Nothing>
    data object Loading : Result<Nothing>
}

fun <T> handle(r: Result<T>): String = when (r) {
    is Result.Success -> "ok: ${r.value}"
    is Result.Error -> "error: ${r.cause.message}"
    Result.Loading -> "loading"
    // exhaustive — no else needed
}
```

`sealed` confines hierarchy to same module/package. Prefer `sealed interface` over `sealed class` when no shared state.

## Scope Functions — When to Use Which

| Function | Receiver | Returns | Use case |
|---|---|---|---|
| `let` | `it` | block result | Null-safe transform: `user?.let { send(it) }` |
| `run` | `this` | block result | Compute on object: `config.run { host + port }` |
| `apply` | `this` | receiver | Builder-style init: `Intent().apply { setAction(...) }` |
| `also` | `it` | receiver | Side effect (log): `result.also { log(it) }` |
| `with` | `this` | block result | Group calls on object (not chained) |

```kotlin
val view = TextView(context).apply {
    text = "Hello"
    textSize = 16f
}.also { log("created: $it") }
```

## Coroutines — Essentials

```kotlin
import kotlinx.coroutines.*

suspend fun fetchUser(id: Long): User {
    delay(100)            // suspend, doesn't block thread
    return User(id, "...", "...")
}

fun main() = runBlocking {
    val user = async { fetchUser(1) }
    val posts = async { fetchPosts(1) }
    println("${user.await()} -> ${posts.await()}")
}
```

**Rules**:
- `suspend` functions can only be called from coroutine or another `suspend`
- Use `withContext(Dispatchers.IO)` for blocking I/O
- Use `coroutineScope { }` for parent-child cancellation propagation
- Never use `GlobalScope` in production

See [coroutines.md](quick-ref/coroutines.md) for structured concurrency, Flow, channels, exception handling.

## Flow (Cold Streams)

```kotlin
fun ticker(): Flow<Int> = flow {
    var i = 0
    while (true) {
        emit(i++)
        delay(1000)
    }
}

// Collect
viewModelScope.launch {
    ticker()
        .map { it * 2 }
        .filter { it % 4 == 0 }
        .collect { println(it) }
}
```

`StateFlow` (hot, single-value) for UI state. `SharedFlow` for one-shot events.

## Extension Functions

```kotlin
fun String.toSlug(): String =
    this.lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-')

"Hello World!".toSlug()   // "hello-world"
```

Resolved statically. Don't override; can't access private members of receiver.

## Generics & Variance

```kotlin
class Box<out T>(val value: T)         // covariant: Box<Cat> is Box<Animal>
class Sink<in T> { fun put(v: T) {} }  // contravariant: Sink<Animal> is Sink<Cat>

inline fun <reified T> isType(x: Any) = x is T  // reified: T available at runtime
```

## Idiomatic Patterns

```kotlin
// Single-expression functions
fun double(x: Int) = x * 2

// Default + named args (replace builders)
fun connect(host: String, port: Int = 80, secure: Boolean = false) {}
connect(host = "localhost", secure = true)

// Destructuring maps
for ((key, value) in map) { /* ... */ }

// require / check / error for preconditions
fun divide(a: Int, b: Int): Int {
    require(b != 0) { "b must be non-zero" }
    return a / b
}
```

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| `!!` everywhere | NPE risk | Safe call `?.` + Elvis `?:` |
| `runBlocking` in suspend chain | Blocks thread | Compose with `coroutineScope` |
| `GlobalScope.launch` | No cancellation | Use bound scope (viewModelScope, lifecycleScope) |
| `lateinit` on nullable types | Compile error | Use `var x: T? = null` |
| Catching `Throwable` in coroutine | Hides cancellation | Catch `Exception`, rethrow `CancellationException` |
| Mutable `var` shared across coroutines | Race conditions | `Mutex`, `Channel`, or `StateFlow` |
| `companion object` for static helpers | Slow JVM access | Use top-level functions |
| `Object.toString()` for logging | No structure | Use `kotlinx.serialization` or manual |

## Build & Tooling

```kotlin
// build.gradle.kts
plugins {
    kotlin("jvm") version "2.2.0"
    kotlin("plugin.serialization") version "2.2.0"
    id("com.google.devtools.ksp") version "2.2.0-1.0.x"
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.0")
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_21)
        freeCompilerArgs.add("-Xcontext-parameters")  // Kotlin 2.2+
    }
}
```

## Kotlin 2.x Highlights

- **K2 compiler** stable (default in 2.x): faster, better diagnostics
- **Context parameters** (replaces deprecated context receivers)
- **Stable `data object`** for singletons in sealed hierarchies
- **`expect`/`actual` classes** stable (multiplatform)
- **`@OptIn` annotations** for preview APIs

## Testing

```kotlin
// Kotest (preferred for KMP)
class UserTest : StringSpec({
    "valid email" {
        User(1, "x", "x@y.z").email shouldContain "@"
    }
})

// JUnit 5 + kotest matchers
@Test
fun `coroutine result`() = runTest {
    val result = fetchUser(1)
    result.id shouldBe 1L
}
```

For coroutine testing use `kotlinx-coroutines-test` (`runTest`, `TestDispatcher`, virtual time).

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| KMP gradle setup, expect/actual | `mobile/kotlin-multiplatform` |
| Compose UI components | `frontend-frameworks/compose-multiplatform` |
| Android-specific (Activity, Lifecycle) | `mobile/jetpack-compose` |
| Spring Boot Kotlin | `spring-boot` skill |
| Ktor server | Ktor-specific skill |
