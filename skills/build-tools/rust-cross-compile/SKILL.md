---
name: rust-cross-compile
description: |
  Cross-compiling Rust crates for mobile (Android, iOS) and other non-host targets.
  Covers rustup target management, cargo-ndk for Android (NDK toolchain), iOS
  targets (aarch64-apple-ios, aarch64-apple-ios-sim, x86_64-apple-ios), `cross`
  for general cross-compile via Docker, lipo for iOS universal binaries, XCFramework
  packaging, sysroot configuration, dependency cross-compile gotchas (openssl, ring,
  C deps), and CI matrix patterns.

  USE WHEN: user mentions "cross-compile rust", "cargo-ndk", "rustup target add",
  "aarch64-apple-ios", "lipo", "cargo cross", "rust for android", "rust for ios",
  "Rust XCFramework", "static library mobile"

  DO NOT USE FOR: Gradle KMP build - use `build-tools/gradle-kmp`
  DO NOT USE FOR: Pure Rust language - use `languages/rust`
  DO NOT USE FOR: UniFFI specifics - use `languages/uniffi`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Rust Cross-Compilation for Mobile

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `rust-cross-compile` or `cargo-ndk`.

## Targets Cheat Sheet

| Target | Use case |
|---|---|
| `aarch64-linux-android` | Android arm64 (modern devices) |
| `armv7-linux-androideabi` | Android arm32 (older devices) |
| `i686-linux-android` | Android x86 emulator (32-bit) |
| `x86_64-linux-android` | Android x86_64 emulator |
| `aarch64-apple-ios` | iOS device (iPhone arm64) |
| `aarch64-apple-ios-sim` | iOS Simulator on Apple Silicon Mac |
| `x86_64-apple-ios` | iOS Simulator on Intel Mac (legacy) |
| `aarch64-apple-darwin` | macOS Apple Silicon |
| `x86_64-apple-darwin` | macOS Intel |
| `wasm32-unknown-unknown` | Browser WASM |
| `wasm32-wasip1` | WASM with WASI |
| `aarch64-unknown-linux-gnu` | Linux arm64 (Raspberry Pi 64-bit, ARM servers) |
| `x86_64-unknown-linux-musl` | Linux static-link (Alpine, distroless) |

```bash
rustup target list                              # all
rustup target list --installed
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
```

## Cargo.toml — Library for FFI

```toml
[package]
name = "bhodl-ffi"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "staticlib"]            # both for mobile bundling
name = "bhodl_ffi"

[dependencies]
uniffi = { version = "0.28", features = ["cli"] }
tokio = { version = "1", features = ["rt-multi-thread"] }

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
strip = true                                     # strip symbols for smaller binary
panic = "abort"                                  # smaller; use "unwind" if you catch panics
```

`cdylib` → `.so` (Android), `.dylib` (macOS). `staticlib` → `.a` (iOS, where dynamic libs are restricted).

## Android — `cargo-ndk`

Wraps cargo with the Android NDK toolchain. Replaces older `cargo build --target=...` + manual env var dance.

```bash
# Install
cargo install cargo-ndk

# Set NDK path (or use ANDROID_NDK_HOME env)
export ANDROID_NDK_HOME=$HOME/Android/Sdk/ndk/27.1.12297006

# Build for multiple ABIs
cargo ndk \
    -t arm64-v8a \
    -t armeabi-v7a \
    -t x86_64 \
    -t x86 \
    -o ./jniLibs \                              # output dir
    build --release

# Output structure (matches Android's expected layout):
# jniLibs/
# ├── arm64-v8a/libbhodl_ffi.so
# ├── armeabi-v7a/libbhodl_ffi.so
# ├── x86_64/libbhodl_ffi.so
# └── x86/libbhodl_ffi.so
```

In Gradle (Android module):

```kotlin
android {
    sourceSets["main"].jniLibs.srcDirs("../rust-ffi/jniLibs")
}
```

### NDK Version Pinning

Specify NDK version in `local.properties` or via env:

```properties
# local.properties
ndk.dir=/Users/me/Library/Android/sdk/ndk/27.1.12297006
```

Or in `app/build.gradle.kts`:

```kotlin
android {
    ndkVersion = "27.1.12297006"
}
```

### Android API Level

Set min API level for generated `.so`:

```bash
cargo ndk -t arm64-v8a --platform 26 -o ./jniLibs build --release
# Compatible with Android API 26+ (Android 8.0)
```

Match this to your Android `minSdk`.

## iOS — Native Cargo

iOS uses `staticlib` only (Apple disallows dynamic libs in apps).

```bash
# Device
cargo build --release --target aarch64-apple-ios

# Simulator (Apple Silicon Mac)
cargo build --release --target aarch64-apple-ios-sim

# Simulator (Intel Mac, legacy)
cargo build --release --target x86_64-apple-ios

# Output:
# target/aarch64-apple-ios/release/libbhodl_ffi.a
# target/aarch64-apple-ios-sim/release/libbhodl_ffi.a
# target/x86_64-apple-ios/release/libbhodl_ffi.a
```

### Universal Simulator Library (lipo)

Combine sim arm64 + sim x86_64 into single `.a` for unified simulator support:

```bash
mkdir -p target/universal/release
lipo -create \
    target/aarch64-apple-ios-sim/release/libbhodl_ffi.a \
    target/x86_64-apple-ios/release/libbhodl_ffi.a \
    -output target/universal/release/libbhodl_ffi.a

# Verify
lipo -info target/universal/release/libbhodl_ffi.a
# → arm64 x86_64
```

### XCFramework (Recommended Distribution)

Bundle device + simulator binaries with headers into single artifact:

```bash
mkdir -p Bhodl.xcframework
xcodebuild -create-xcframework \
    -library target/aarch64-apple-ios/release/libbhodl_ffi.a \
        -headers ./bindings/ios/include \
    -library target/universal/release/libbhodl_ffi.a \
        -headers ./bindings/ios/include \
    -output Bhodl.xcframework
```

Drop `Bhodl.xcframework` into Xcode project or vendor via Swift Package Manager.

For UniFFI: see `languages/uniffi/quick-ref/kmp-bindings.md` for the full pipeline.

## `cross` — General-Purpose Cross-Compilation

For Linux/Windows/etc. targets without manual toolchain setup. Uses Docker to provide pre-built sysroots.

```bash
# Install
cargo install cross --git https://github.com/cross-rs/cross

# Build for ARM Linux
cross build --target aarch64-unknown-linux-gnu --release

# Build for musl (static, Alpine-friendly)
cross build --target x86_64-unknown-linux-musl --release

# Build for Windows from Linux
cross build --target x86_64-pc-windows-gnu --release
```

`Cross.toml` for custom config:

```toml
[target.aarch64-unknown-linux-gnu]
image = "ghcr.io/cross-rs/aarch64-unknown-linux-gnu:main"
pre-build = [
    "apt-get update",
    "apt-get install -y libssl-dev:arm64",
]

[build.env]
passthrough = ["CARGO_TERM_COLOR"]
```

`cross` requires Docker/Podman. Doesn't work for Apple targets (those need Xcode toolchain on macOS).

## C Dependency Pitfalls

Crates depending on C libraries (openssl, sqlite, libsodium) often need extra config when cross-compiling.

### OpenSSL

```toml
# Avoid system openssl on iOS / Android — use vendored
[dependencies]
openssl = { version = "0.10", features = ["vendored"] }
```

Or switch to **rustls** (pure Rust):

```toml
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls"] }
```

### SQLCipher (rusqlite)

```toml
[dependencies]
rusqlite = { version = "0.32", features = ["bundled-sqlcipher"] }
```

`bundled-sqlcipher` compiles SQLCipher from source, statically linked — no system dep.

### libsodium

```toml
[dependencies]
dryoc = "0.7"            # pure Rust, no C dependency, easiest to cross-compile
```

If you must use libsodium-sys:

```toml
[dependencies]
libsodium-sys-stable = { version = "1.20", features = ["fetch-latest"] }
```

The `fetch-latest` feature builds libsodium from source (no system dep).

## Build Profiles for Mobile

```toml
[profile.release]
opt-level = "z"          # optimize for size (vs "3" for speed)
lto = true               # link-time optimization
codegen-units = 1        # better optimization, slower build
strip = true             # remove debug symbols
panic = "abort"          # smaller binary; no unwinding stacks

[profile.release-with-debug]
inherits = "release"
debug = true             # for profiling release builds
strip = false
```

For smallest mobile binary:

```toml
[profile.release]
opt-level = "z"
lto = "fat"
codegen-units = 1
strip = "symbols"
panic = "abort"
overflow-checks = false  # don't include checks (default in release)
```

Trade-off: slower compile, smaller binary, less debugging info.

## Linker Configuration

`.cargo/config.toml` (per-project):

```toml
[target.aarch64-linux-android]
linker = "aarch64-linux-android26-clang"        # set by cargo-ndk

[target.aarch64-apple-ios]
rustflags = ["-C", "link-arg=-Wl,-application_extension"]   # for app extensions

[target.x86_64-unknown-linux-musl]
linker = "x86_64-linux-musl-gcc"
```

`cargo-ndk` sets the right linker automatically when building Android targets.

## Build Caching

### sccache (incremental cross-target cache)

```bash
cargo install sccache
export RUSTC_WRAPPER=sccache
```

Speeds up cross-compile when targets share intermediate artifacts.

### Target-specific build dirs

```bash
# Avoid clobbering host-target cache
cargo ndk ... build --target-dir target/android
cargo build --target aarch64-apple-ios --target-dir target/ios
```

## CI Patterns

### GitHub Actions — Multi-Target Build

```yaml
# .github/workflows/rust-cross.yml
name: Rust cross-compile

on: [push, pull_request]

jobs:
  android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-linux-android,armv7-linux-androideabi,x86_64-linux-android

      - name: Setup Android NDK
        uses: nttld/setup-ndk@v1
        with:
          ndk-version: r27c

      - name: Install cargo-ndk
        run: cargo install cargo-ndk

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2

      - name: Build Android libs
        env:
          ANDROID_NDK_HOME: ${{ steps.setup-ndk.outputs.ndk-path }}
        run: |
          cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 -o jniLibs build --release

      - uses: actions/upload-artifact@v4
        with:
          name: android-libs
          path: jniLibs/

  ios:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-ios,aarch64-apple-ios-sim,x86_64-apple-ios

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2

      - name: Build iOS libs
        run: |
          cargo build --release --target aarch64-apple-ios
          cargo build --release --target aarch64-apple-ios-sim
          cargo build --release --target x86_64-apple-ios

      - name: Build XCFramework
        run: |
          mkdir -p target/universal/release
          lipo -create \
              target/aarch64-apple-ios-sim/release/libbhodl_ffi.a \
              target/x86_64-apple-ios/release/libbhodl_ffi.a \
              -output target/universal/release/libbhodl_ffi.a

          xcodebuild -create-xcframework \
              -library target/aarch64-apple-ios/release/libbhodl_ffi.a \
                -headers bindings/ios/include \
              -library target/universal/release/libbhodl_ffi.a \
                -headers bindings/ios/include \
              -output Bhodl.xcframework

      - uses: actions/upload-artifact@v4
        with:
          name: ios-xcframework
          path: Bhodl.xcframework/
```

### Build Matrix

```yaml
strategy:
  matrix:
    include:
      - target: aarch64-linux-android
        runner: ubuntu-latest
        ndk: true
      - target: x86_64-linux-android
        runner: ubuntu-latest
        ndk: true
      - target: aarch64-apple-ios
        runner: macos-14
      - target: x86_64-unknown-linux-musl
        runner: ubuntu-latest
        cross: true
```

## Inspecting Output

```bash
# Check archive contents
ar -t libbhodl_ffi.a | head

# Check symbols
nm -gU libbhodl_ffi.a | head             # exported globals
nm -gU libbhodl_ffi.a | grep wallet

# iOS — check architecture
lipo -info libbhodl_ffi.a
# → Architectures in the fat file: libbhodl_ffi.a are: arm64

# Android — check ABI
file libbhodl_ffi.so
# → ELF 64-bit LSB shared object, ARM aarch64
```

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Building all Android ABIs in dev | Slow | Build only emulator ABI in dev (`--targets x86_64`) |
| Single `.a` for both device + sim (lipo merge with arm64s) | Conflict (both have arm64) | XCFramework (separates by platform) |
| `openssl` system dep on Android/iOS | Cross-compile breaks | Use `rustls` or vendored openssl |
| Forgetting `staticlib` crate-type for iOS | No `.a` produced | Add `crate-type = ["cdylib", "staticlib"]` |
| Dynamic libs (`cdylib`) on iOS | App Store rejection | Use `staticlib` for iOS |
| Building debug profile for release distribution | Huge binaries | Always `--release` for distribution |
| Not stripping symbols | Larger binary, info leak | `strip = true` in `[profile.release]` |
| Hardcoded NDK path | Not portable | Use `ANDROID_NDK_HOME` env or `local.properties` |
| Running `cargo` directly for Android | Wrong toolchain | Use `cargo-ndk` |
| Skipping `aarch64-apple-ios-sim` target | Crashes on M-series Mac sim | Build all sim arches you support |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `linker 'aarch64-linux-android21-clang' not found` | NDK not installed or wrong path | Set `ANDROID_NDK_HOME`, use cargo-ndk |
| `Undefined symbols for architecture arm64` (iOS link) | C dependency missing for target | Vendor or rebuild with target sysroot |
| `building for iOS Simulator-arm64 but linking with libs built for iOS-arm64` | Wrong target combined | Build separately, lipo only sim arches |
| `No such file or directory: 'libssl.so'` | System openssl not present | Use vendored: `features = ["vendored"]` |
| `no entry in dyld shared cache` | Missing iOS framework link | Add `linkerOpts = -framework Security` in def or build script |
| Build slow on every CI run | No cache | Use `Swatinem/rust-cache@v2` |
| `cargo-ndk: command not found` after install | Cargo bin not in PATH | `export PATH="$HOME/.cargo/bin:$PATH"` |
| `INSTALL_FAILED_NO_MATCHING_ABIS` | APK doesn't have lib for emulator's ABI | Build the matching ABI |
| iOS device build works, sim arm64 doesn't | Target not added | `rustup target add aarch64-apple-ios-sim` |
| `cross` Docker permission denied | Docker not running / user not in docker group | Start Docker, add user to docker group |
| Huge `.a` files | Debug symbols included | Set `strip = true` in release profile |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| KMP Gradle config | `build-tools/gradle-kmp` |
| UniFFI binding generation | `languages/uniffi` |
| Pure Rust language | `languages/rust` |
| Rust web (WASM) | wasm-bindgen specific |
| Reproducible Linux builds | `infrastructure/reproducible-builds` |
