# Kotlin Advanced Patterns

## Generics Variance Deep Dive

```kotlin
// Use-site variance (less common)
fun copy(from: Array<out Any>, to: Array<Any>) { /* read from, write to */ }

// Star projection
fun printAll(list: List<*>) {
    list.forEach { println(it) }   // it: Any?
}

// Type projection vs generics
class Repo<T : Entity> {
    fun findAll(): List<T> = ...
}
```

`out` (covariance) → producer (read-only). `in` (contravariance) → consumer (write-only). Mnemonic: "PECS" — Producer Extends, Consumer Super.

## Sealed Hierarchies for State Modeling

```kotlin
sealed interface NetworkResult<out T> {
    data class Success<T>(val data: T, val source: Source) : NetworkResult<T>
    sealed interface Failure : NetworkResult<Nothing> {
        data class Network(val cause: IOException) : Failure
        data class Server(val code: Int, val body: String) : Failure
        data object Unauthorized : Failure
    }
}

fun <T> handle(result: NetworkResult<T>): String = when (result) {
    is NetworkResult.Success -> "ok"
    is NetworkResult.Failure.Network -> "retry?"
    is NetworkResult.Failure.Server -> "server ${result.code}"
    NetworkResult.Failure.Unauthorized -> "login"
}
```

Nested sealed interfaces compose well; exhaustiveness checks across the whole tree.

## Inline Functions & Reified Generics

```kotlin
inline fun <reified T> Bundle.getOrNull(key: String): T? =
    when (T::class) {
        Int::class -> getInt(key) as T?
        String::class -> getString(key) as T?
        else -> null
    }

val name: String? = bundle.getOrNull<String>("name")
```

`inline` substitutes function body at call site → no lambda allocation, plus enables `reified` (type info available at runtime).

Use when:
- Higher-order function with lambda parameter (common for DSLs)
- Need runtime access to generic type via `reified`

Avoid for large functions (code bloat).

## Context Parameters (Kotlin 2.2+)

Replaces context receivers (deprecated). Pass implicit dependencies through scope.

```kotlin
context(_: Logger)
fun processOrder(order: Order) {
    log.info("processing $order")  // Logger available implicitly
    // ...
}

// Call site
context(consoleLogger) {
    processOrder(myOrder)
}
```

Use for ambient services (logger, transaction, security context). Don't abuse — explicit params are usually clearer.

## DSL Building

```kotlin
class HtmlBuilder {
    private val children = mutableListOf<String>()

    fun body(block: BodyBuilder.() -> Unit) {
        val builder = BodyBuilder()
        builder.block()
        children.add("<body>${builder.render()}</body>")
    }

    fun render() = children.joinToString("")
}

@DslMarker annotation class HtmlDsl

@HtmlDsl class BodyBuilder {
    private val items = mutableListOf<String>()
    fun p(text: String) { items.add("<p>$text</p>") }
    fun render() = items.joinToString("")
}

fun html(block: HtmlBuilder.() -> Unit): String =
    HtmlBuilder().apply(block).render()

// Usage
val page = html {
    body {
        p("Hello")
        p("World")
    }
}
```

`@DslMarker` prevents nested receivers from leaking (no calling outer `body { }` from inside `p`).

## Delegation

### Class Delegation

```kotlin
interface Repository<T> {
    fun findById(id: Long): T?
    fun save(entity: T)
}

class CachedRepository<T>(
    private val delegate: Repository<T>,
    private val cache: Cache<Long, T>,
) : Repository<T> by delegate {
    // Inherits all delegate methods, override selectively
    override fun findById(id: Long): T? =
        cache.get(id) ?: delegate.findById(id)?.also { cache.put(id, it) }
}
```

### Property Delegation

```kotlin
import kotlin.properties.Delegates

class User {
    var name: String by Delegates.observable("") { _, old, new ->
        println("name: $old -> $new")
    }

    val expensive: String by lazy {
        computeExpensiveValue()  // computed once on first access
    }
}

// Custom delegate
class PreferenceDelegate(private val key: String, private val default: String) {
    operator fun getValue(thisRef: Any?, prop: KProperty<*>): String =
        prefs.getString(key, default)

    operator fun setValue(thisRef: Any?, prop: KProperty<*>, value: String) {
        prefs.edit().putString(key, value).apply()
    }
}

class Settings {
    var theme: String by PreferenceDelegate("theme", "light")
}
```

## KSP (Kotlin Symbol Processing)

Modern alternative to KAPT — 2-3x faster. Most annotation processors (Room, Moshi, Hilt-android, kotlinx-serialization) support KSP.

```kotlin
// build.gradle.kts
plugins {
    id("com.google.devtools.ksp") version "2.2.0-1.0.x"
}

dependencies {
    implementation("androidx.room:room-runtime:2.7.0")
    ksp("androidx.room:room-compiler:2.7.0")  // ksp instead of kapt
}
```

Custom processors implement `SymbolProcessor` — generate code via `CodeGenerator`. Useful for KMP code-gen (UniFFI bindings, model converters).

## Operator Overloading

```kotlin
data class Vec2(val x: Double, val y: Double) {
    operator fun plus(other: Vec2) = Vec2(x + other.x, y + other.y)
    operator fun times(scalar: Double) = Vec2(x * scalar, y * scalar)
    operator fun unaryMinus() = Vec2(-x, -y)
    operator fun get(i: Int) = if (i == 0) x else y
}

val a = Vec2(1.0, 2.0)
val b = Vec2(3.0, 4.0)
val c = a + b * 2.0          // Vec2(7.0, 10.0)
val first = c[0]
```

Overload only when semantics are obvious (math types, collections). Don't be cute.

## Inline Value Classes

```kotlin
@JvmInline
value class UserId(val value: Long) {
    init { require(value > 0) }
}

@JvmInline
value class Email(val value: String) {
    init { require("@" in value) }
}

fun sendEmail(to: Email, from: Email) { /* ... */ }
// Compile error: sendEmail("a@b.c", "d@e.f")  — must wrap in Email
```

Zero runtime overhead (compiled to underlying type). Great for type-safe IDs without boxing cost.

## Multiplatform expect/actual

```kotlin
// commonMain
expect class Platform() {
    val name: String
    fun openUrl(url: String)
}

// androidMain
actual class Platform {
    actual val name: String = "Android ${Build.VERSION.SDK_INT}"
    actual fun openUrl(url: String) {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }
}

// iosMain
actual class Platform {
    actual val name: String = "iOS ${UIDevice.currentDevice.systemVersion}"
    actual fun openUrl(url: String) {
        UIApplication.sharedApplication.openURL(NSURL(string = url))
    }
}
```

See `mobile/kotlin-multiplatform` skill for full KMP setup.

## Performance Tips

| Tip | Why |
|---|---|
| Use `@JvmInline` value classes for IDs | No allocation cost |
| Prefer `Sequence` over `List` for chained ops on large data | Lazy evaluation, no intermediate collections |
| `@JvmStatic` on companion object methods used from Java | Avoids `Companion.INSTANCE.method()` indirection |
| `@JvmField` for public companion properties used from Java | Avoids generated getter |
| `inline` for high-frequency higher-order functions | No lambda allocation |
| Avoid `companion object` for utility functions | Top-level functions are faster (no INSTANCE field) |
| `buildList { }` / `buildMap { }` builders | Single allocation, immutable result |
| `toTypedArray()` only at JVM interop boundary | Otherwise `List` is more flexible |

## Annotations Cheatsheet

| Annotation | Purpose |
|---|---|
| `@JvmStatic` | Generate static method on companion |
| `@JvmField` | Expose property as field (no getter/setter) |
| `@JvmName("...")` | Rename for Java consumers |
| `@JvmOverloads` | Generate overloads for default args |
| `@Throws(IOException::class)` | Declare checked exceptions for Java |
| `@OptIn(ExperimentalApi::class)` | Acknowledge experimental API |
| `@Suppress("...")` | Disable specific lint warnings |
| `@JvmInline` | Inline value class (replaces `@JvmInline value class`) |
| `@DslMarker` | Scope DSL receivers |
