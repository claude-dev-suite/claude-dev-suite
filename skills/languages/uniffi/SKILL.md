---
name: uniffi
description: |
  UniFFI by Mozilla — generates idiomatic Kotlin, Swift, Python, and Ruby bindings
  from a Rust crate. Covers UDL definition, proc-macro mode, async support, callback
  interfaces, error handling, custom types, and the Kotlin Multiplatform fork
  (uniffi-kotlin-multiplatform-bindings) used by BDK, Breez SDK, CDK, LWK.

  USE WHEN: user mentions "UniFFI", "Rust to Kotlin", "Rust to Swift", "FFI bindings",
  "uniffi-rs", "UDL file", "uniffi-bindgen", "BDK bindings", "Breez SDK bindings",
  "kotlin-multiplatform-bindings", "Mozilla UniFFI"

  DO NOT USE FOR: Raw C FFI - use `languages/swift` interop quick-ref + Rust core
  DO NOT USE FOR: WebAssembly bindings - use wasm-bindgen
  DO NOT USE FOR: Flutter/Rust bridge - use `flutter_rust_bridge` skill if exists
  DO NOT USE FOR: React Native - use `uniffi-bindgen-react-native` (out of scope here)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# UniFFI — Rust ↔ Kotlin/Swift Bindings

> **References**: [proc-macro.md](quick-ref/proc-macro.md) for inline `#[uniffi::export]` macro mode (UDL-free). [kmp-bindings.md](quick-ref/kmp-bindings.md) for the Kotlin Multiplatform fork used by BDK/Breez/CDK.
>
> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `uniffi`.

## What UniFFI Is

UniFFI generates **safe, idiomatic** language bindings (Kotlin, Swift, Python, Ruby) from a Rust crate. The generated code:
- Marshals types correctly (handles `String`, `Vec<T>`, `Option<T>`, `Result<T,E>`, custom enums/structs, traits)
- Manages memory across the FFI boundary (RAII, reference counting)
- Maps Rust errors to native exceptions
- Supports async functions, callback interfaces, and trait objects

**Two definition modes**:
1. **UDL** (`.udl` file, IDL-like) — explicit, language-neutral
2. **Proc-macro** (`#[uniffi::export]` inline on Rust items) — terser, modern

Most Bitcoin libraries (BDK, LDK Node, Breez SDK Liquid, CDK, LWK) use UDL for stability. New crates increasingly use proc-macro mode.

## Minimal Project Setup

### Cargo.toml

```toml
[package]
name = "wallet-ffi"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "staticlib"]   # both for mobile bundling
name = "wallet_ffi"

[dependencies]
uniffi = { version = "0.28", features = ["cli"] }
thiserror = "1.0"

[build-dependencies]
uniffi = { version = "0.28", features = ["build"] }

[[bin]]
name = "uniffi-bindgen"
path = "uniffi-bindgen.rs"
```

### build.rs

```rust
fn main() {
    uniffi::generate_scaffolding("./src/wallet.udl").unwrap();
}
```

### uniffi-bindgen.rs

```rust
fn main() {
    uniffi::uniffi_bindgen_main()
}
```

### src/wallet.udl

```idl
namespace wallet {
    [Throws=WalletError]
    string generate_mnemonic(u32 word_count);

    string derive_address(string mnemonic, u32 index);
};

[Error]
enum WalletError {
    "InvalidMnemonic",
    "InvalidIndex",
    "Internal",
};

interface Wallet {
    [Throws=WalletError]
    constructor(string mnemonic);

    string get_address(u32 index);

    [Throws=WalletError]
    Balance get_balance();
};

dictionary Balance {
    u64 confirmed;
    u64 trusted_pending;
    u64 untrusted_pending;
};
```

### src/lib.rs

```rust
use thiserror::Error;

uniffi::include_scaffolding!("wallet");

#[derive(Debug, Error)]
pub enum WalletError {
    #[error("invalid mnemonic")]
    InvalidMnemonic,
    #[error("invalid index")]
    InvalidIndex,
    #[error("internal error: {0}")]
    Internal(String),
}

pub struct Balance {
    pub confirmed: u64,
    pub trusted_pending: u64,
    pub untrusted_pending: u64,
}

pub fn generate_mnemonic(word_count: u32) -> Result<String, WalletError> {
    // ...
    Ok("abandon abandon ...".to_string())
}

pub fn derive_address(mnemonic: String, index: u32) -> String {
    format!("bc1q...{index}")
}

pub struct Wallet { /* internal state */ }

impl Wallet {
    pub fn new(mnemonic: String) -> Result<Self, WalletError> {
        if mnemonic.split_whitespace().count() < 12 {
            return Err(WalletError::InvalidMnemonic);
        }
        Ok(Wallet { /* ... */ })
    }

    pub fn get_address(&self, index: u32) -> String {
        format!("bc1q...{index}")
    }

    pub fn get_balance(&self) -> Result<Balance, WalletError> {
        Ok(Balance { confirmed: 100_000, trusted_pending: 0, untrusted_pending: 0 })
    }
}
```

### Generate Bindings

```bash
# Build native lib first
cargo build --release

# Generate Kotlin bindings
cargo run --bin uniffi-bindgen generate src/wallet.udl \
    --language kotlin --out-dir ./bindings/kotlin

# Generate Swift bindings
cargo run --bin uniffi-bindgen generate src/wallet.udl \
    --language swift --out-dir ./bindings/swift
```

Output (Kotlin example):

```kotlin
// bindings/kotlin/uniffi/wallet/wallet.kt — generated
@Throws(WalletException::class)
fun generateMnemonic(wordCount: UInt): String { /* ... */ }

class Wallet : Disposable {
    @Throws(WalletException::class)
    constructor(mnemonic: String) { /* ... */ }
    fun getAddress(index: UInt): String { /* ... */ }
    @Throws(WalletException::class)
    fun getBalance(): Balance { /* ... */ }
}

data class Balance(
    val confirmed: ULong,
    val trustedPending: ULong,
    val untrustedPending: ULong,
)

sealed class WalletException(message: String) : Exception(message) {
    object InvalidMnemonic : WalletException("invalid mnemonic")
    object InvalidIndex : WalletException("invalid index")
    class Internal(message: String) : WalletException("internal: $message")
}
```

## Type Mapping (UDL ↔ Rust ↔ Kotlin ↔ Swift)

| UDL | Rust | Kotlin | Swift |
|---|---|---|---|
| `boolean` | `bool` | `Boolean` | `Bool` |
| `u8/i8 ... u64/i64` | `u8/i8 ... u64/i64` | `UByte/Byte ... ULong/Long` | `UInt8/Int8 ... UInt64/Int64` |
| `f32/f64` | `f32/f64` | `Float/Double` | `Float/Double` |
| `string` | `String` | `String` | `String` |
| `bytes` | `Vec<u8>` | `ByteArray` | `Data` |
| `sequence<T>` | `Vec<T>` | `List<T>` | `[T]` |
| `record<K,V>` | `HashMap<K,V>` | `Map<K,V>` | `[K: V]` |
| `T?` | `Option<T>` | `T?` | `T?` |
| `dictionary X { ... }` | `struct X { ... }` | `data class X(...)` | `struct X` |
| `interface X { ... }` | `pub struct X` w/ `impl` | `class X : Disposable` | `class X` |
| `[Enum] enum X { ... }` | enum w/ unit variants | `enum class X` | `enum X` |
| `enum X { Variant(T) }` (with assoc) | enum w/ data variants | sealed class | enum w/ associated values |
| `[Error] enum X { ... }` | enum impl `std::error::Error` | sealed Exception | enum: Error |

## Async Support

```idl
interface Wallet {
    [Async, Throws=WalletError]
    Balance sync();
};
```

```rust
#[uniffi::export(async_runtime = "tokio")]
impl Wallet {
    pub async fn sync(&self) -> Result<Balance, WalletError> {
        // tokio async work
        Ok(self.get_balance()?)
    }
}
```

```kotlin
// Kotlin — exposed as suspend function
val balance: Balance = wallet.sync()
```

```swift
// Swift — exposed as async throws
let balance = try await wallet.sync()
```

UniFFI bridges Rust futures (Tokio runtime) to Kotlin coroutines and Swift's Task system. Polling is driven by the host runtime — your Rust code can `await` freely.

## Callback Interfaces (Host → Rust)

For event listeners or strategy injection.

```idl
callback interface BlockListener {
    void on_new_block(u64 height, string hash);
};

namespace wallet {
    void watch_blocks(BlockListener listener);
};
```

```kotlin
class MyListener : BlockListener {
    override fun onNewBlock(height: ULong, hash: String) {
        log("block $height: $hash")
    }
}

watchBlocks(MyListener())
```

```swift
final class MyListener: BlockListener {
    func onNewBlock(height: UInt64, hash: String) {
        print("block \(height): \(hash)")
    }
}

watchBlocks(listener: MyListener())
```

**Lifecycle**: callback objects are reference-counted; Rust holds a strong ref while the listener is registered. Always provide a way to unregister to avoid leaks.

## Trait Interfaces (Rust → Host as polymorphic)

```idl
[Trait]
interface Signer {
    bytes sign(bytes message);
};
```

```rust
pub trait Signer: Send + Sync {
    fn sign(&self, message: Vec<u8>) -> Vec<u8>;
}
```

The host can implement `Signer` and pass instances back to Rust functions accepting `Arc<dyn Signer>`. Useful for hardware wallet signers, custom key sources.

## Error Handling

```idl
[Error]
enum WalletError {
    "InvalidMnemonic",
    "Network",
    "InsufficientFunds",
};
```

For richer errors with payload:

```rust
#[derive(Debug, thiserror::Error, uniffi::Error)]
#[uniffi(flat_error)]
pub enum WalletError {
    #[error("invalid mnemonic")]
    InvalidMnemonic,
    #[error("network: {0}")]
    Network(String),
    #[error("insufficient funds: need {need}, have {have}")]
    InsufficientFunds { need: u64, have: u64 },
}
```

`#[uniffi(flat_error)]` collapses to a single message string in bindings (simpler). Without it, fields are exposed.

## Custom Types (Newtype Pattern)

```idl
[Custom]
typedef string Address;
```

```rust
pub struct Address(pub String);

impl UniffiCustomTypeConverter for Address {
    type Builtin = String;
    fn into_custom(val: String) -> Result<Self, anyhow::Error> {
        if !val.starts_with("bc1") { anyhow::bail!("invalid address"); }
        Ok(Address(val))
    }
    fn from_custom(obj: Self) -> String { obj.0 }
}
```

Address validates on the FFI boundary. Bindings see `String` but Rust gets validated `Address`.

## Memory Model

- **Records (dictionaries)** → marshaled by value (copied across FFI)
- **Interfaces** → reference type, ref-counted (`Arc`-equivalent on both sides)
- Kotlin: implements `Disposable` (`AutoCloseable`) → use `wallet.use { ... }` blocks
- Swift: deinit calls into Rust to drop

```kotlin
Wallet(mnemonic).use { wallet ->
    val addr = wallet.getAddress(0u)
}
// Disposed automatically here
```

```swift
{
    let wallet = try Wallet(mnemonic: mnemonic)
    let addr = wallet.getAddress(index: 0)
    // wallet.deinit at end of scope releases Rust resources
}
```

**CRITICAL**: forgetting `.use { }` (Kotlin) leaks the Rust object until GC eventually finalizes — long-running mobile apps can leak megabytes. Always wrap in `use` or `try-with-resources`.

## Bundling Bindings

### Android (Gradle)

```kotlin
// build.gradle.kts (Android module)
android {
    sourceSets["main"].apply {
        java.srcDirs("../uniffi-output/kotlin")
        jniLibs.srcDirs("../uniffi-output/jniLibs")  // .so files per ABI
    }
}

dependencies {
    implementation("net.java.dev.jna:jna:5.14.0@aar")
}
```

Build native libs per ABI:

```bash
# Use cargo-ndk for cross-compile to Android
cargo install cargo-ndk
cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 -o ./jniLibs build --release
```

### iOS (Swift Package or XCFramework)

Build for iOS targets:

```bash
cargo build --release --target aarch64-apple-ios
cargo build --release --target aarch64-apple-ios-sim
cargo build --release --target x86_64-apple-ios

# Package as XCFramework
xcodebuild -create-xcframework \
    -library target/aarch64-apple-ios/release/libwallet_ffi.a \
        -headers ./bindings/swift/include \
    -library target/aarch64-apple-ios-sim/release/libwallet_ffi.a \
        -headers ./bindings/swift/include \
    -output Wallet.xcframework
```

Then drop `Wallet.xcframework` + generated `wallet.swift` into Xcode project (or vendor via SwiftPM).

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Forgetting `use { }` (Kotlin) | Memory leak | Always wrap in `use { }` or implement `Closeable` |
| Returning raw `Vec<u8>` from hot loops | Per-call alloc | Use streaming/callbacks or batch |
| Sync APIs that block IO | Blocks UI | Mark `[Async]` and use `Dispatchers.IO` / async |
| Leaking trait callback registrations | Memory growth | Always unregister listeners |
| `String` for type-safe IDs | No FFI safety | Use `[Custom]` types with validation |
| Panic in Rust (no `Result`) | Crash on host | Convert panics → `Result<_, E>` |
| Large recursive types | Slow marshaling | Flatten or paginate |
| Generic functions in `[Trait]` interface | Not supported | Specialize to concrete types |

## Anti-Pitfalls Specific to Mobile

- **Android JNA**: required runtime dep — bundle correctly, watch for ProGuard rules
- **iOS bitcode**: deprecated, but check Xcode build settings for warnings
- **Swift module name conflicts**: rename `library_name` in UDL or generated module
- **Kotlin nullability**: `T?` in UDL maps to nullable in Kotlin — match Rust `Option<T>`
- **Async cancellation**: cancellation does NOT propagate from Kotlin coroutine → Rust future automatically. Implement explicit cancel API if needed

## When to Use UniFFI vs Alternatives

| Need | Pick |
|---|---|
| Rust → Kotlin/Swift, multi-platform | **UniFFI** |
| Rust → Kotlin Multiplatform (single common module) | **uniffi-kotlin-multiplatform-bindings** (fork) |
| Rust → Flutter/Dart | `flutter_rust_bridge` |
| Rust → React Native | `uniffi-bindgen-react-native` |
| Rust → Web (browser) | `wasm-bindgen` |
| Rust → C only (or one host language, max perf) | Raw `extern "C"` + cbindgen |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Pure Rust binding to C lib | rust core skills + bindgen |
| Manual FFI from Swift to Rust | `languages/swift` interop quick-ref |
| KMP gradle setup | `mobile/kotlin-multiplatform` |
| Compose-side wallet UI | `frontend-frameworks/compose-multiplatform` |
| BDK/Breez SDK API specifics | bitcoin/libraries/bdk + bitcoin/lightning/ldk |
