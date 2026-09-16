---
name: bitcoin-libraries-bdk-jvm
description: |
  bdk-jvm / bdk-android: Kotlin/Java bindings to BDK. Same descriptor-
  first wallet API. UniFFI-generated.
  USE WHEN: building JVM / Android wallets with BDK quality.
allowed-tools: Read, Grep, Glob
---

# bdk-jvm / bdk-android

JVM bindings to Rust BDK.

Repos (as of September 2026):
- `github.com/bitcoindevkit/bdk-jvm` (JVM desktop) — split out of `bdk-ffi`
  into its own repo in July 2025.
- `github.com/bitcoindevkit/bdk-ffi`, `bdk-android/` subdirectory (Android) —
  still built from the `bdk-ffi` monorepo.

## Install

Both artifacts are at 3.1.0 (September 2026), built on bdk-ffi 3.1.0 /
bdk_wallet 3.1.0 / uniffi 0.31.2.

Gradle (Android):
```gradle
implementation 'org.bitcoindevkit:bdk-android:3.1.0'
```

Gradle (JVM):
```gradle
implementation 'org.bitcoindevkit:bdk-jvm:3.1.0'
```

## Quick example (Kotlin)

```kotlin
import org.bitcoindevkit.*

// Since 3.0.0 (June 2026) the Descriptor constructor takes a NetworkKind.
val descriptor = Descriptor("wpkh(xprv.../84h/0h/0h/0/*)", NetworkKind.MAIN)
val change = Descriptor("wpkh(xprv.../84h/0h/0h/1/*)", NetworkKind.MAIN)

// Persistence is a Persister object, not a bare path string.
val persister = Persister.newSqlite("/path/to/db.sqlite")
val wallet = Wallet(descriptor, change, Network.BITCOIN, persister)

// Scans go through a request builder; the client never touches the wallet.
val esplora = EsploraClient("https://mempool.space/api")
val request = wallet.startFullScan().build()
wallet.applyUpdate(esplora.fullScan(request, 10uL, 1uL))
wallet.persist(persister)

val addr = wallet.revealNextAddress(KeychainKind.EXTERNAL)
println(addr.address)
```

Reopen an existing wallet with `Wallet.load(descriptor, change, persister)`;
`Wallet.createSingle(descriptor, network, persister)` builds a
single-descriptor wallet.

## Bindings

- Same API as Rust BDK and bdkpython.
- UniFFI auto-generates bindings.
- Coverage: ~95% of Rust BDK API.

## Use cases

- **Android wallets** — modern alternative to bitcoinj.
- **JVM desktop apps**.
- **Server-side JVM Bitcoin services**.

## Compared

See [bitcoinj/SKILL.md](../bitcoinj/SKILL.md) for comparison.

## Common pitfalls

- Native `.so` files per Android architecture; APK size grows. 3.1.0 ships
  `arm64-v8a`, `armeabi-v7a` and `x86_64` (32-bit `x86` is not built).
- UniFFI bindings sometimes lag Rust by a version.
- The two artifacts do not share a bytecode target: bdk-android 3.1.0 sets
  `minSdk` 24 and targets JVM 17, bdk-jvm 3.1.0 targets JVM 11.

## See also

- [bdk/SKILL.md](../bdk/SKILL.md)
- [bdk-python/SKILL.md](../bdk-python/SKILL.md)
- [bitcoinj/SKILL.md](../bitcoinj/SKILL.md)
