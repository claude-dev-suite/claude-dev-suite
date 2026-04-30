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

Repos:
- `github.com/bitcoindevkit/bdk-jvm` (JVM desktop).
- `github.com/bitcoindevkit/bdk-android` (Android).

## Install

Gradle (Android):
```gradle
implementation 'org.bitcoindevkit:bdk-android:1.0.0'
```

Gradle (JVM):
```gradle
implementation 'org.bitcoindevkit:bdk-jvm:1.0.0'
```

## Quick example (Kotlin)

```kotlin
import org.bitcoindevkit.*

val descriptor = Descriptor("wpkh(xprv.../84h/0h/0h/0/*)", Network.BITCOIN)
val change = Descriptor("wpkh(xprv.../84h/0h/0h/1/*)", Network.BITCOIN)

val wallet = Wallet(descriptor, change, Network.BITCOIN, "/path/to/db")

val esplora = EsploraClient("https://mempool.space/api", null, 5, 100, null)
wallet.fullScan(esplora, 5, 1)

val addr = wallet.revealNextAddress(KeychainKind.EXTERNAL)
println(addr.address.asString())
```

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

- Native `.so` files per Android architecture; APK size grows.
- UniFFI bindings sometimes lag Rust by a version.

## See also

- [bdk/SKILL.md](../bdk/SKILL.md)
- [bdk-python/SKILL.md](../bdk-python/SKILL.md)
- [bitcoinj/SKILL.md](../bitcoinj/SKILL.md)
