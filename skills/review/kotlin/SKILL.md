---
name: kotlin-review
description: |
  Reviewing Kotlin code - what to flag, and what the compiler, detekt and ktlint already flag for you

  USE WHEN: you are reviewing, critiquing or auditing existing Kotlin code - a
  "code review", a "review" of a .kt file, a diff, a PR or a pull request;
  deciding what to comment on in Kotlin; avoiding false positives on Kotlin code

  DO NOT USE FOR: writing, explaining or learning Kotlin - use
  `languages/kotlin`; anything the compiler, detekt or ktlint already reports
  (this skill lists those so you can stay silent about them); Android framework
  specifics - use the Android skills; Spring specifics - use the Spring skills
allowed-tools: Read, Grep, Glob
---
# Reviewing Kotlin

A reviewer's leverage is what the toolchain cannot say. Kotlin's compiler closes
the single largest hole in Java — null — so the findings that remain are mostly
about the **two places its guarantees stop**: the boundary with Java, and
structured concurrency.

The snippets are fragments cut down to the defect, not runnable programs.

## Already covered - do not spend review on it

| Defect | Reported by |
|---|---|
| Dereferencing a nullable without a check | the compiler |
| Non-exhaustive `when` used as an expression | the compiler |
| Unused variable, unreachable code | the compiler |
| Unused import, formatting, naming | ktlint |
| Long method, high complexity, magic number | detekt — **only if detekt runs** |
| `!!` usage | detekt `UnsafeCallOnNullableType` — **opt-in, not in the default ruleset** |
| Swallowed exception (`catch { }` empty) | detekt `SwallowedException`, `EmptyCatchBlock` |
| `println` left in production code | detekt `ForbiddenMethodCall` if configured |

Kotlin projects vary more than most in whether detekt runs at all. Check
`build.gradle.kts` for the plugin and for `detekt.yml`, because the `!!` and
swallowed-exception rows flip sides depending on it.

> **The table above dates; the tools do not.** Verify a default set with
> `mcp__documentation__fetch_docs` on technology `kotlin-quality` — topics `detekt-potential-bugs`, `detekt-configuration`, `detekt-suppressing`.
> Those entries point at the indexes the tool authors maintain, so they follow
> the version the project actually pins rather than the one this skill was
> written against.

## The checks that earn their place

### A platform type from Java, trusted as non-null

```kotlin
val name = javaService.getName()   // type is String!, not String
name.length                        // NPE if Java returned null
```

**When you see it**: any value coming from Java or a Java-based library without
`@Nullable`/`@NotNull` annotations — JPA entities, Jackson-deserialised objects,
older SDKs.

**Ask**: is the Java side annotated? A platform type (`String!`) opts *out* of
null checking: the compiler accepts both nullable and non-null use, so Kotlin's
central guarantee simply does not apply at this line. Declaring the local
explicitly as `String?` restores it.

### A coroutine launched on a scope that outlives its work

```kotlin
GlobalScope.launch { refresh() }   // never cancelled; survives the screen
```

**When you see it**: `GlobalScope`, or a `CoroutineScope(Dispatchers.IO)`
created as a field and never cancelled.

**Ask**: who cancels this? Structured concurrency is the language's answer to
leaked work, and `GlobalScope` is the documented way to opt out of it. On
Android the job outlives the Activity holding its references; on a server it
survives the request. `viewModelScope`, `lifecycleScope` or a scope cancelled in
`close()` is the fix.

### Cancellation swallowed by a broad catch

```kotlin
try { work() } catch (e: Exception) { log(e) }   // also catches CancellationException
```

**When you see it**: `catch (e: Exception)` or `catch (e: Throwable)` inside a
`suspend` function or a coroutine builder.

**Ask**: does this run in a coroutine? Cancellation is delivered *as* a
`CancellationException`, so a broad catch turns a cancelled job into one that
keeps running and reports a spurious error. The idiom is to rethrow it
explicitly, or catch only the exceptions actually expected.

### A blocking call inside a suspend function

```kotlin
suspend fun load(): String {
    return File(path).readText()   // blocks whichever dispatcher thread runs it
}
```

**When you see it**: JDBC, `Thread.sleep`, `File` I/O or a synchronous HTTP
client inside `suspend fun`, with no `withContext(Dispatchers.IO)`.

**Ask**: which dispatcher runs this? `suspend` is a promise not to block, and
nothing enforces it. On `Dispatchers.Default`, whose pool is sized to the CPU
count, a handful of these stall everything.

### A `data class` whose `copy` bypasses the constructor's validation

```kotlin
data class Email(val value: String) {
    init { require(value.contains("@")) }
}
val bad = Email("a@b.c").copy(value = "nope")   // init DOES run — but see below
```

**When you see it**: a `data class` used as a value type with invariants, and
especially one with a `private constructor`.

**Ask**: is the constructor the only way in? `init` does run for `copy`, but a
`private` constructor does **not** make a data class closed: the generated
`copy` stays public and re-exposes it. That is the case worth flagging, and the
compiler is only beginning to warn about it.

### A `lateinit` read on a path that may precede initialisation

```kotlin
private lateinit var client: Client
fun handle() = client.send(msg)    // UninitializedPropertyAccessException
```

**When you see it**: `lateinit` initialised in a lifecycle callback, an
`@PostConstruct`, or conditionally.

**Ask**: is every entry point downstream of the initialiser? `lateinit` moves a
nullability check the compiler was doing into a runtime exception you chose. It
is right for injected fields with a guaranteed order, wrong as a way to avoid
writing `?`.

### An exposed mutable collection or flow

```kotlin
class VM {
    val items = mutableListOf<Item>()                  // callers can mutate
    val state = MutableStateFlow(Idle)                 // callers can emit
}
```

**When you see it**: a `Mutable*` type as a public property; a `val` of mutable
type treated as immutable because it is a `val`.

**Ask**: who is allowed to change this? `val` prevents reassignment and nothing
else. The convention is a private `_state: MutableStateFlow` with a public
`state: StateFlow` — and the second half is the part that gets forgotten.

### `runBlocking` on a thread that must not block

```kotlin
fun getUser(id: String): User = runBlocking { repo.find(id) }
```

**When you see it**: `runBlocking` outside `main` or a test — inside a
controller, a callback, or a coroutine.

**Ask**: what thread is this on? It bridges sync to async by *blocking* the
caller, so on an event-loop or dispatcher thread it can deadlock: the work it
waits for needs a thread from the pool it is currently occupying.

### Equality on an `Array` property

```kotlin
data class Packet(val payload: ByteArray)   // equals compares references
```

**When you see it**: a `data class` with an `Array`/`ByteArray` component.

**Ask**: is this compared or used as a key? The generated `equals` uses
reference identity for arrays, so two packets with identical bytes are unequal.
The compiler warns for `data class` specifically — but not when the same array
field lives in a normal class with hand-written equality.

## Config-dependent - read `build.gradle.kts` before commenting

| What to read | Why it changes the review |
|---|---|
| detekt plugin + `detekt.yml` | Decides whether `!!` and swallowed exceptions are reported. Absent in many projects, which moves both into your column |
| `-Xjsr305=strict` | Makes Java annotations produce real nullable types instead of platform types — without it, the platform-type check above applies to the whole Java boundary |
| `kotlin.jvmToolchain` / `apiVersion` | Context receivers, `data object`, and newer stdlib APIs depend on it; do not suggest what the target forbids |
| `explicitApi()` | On in library modules: public declarations need explicit visibility and return types. Off, and an accidentally public API is invisible |
| Coroutines dependency at all | If absent, the four concurrency checks do not apply |

## What to say

Anchor the comment to the line, name the condition that triggers the defect, and
say what breaks: "`getName()` returns a platform type, so this dereference is
unchecked and throws when the Java side returns null" beats "watch out for null
from Java". If you cannot state the input that fails, it is a preference, not a
defect.
