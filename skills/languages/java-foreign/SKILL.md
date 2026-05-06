---
name: java-foreign
description: |
  Java Foreign Function & Memory API (JEP 442/454, finalized in JDK 22+) plus
  jextract tool. Replaces JNI for calling C libraries from JVM/Kotlin without
  writing native glue. Critical for desktop apps needing OS interop (keyring,
  system APIs) on Linux/macOS/Windows. Covers Linker, MethodHandle, MemorySegment,
  Arena, struct layout, jextract code generation, and integration with KMP
  desktop targets.

  USE WHEN: user mentions "Foreign Memory API", "FFM API", "jextract",
  "MemorySegment", "Linker", "java.lang.foreign", "JEP 442", "JEP 454",
  "JDK 22 FFI", "Java FFI no JNI", "panama", "OS keyring Java"

  DO NOT USE FOR: Rust ↔ Kotlin/Swift bindings - use `languages/uniffi`
  DO NOT USE FOR: Mobile Android JNI - use `mobile/android-native`
  DO NOT USE FOR: Generic Java patterns - use Java-specific skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Java Foreign Function & Memory API (Project Panama)

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `java-ffm` or `panama`.

## Why FFM API (Replacing JNI)

JNI has been Java's native interop since Java 1.1 — and is universally hated:
- Brittle C glue code, manual memory management
- Type marshaling overhead per call
- Poor IDE support
- One stack trace bug = JVM crash

**Foreign Function & Memory API** (FFM, finalized in JDK 22 via JEP 454) replaces JNI for **most use cases**:
- Pure Java/Kotlin code calls C libraries directly
- Type-safe via `MethodHandle`
- Region-based memory management (`Arena`)
- 10-100x faster than JNI for many ops
- Generated bindings via `jextract`
- Works seamlessly with virtual threads

For BHODL-style desktop wallet (Compose Desktop on JVM): **the way** to talk to OS keyring (libsecret on Linux, Keychain on macOS via Security framework, Credential Manager on Windows via wincred).

## Setup

Requires JDK 22+ for stable, JDK 21 for preview:

```kotlin
// build.gradle.kts
java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(22))
    }
}

application {
    applicationDefaultJvmArgs = listOf(
        "--enable-native-access=ALL-UNNAMED",            // grant FFI permission
    )
}

// For modular projects, declare in module-info.java:
// requires java.foreign;       — built-in module
```

For Kotlin DSL (Compose Desktop / KMP):

```kotlin
kotlin {
    jvm("desktop") {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_22)
        }
    }
}
```

## MemorySegment + Arena

Memory in FFM lives in an `Arena` — a scope that auto-frees memory at close:

```java
import java.lang.foreign.*;

try (Arena arena = Arena.ofConfined()) {
    // Allocate 256 bytes, zeroed
    MemorySegment buffer = arena.allocate(256);

    // Write
    buffer.set(ValueLayout.JAVA_INT, 0, 42);             // store int at offset 0
    buffer.setUtf8String(8, "hello");                     // C string at offset 8

    // Read
    int value = buffer.get(ValueLayout.JAVA_INT, 0);
    String str = buffer.getUtf8String(8);

    System.out.println(value + " " + str);
}                                                         // memory freed here
```

`Arena` types:
- `Arena.ofConfined()` — single thread, deterministic free at `close()`
- `Arena.ofShared()` — multi-thread, deterministic free
- `Arena.global()` — never freed (process lifetime)
- `Arena.ofAuto()` — GC-managed (avoid for large allocations)

For Kotlin (with `try-with-resources` via `use`):

```kotlin
import java.lang.foreign.Arena
import java.lang.foreign.MemorySegment
import java.lang.foreign.ValueLayout

Arena.ofConfined().use { arena ->
    val buffer = arena.allocate(256)
    buffer.set(ValueLayout.JAVA_INT, 0, 42)
    val value = buffer.get(ValueLayout.JAVA_INT, 0)
    println(value)
}
```

## Calling a C Function

Example: call `strlen` from libc.

```java
import java.lang.foreign.*;
import java.lang.invoke.MethodHandle;

public class HelloFFM {
    public static void main(String[] args) throws Throwable {
        Linker linker = Linker.nativeLinker();
        SymbolLookup stdlib = linker.defaultLookup();

        MethodHandle strlen = linker.downcallHandle(
            stdlib.find("strlen").orElseThrow(),
            FunctionDescriptor.of(ValueLayout.JAVA_LONG, ValueLayout.ADDRESS)
        );

        try (Arena arena = Arena.ofConfined()) {
            MemorySegment cString = arena.allocateUtf8String("Hello, world!");
            long len = (long) strlen.invoke(cString);
            System.out.println("Length: " + len);
        }
    }
}
```

Kotlin version:

```kotlin
import java.lang.foreign.*
import java.lang.invoke.MethodHandle

fun main() {
    val linker = Linker.nativeLinker()
    val stdlib = linker.defaultLookup()

    val strlen: MethodHandle = linker.downcallHandle(
        stdlib.find("strlen").orElseThrow(),
        FunctionDescriptor.of(ValueLayout.JAVA_LONG, ValueLayout.ADDRESS)
    )

    Arena.ofConfined().use { arena ->
        val cString = arena.allocateUtf8String("Hello, world!")
        val len = strlen.invoke(cString) as Long
        println("Length: $len")
    }
}
```

## Loading External Libraries

```kotlin
val customLib = SymbolLookup.libraryLookup("libsecret", Arena.global())
val secretSchema = customLib.find("secret_schema_new").orElseThrow()
```

Path resolution:
- Linux: searches `LD_LIBRARY_PATH`, `/usr/lib`, etc. (uses `dlopen`)
- macOS: searches `DYLD_LIBRARY_PATH`, system paths
- Windows: searches `PATH`, `%SystemRoot%\System32`, etc.

For bundled native libs:

```kotlin
val libPath = Path.of(System.getProperty("user.dir"), "libs", "libsecret.so")
val customLib = SymbolLookup.libraryLookup(libPath, Arena.global())
```

## Structs

Define struct layouts using `MemoryLayout`:

```kotlin
import java.lang.foreign.MemoryLayout
import java.lang.foreign.ValueLayout

// struct Point { int x; int y; };
val pointLayout = MemoryLayout.structLayout(
    ValueLayout.JAVA_INT.withName("x"),
    ValueLayout.JAVA_INT.withName("y")
)

// Get var handles for fields
val xHandle = pointLayout.varHandle(MemoryLayout.PathElement.groupElement("x"))
val yHandle = pointLayout.varHandle(MemoryLayout.PathElement.groupElement("y"))

Arena.ofConfined().use { arena ->
    val point = arena.allocate(pointLayout)
    xHandle.set(point, 0L, 10)
    yHandle.set(point, 0L, 20)

    val x = xHandle.get(point, 0L) as Int
    val y = yHandle.get(point, 0L) as Int
    println("($x, $y)")
}
```

For complex layouts with nested structs and arrays, use `paddingLayout` to match C alignment.

## Upcalls (C Callbacks → Java)

To pass a Java method as a C function pointer:

```kotlin
import java.lang.foreign.*
import java.lang.invoke.MethodHandle
import java.lang.invoke.MethodHandles

class Comparator {
    companion object {
        @JvmStatic
        fun compare(a: MemorySegment, b: MemorySegment): Int {
            val aVal = a.get(ValueLayout.JAVA_INT, 0L)
            val bVal = b.get(ValueLayout.JAVA_INT, 0L)
            return aVal.compareTo(bVal)
        }
    }
}

val linker = Linker.nativeLinker()
val handle: MethodHandle = MethodHandles.lookup().findStatic(
    Comparator::class.java,
    "compare",
    java.lang.invoke.MethodType.methodType(Int::class.java, MemorySegment::class.java, MemorySegment::class.java)
)

val descriptor = FunctionDescriptor.of(
    ValueLayout.JAVA_INT,
    ValueLayout.ADDRESS, ValueLayout.ADDRESS
)

Arena.ofConfined().use { arena ->
    val callback = linker.upcallStub(handle, descriptor, arena)
    // pass `callback` to qsort or similar C function
}
```

## jextract — Auto-Generate Bindings

For non-trivial C libraries, hand-writing FFM bindings is tedious. **jextract** parses C headers and generates Java/Kotlin source:

```bash
# Install jextract (separate download from java.net)
# https://jdk.java.net/jextract/

jextract --output src/main/java \
    --target-package com.bhodl.libsecret \
    --library secret-1 \
    /usr/include/libsecret-1/libsecret/secret.h
```

Generates Java classes wrapping every function and struct, ready to use:

```kotlin
import com.bhodl.libsecret.libsecret_h
import com.bhodl.libsecret.SecretSchema

val schema = SecretSchema.allocate(arena)
SecretSchema.name(schema, /* ... */)
val result = libsecret_h.secret_password_store_sync(/* args */)
```

## OS Keyring Pattern (BHODL Desktop)

For Compose Desktop wallet, store the SQLCipher key in OS keyring:

### Linux: libsecret

```kotlin
// jextract -t com.bhodl.libsecret -l secret-1 /usr/include/libsecret-1/libsecret/secret.h
import com.bhodl.libsecret.libsecret_h.*

class LinuxKeyring : Keyring {
    override fun store(account: String, password: ByteArray) {
        Arena.ofConfined().use { arena ->
            val schema = createSchema(arena)
            val accountStr = arena.allocateUtf8String(account)
            val passwordStr = arena.allocateUtf8String(String(password, Charsets.UTF_8))
            secret_password_store_sync(
                schema, /* collection */ secret_collection_default(), /* label */ accountStr,
                passwordStr, /* cancellable */ MemorySegment.NULL,
                /* error */ MemorySegment.NULL,
                accountStr, accountStr, MemorySegment.NULL
            )
        }
    }

    override fun retrieve(account: String): ByteArray? { /* ... */ }
}
```

### macOS: Security framework via Keychain

```kotlin
// Use jextract on /System/Library/Frameworks/Security.framework/Headers
class MacKeyring : Keyring {
    override fun store(account: String, password: ByteArray) {
        // SecKeychainAddGenericPassword via FFM
    }
}
```

### Windows: wincred (Credential Manager)

```kotlin
// jextract on wincred.h
class WindowsKeyring : Keyring {
    override fun store(account: String, password: ByteArray) {
        // CredWriteW via FFM
    }
}
```

### Cross-platform interface

```kotlin
interface Keyring {
    fun store(account: String, password: ByteArray)
    fun retrieve(account: String): ByteArray?
    fun delete(account: String)
}

object KeyringFactory {
    fun create(): Keyring = when {
        System.getProperty("os.name").lowercase().contains("linux") -> LinuxKeyring()
        System.getProperty("os.name").lowercase().contains("mac") -> MacKeyring()
        System.getProperty("os.name").lowercase().contains("windows") -> WindowsKeyring()
        else -> throw UnsupportedOperationException("Unsupported OS")
    }
}
```

For Compose Desktop wallet: **wrap once, use everywhere**. The SQLCipher key never leaves OS-managed storage.

## KMP Desktop Integration

Use FFM in `desktopMain`:

```
shared/
└── src/
    ├── commonMain/kotlin/Keyring.kt              # interface
    ├── desktopMain/kotlin/                        # JVM-only, can use FFM
    │   ├── DesktopKeyring.kt
    │   └── platform/
    │       ├── LinuxKeyring.kt
    │       ├── MacKeyring.kt
    │       └── WindowsKeyring.kt
```

Use `expect class Keyring` in `commonMain`, `actual` in `desktopMain` (and `androidMain` for Android Keystore, `iosMain` for Keychain).

## Performance

| Operation | JNI | FFM API |
|---|---|---|
| Empty native call | ~100 ns | ~10 ns |
| Pass int | ~120 ns | ~12 ns |
| Pass string (length 100) | ~500 ns | ~50 ns |
| Allocate + free 1KB | ~2 μs | ~200 ns |

10x speedup typical. For hot paths (e.g., calling crypto primitives in loop), the difference is dramatic.

## Comparison with Alternatives

| Approach | Performance | Type safety | Maintenance | Use case |
|---|---|---|---|---|
| **FFM API** | ✅ Fast | ✅ via MethodHandle | ✅ jextract auto-gen | New code, JDK 22+ |
| **JNI** | Slow | ❌ Manual marshal | ❌ C glue code | Legacy / Android (no FFM) |
| **JNA** | Slow | Partial | ✅ Reflection-based | Quick-and-dirty interop |
| **JavaCPP** | Fast | ✅ | Generator | Numeric/AI libs |
| **GraalVM Native Image** | Fastest (AOT) | ✅ | Build complexity | Native binaries |

For BHODL desktop: **FFM API** if targeting JDK 22+, fallback to **JNA** if must support older JVMs.

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| `Arena.global()` for short-lived data | Memory leaks | `Arena.ofConfined()` with try-with-resources |
| Forgetting `--enable-native-access` | Runtime warnings/errors | Add to JVM args |
| Sharing `MemorySegment` across threads (confined) | Crash | Use `Arena.ofShared()` if cross-thread |
| Storing `MemorySegment` reference past Arena close | Use-after-free segfault | Copy data out before close |
| Hand-writing complex bindings | Error-prone | Use `jextract` |
| Missing `--add-modules java.foreign` (older JDKs) | Compile fails | Or upgrade to JDK 22+ where it's standard |
| Calling FFM from concurrent virtual threads without `Arena.ofShared()` | Race | Use shared arena or per-thread confined |
| Treating `MemorySegment.NULL` as null pointer everywhere | Some APIs need real pointer | Verify with C signature |
| Allocating in hot loop without arena reuse | GC pressure | Reuse arena across iterations or `Arena.ofConfined` once |
| Using FFM in mobile (Android) | Not supported | Android uses JNI; FFM is JDK 22+ desktop |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `WARNING: A restricted method has been invoked` | `--enable-native-access` missing | Add JVM arg `--enable-native-access=ALL-UNNAMED` |
| `UnsatisfiedLinkError` | Library not found | Set `java.library.path` or use `SymbolLookup.libraryLookup` with absolute path |
| Segfault on `MethodHandle.invoke` | Mismatched FunctionDescriptor | Verify C signature matches descriptor |
| Memory leak | Arena not closed | Always use try-with-resources |
| `IllegalStateException: Already closed` | Used MemorySegment after Arena close | Restructure scope |
| Slow startup | jextract-generated classes loaded | Lazy-load on first use |
| `ClassCastException` on invoke result | Wrong return type in cast | Match C return type to Java type via ValueLayout |
| jextract fails on header | Macros / preprocessing | Pre-process with `gcc -E header.h > preprocessed.h` |
| Different behavior x86_64 vs arm64 | Endianness or struct padding | Use `MemoryLayout.paddingLayout` explicitly |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Rust ↔ Kotlin bindings | `languages/uniffi` |
| Android JNI | `mobile/android-native` (Android doesn't have FFM yet) |
| iOS native interop | `languages/swift` interop |
| Generic Java | Java-specific skill |
| GraalVM native compilation | GraalVM-specific |
| KMP `commonMain` (no JVM-only API) | Stick to expect/actual + Kotlin/Native cinterop on iOS |
