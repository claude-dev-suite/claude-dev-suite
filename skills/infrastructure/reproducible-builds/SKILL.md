---
name: reproducible-builds
description: |
  Reproducible builds — bit-for-bit identical artifacts from the same source,
  independently verifiable. Covers the reproducible-builds.org methodology, Bitcoin
  Core's Guix-based reproducible builds (the gold standard for cryptocurrency
  software), Nix Flakes for deterministic environments, source-date-epoch (SOURCE_DATE_EPOCH),
  build flag normalization (file ordering, locale, paths), .reproducible-builds.org
  diff tooling (diffoscope), and how to apply this to Rust + Gradle + mobile builds.

  USE WHEN: user mentions "reproducible builds", "deterministic builds",
  "bit-for-bit", "Guix builds", "diffoscope", "SOURCE_DATE_EPOCH",
  "Bitcoin Core build", "Nix flake build", "verify binary identical",
  "supply-chain attestation"

  DO NOT USE FOR: Artifact signing - use `security/sigstore-cosign`
  DO NOT USE FOR: Cross-compile mechanics - use `build-tools/rust-cross-compile`
  DO NOT USE FOR: General Gradle - use `build-tools/gradle-kmp`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Reproducible Builds

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `reproducible-builds`.

## What & Why

A **reproducible build** produces bit-for-bit identical binaries from the same source code, independent of who runs the build, when, or where. Essential for:

- **Trust**: anyone can verify that a published binary actually matches the source
- **Supply-chain security**: detect compromised build infrastructure
- **Wallet/crypto software**: users verify binaries match audited source — no hidden changes
- **Regulatory compliance**: provable provenance

Bitcoin Core has used **Gitian** (deprecated) and now **Guix** for reproducible builds since 2013. BHODL-style wallet apps should follow.

## Sources of Non-Determinism

| Source | Example | Fix |
|---|---|---|
| Timestamps in archives | `tar` records `mtime` | `SOURCE_DATE_EPOCH` env |
| Random IDs | UUIDs in metadata | Pin via build script |
| Build paths | `/home/alice` vs `/build` | Strip via `--remap-path-prefix` (Rust) / `-fdebug-prefix-map` (gcc/clang) |
| Locale-dependent sort | `LC_ALL` differences | `LC_ALL=C` |
| Parallel compilation order | Output depends on race | Sort outputs deterministically |
| File ordering in archives | `glob` filesystem order | Sort before adding |
| Compiler versions | gcc 13 vs 14 produces different code | Pin compiler version |
| ABI / linker | dynamic vs static, link order | Pin linker, use static when possible |
| Filesystem encoding | UTF-8 NFC vs NFD | Normalize source paths |
| Username, hostname embedded | Build hostname in binary | Patch out via build flags |
| Kernel/OS version (rare) | Some compilers branch on `uname` | Containerize the build |

## SOURCE_DATE_EPOCH

The **standard env var** for fixing build timestamps. Most modern build tools honor it.

```bash
export SOURCE_DATE_EPOCH=$(git log -1 --pretty=%ct)        # last commit time
# or fixed value
export SOURCE_DATE_EPOCH=1700000000

# Most tools auto-honor:
tar --mtime=@$SOURCE_DATE_EPOCH ...
zip ...                                                     # zip 3.0+
gcc -frecord-gcc-switches ...                              # debug info uses SOURCE_DATE_EPOCH
sphinx-build ...                                            # docs

# Build with normalized timestamps
make
```

For Rust, use `--remap-path-prefix`:

```toml
# Cargo.toml
[profile.release]
opt-level = 3
strip = true
panic = "abort"

[build]
rustflags = ["--remap-path-prefix", "/home/builder/src=src"]
```

## Bitcoin Core Approach (Guix)

Bitcoin Core uses **Guix** — a functional package manager + build system that captures every dependency, compiler, and config bit. Builders independently produce identical binaries; signed attestations posted to `bitcoin-core/guix.sigs`.

```bash
# Inside Bitcoin Core repo
./contrib/guix/guix-build

# Output (signed by builder):
guix-build-<commit>/output/<host>/bitcoin-<version>-<host>.tar.gz
guix-build-<commit>/output/<host>/SHA256SUMS.part

# Each builder runs same command, all produce identical SHA256SUMS
# Multiple builders sign attestation file → published as multi-sig proof
```

**Why Guix specifically**:
- Hermetic builds (no host system leakage)
- Bit-perfect dependency pinning via content-addressed store
- Cross-compile from one host to many targets
- Reproducible across Linux distros, including Arch/Debian/NixOS

**Trade-offs**:
- Steep learning curve
- Big initial download (Guix store ~5-10 GB)
- Mostly Linux-focused (macOS/Windows targets cross-compiled from Linux host)

## Nix Flakes (Modern Alternative)

For non-Guix users, **Nix Flakes** offers similar guarantees with broader ecosystem:

```nix
# flake.nix
{
    description = "BHODL reproducible build";
    inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
    inputs.flake-utils.url = "github:numtide/flake-utils";
    inputs.rust-overlay.url = "github:oxalica/rust-overlay";

    outputs = { self, nixpkgs, flake-utils, rust-overlay }:
        flake-utils.lib.eachDefaultSystem (system:
            let
                pkgs = import nixpkgs {
                    inherit system;
                    overlays = [ rust-overlay.overlays.default ];
                };
                rust = pkgs.rust-bin.stable."1.85.0".default;
            in {
                packages.default = pkgs.rustPlatform.buildRustPackage {
                    pname = "bhodl-ffi";
                    version = "1.0.0";
                    src = ./.;
                    cargoLock.lockFile = ./Cargo.lock;
                    nativeBuildInputs = [ rust ];
                    SOURCE_DATE_EPOCH = "1735689600";   # fixed
                };
            }
        );
}
```

```bash
nix build
# Output deterministic: result/bin/bhodl-ffi
sha256sum result/bin/bhodl-ffi
```

`flake.lock` pins all transitive dependencies by content hash. Two users running same `nix build` get bit-identical output.

## Rust Reproducibility

```toml
# .cargo/config.toml
[build]
rustflags = [
    "--remap-path-prefix", "/home/builder=src",
    "--remap-path-prefix", "/Users/builder=src",
]

[profile.release]
strip = true                                    # remove non-deterministic debug paths
panic = "abort"                                 # less variability than unwind
codegen-units = 1                               # deterministic codegen order

[net]
git-fetch-with-cli = false
```

```bash
# Pin Rust toolchain
echo "1.85.0" > rust-toolchain.toml
# Or full TOML:
cat > rust-toolchain.toml <<EOF
[toolchain]
channel = "1.85.0"
components = ["rustfmt", "clippy"]
targets = ["aarch64-apple-ios", "aarch64-linux-android"]
profile = "minimal"
EOF
```

Cargo.lock **must be committed** for libraries that need reproducible builds (it's optional for libraries by default; required for binaries).

## Verifying Reproducibility — diffoscope

When two builds produce different binaries, find why:

```bash
# Install
brew install diffoscope        # or apt
pip install diffoscope          # has many optional formats

# Compare
diffoscope build1/output build2/output
diffoscope build1/binary build2/binary --html report.html
```

Outputs hierarchical diff: archive members, binary sections, debug info, recursive into nested archives.

For mobile APK comparison:

```bash
diffoscope app-1.apk app-2.apk --html-dir report/
```

Common findings: `META-INF` order, `classes.dex` opt order (D8 nondeterminism), `.so` build paths, asset compression metadata.

## Android APK Reproducibility

APK is a `.zip` with embedded DEX, native libs, resources. Sources of nondeterminism:

| Source | Fix |
|---|---|
| Build timestamp in `AndroidManifest.xml` | None — accept or strip post-build |
| `META-INF/*.RSA`/`*.SF` order | `apksigner` v3+ deterministic |
| `classes.dex` D8 codegen | Use `--release` mode + pinned D8 version |
| Resource compression metadata | Use `-Z store` for `aapt2` if needed |
| File ordering in zip | `apksigner` rewrites in fixed order |
| ProGuard/R8 minification | Set `-printseeds`, `-printusage`, `-printmapping` for diff visibility |

Modern AGP (8+) with R8 produces increasingly deterministic output. Pin AGP version, JDK version, NDK version.

```kotlin
// app/build.gradle.kts
android {
    compileSdk = 35
    ndkVersion = "27.1.12297006"               // pin
    defaultConfig {
        vectorDrawables.useSupportLibrary = true
    }
    packaging {
        resources.excludes += setOf(
            "META-INF/MANIFEST.MF",
            "META-INF/build-data.properties",
        )
    }
    signingConfigs {
        create("release") {
            storeFile = file("release.keystore")
            storePassword = System.getenv("KEYSTORE_PASS")
            keyAlias = "bhodl"
            keyPassword = System.getenv("KEY_PASS")
        }
    }
}
```

Users verify by re-running build, comparing SHA-256 of unsigned APK (`app-release-unsigned.apk`).

## iOS / Xcode Reproducibility

Hardest target. Xcode's build process embeds many timestamps and host-specific paths.

| Source | Fix |
|---|---|
| `Info.plist` `CFBundleVersion` | Pin via build script |
| Compiler timestamps | `SOURCE_DATE_EPOCH` (limited support in Xcode) |
| Code signing | Same cert + provisioning profile |
| Build server hostname | Strip via `dwarfutil --remove-build-machine` |
| `dSYM` UUID | Best-effort match |

**Pragmatic approach**: provide unsigned `.framework` reproducibly (Rust XCFramework can be deterministic), then user signs themselves with their own Apple certificate.

For BHODL: ship XCFramework reproducibly + accept that Xcode app build is not fully reproducible. Users verify the framework, sign their own app build.

## CI Pattern: Reproducibility Verification

```yaml
# .github/workflows/reproducible.yml
name: Verify reproducibility

on: [pull_request]

jobs:
  build-twice:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Pin toolchain
        run: rustup show

      - name: Build #1
        run: |
            export SOURCE_DATE_EPOCH=$(git log -1 --pretty=%ct)
            cargo build --release --target aarch64-apple-ios
            cp target/aarch64-apple-ios/release/libbhodl_ffi.a /tmp/build1.a
            cargo clean

      - name: Build #2
        run: |
            export SOURCE_DATE_EPOCH=$(git log -1 --pretty=%ct)
            cargo build --release --target aarch64-apple-ios
            cp target/aarch64-apple-ios/release/libbhodl_ffi.a /tmp/build2.a

      - name: Compare
        run: |
            sha256sum /tmp/build1.a /tmp/build2.a
            cmp /tmp/build1.a /tmp/build2.a || (
                diffoscope /tmp/build1.a /tmp/build2.a --html /tmp/report.html
                exit 1
            )
```

If diff found, CI fails and uploads HTML diff for inspection.

## Distribution Pattern (Bitcoin Core Style)

For BHODL-style wallet apps:

1. **CI builds** reproducibly → produces `bhodl-1.0.0.tar.gz` + `SHA256SUMS`
2. **Multiple builders** independently rebuild from same source tag → each produces own `SHA256SUMS`
3. **Builders sign** their `SHA256SUMS` with their PGP/Sigstore key, push to `bhodl/build-attestations`
4. **Users download** binary, fetch attestations, verify N-of-M builders agree on hash, verify signatures
5. **Optional**: cosign sign-blob for supply chain attestation (see `security/sigstore-cosign`)

```bash
# User verification flow
wget https://bhodl.app/release/bhodl-1.0.0.tar.gz
wget https://bhodl.app/release/SHA256SUMS
wget https://bhodl.app/release/SHA256SUMS.asc

# Verify multi-sig
gpg --verify SHA256SUMS.asc SHA256SUMS         # checks all sigs
sha256sum -c SHA256SUMS                         # verifies download matches
```

## Rust Specifics — Build Pinning

```toml
# rust-toolchain.toml — pin compiler
[toolchain]
channel = "1.85.0"

# Cargo.lock — pin all dependencies (commit it!)

# .cargo/config.toml
[build]
rustflags = [
    "--remap-path-prefix", "/build=src",
    "-C", "link-arg=-Wl,--build-id=none",     # no build ID in ELF
]

[net]
offline = false                                # CI: set true to fail on uncached deps
git-fetch-with-cli = true                     # consistent fetch behavior
```

For procedural macros / build scripts that read time:

```rust
// build.rs — DON'T do this in build script:
//   println!("cargo:rustc-env=BUILD_TIME={}", chrono::Utc::now());

// DO this:
let build_time = std::env::var("SOURCE_DATE_EPOCH")
    .map(|s| s.parse::<i64>().unwrap_or(0))
    .unwrap_or(0);
println!("cargo:rustc-env=BUILD_TIME={}", build_time);
```

## Containerized Build (Docker)

For full hermetic builds without Guix:

```dockerfile
# Dockerfile.reproducible
FROM rust:1.85-slim-bookworm@sha256:fixed_digest_here AS builder

ENV SOURCE_DATE_EPOCH=1735689600
ENV LC_ALL=C
ENV TZ=UTC

WORKDIR /build
COPY rust-toolchain.toml ./
RUN rustup show

COPY . .
RUN cargo build --release --target aarch64-unknown-linux-gnu

FROM scratch
COPY --from=builder /build/target/aarch64-unknown-linux-gnu/release/bhodl /bhodl
```

Build:
```bash
docker build -f Dockerfile.reproducible -t bhodl:1.0.0 --no-cache .
```

Pin base image by digest, not tag. Use `--no-cache` for clean state. Output binary should be reproducible across runs.

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Embedding `Date::now()` in build | Different binary each build | Use `SOURCE_DATE_EPOCH` |
| Username/hostname in build artifacts | Binary differs per builder | Strip via `--remap-path-prefix` etc. |
| Floating Rust toolchain (`stable`) | Compiler updates change output | Pin exact version (`1.85.0`) |
| Loose `Cargo.toml` versions (`tokio = "1"`) | Patch upgrades change output | Commit `Cargo.lock` for reproducible binaries |
| Pulling deps fresh from registry on every build | Dep retracted/changed | Vendor deps or use `cargo build --offline` |
| Multi-threaded codegen (`codegen-units > 1`) | Order-dependent output | `codegen-units = 1` for release |
| Nondeterministic ProGuard/R8 rules | Different obfuscation order | Pin AGP + KSP versions, deterministic seeds |
| Stripping debug info post-build inconsistently | Sometimes stripped, sometimes not | Strip in build profile |
| `tar` without `--mtime=@$SOURCE_DATE_EPOCH` | Archive timestamps vary | Always set mtime |
| Glob ordering in zip/tar | Filesystem-dependent | Sort file list explicitly |
| Building on host system without container | Drift over time | Use Docker/Guix/Nix for hermeticity |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `cmp` shows diff after second build | Some non-determinism remaining | `diffoscope` to find source |
| Binary differs in `.debug_*` sections | Build path leak | `--remap-path-prefix` (Rust) / `-fdebug-prefix-map` (clang) |
| Zip files differ | File order or compression | Use `zip -X -r` and sort input |
| `Cargo.lock` not consistent across runs | Auto-update on build | Commit lock file, use `--locked` flag |
| Same `Cargo.lock` produces diff binaries | Toolchain version drift | Pin via `rust-toolchain.toml` |
| AAB differs across builds | R8 nondeterminism | Pin AGP, set `-Pandroid.useAndroidX=true`, deterministic R8 mode |
| iOS dSYM differs | Build server hostname | Best-effort: post-process or skip dSYM signing |
| diffoscope reports `META-INF/MANIFEST.MF` differs | JAR build timestamps | `Set-MainAttribute Manifest-Build-Jdk-Spec` to fixed |
| Different output on Linux vs macOS host | Cross-toolchain divergence | Build only on one platform per target |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Artifact signing | `security/sigstore-cosign` |
| Cross-compile mechanics | `build-tools/rust-cross-compile` |
| Gradle KMP setup | `build-tools/gradle-kmp` |
| Standard CI/CD without reproducibility | Generic CI/CD skill |
| Apple App Store submission | Apple-specific (signing irreproducible by design) |
