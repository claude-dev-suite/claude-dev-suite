---
name: bitcoin-libraries-bitcoinj
description: |
  bitcoinj: mature Java/Kotlin Bitcoin library. SPV node, wallet,
  HD derivation, used by BlueWallet (Android), older mobile wallets.
  USE WHEN: building JVM Bitcoin apps, Android-native wallet code.
allowed-tools: Read, Grep, Glob
---

# bitcoinj

Java/Kotlin Bitcoin library. Long-standing (since 2011). Used in
many JVM-based wallets.

Repo: `github.com/bitcoinj/bitcoinj`.

Current release: **0.17.1** (4 May 2026). Prior: 0.17 (21 February
2025), 0.16.5 (27 January 2025).

## Install

Maven:
```xml
<dependency>
    <groupId>org.bitcoinj</groupId>
    <artifactId>bitcoinj-core</artifactId>
    <version>0.17.1</version>
</dependency>
```

Gradle:
```gradle
implementation 'org.bitcoinj:bitcoinj-core:0.17.1'
```

**Do not ship 0.16.x or 0.15.x.** 0.17.1 fixes two verification
bypasses in `ScriptExecution.correctlySpends()` — GHSA-hfcf-v2f8-x9pc /
CVE-2026-44714, CVSS 7.5, disclosed 4 May 2026. The P2PKH and native
P2WPKH fast paths verify an attacker-supplied signature against an
attacker-supplied pubkey without checking that pubkey against the hash
committed in the `scriptPubKey`, so any keypair satisfies local
verification of arbitrary P2PKH/P2WPKH outputs. Affected: 0.15.x,
0.16.x and 0.17; patched only in 0.17.1 — there is no 0.16.x backport
(as of September 2026). Pure SPV never verifies input signatures and is
untouched, but anything calling `correctlySpends()` must upgrade.
0.17.1 also lowers the default fee to 10000 sat/vkB.

## Quick example

0.17 API (`Network`/`BitcoinNetwork` in place of `NetworkParameters`):

```java
import org.bitcoinj.base.Address;
import org.bitcoinj.base.BitcoinNetwork;
import org.bitcoinj.base.ScriptType;
import org.bitcoinj.core.PeerGroup;
import org.bitcoinj.net.discovery.DnsDiscovery;
import org.bitcoinj.wallet.Wallet;

Wallet wallet = Wallet.createDeterministic(BitcoinNetwork.MAINNET, ScriptType.P2WPKH);

Address addr = wallet.currentReceiveAddress();
System.out.println(addr.toString());

// Sync via SPV (BIP37 bloom filters — see pitfalls)
PeerGroup peerGroup = new PeerGroup(BitcoinNetwork.MAINNET, blockChain);
peerGroup.addPeerDiscovery(new DnsDiscovery(BitcoinNetwork.MAINNET));
peerGroup.start();
peerGroup.downloadBlockChain();
```

Parse a user-supplied address with `wallet.parseAddress(str)` or
`AddressParser.getDefault(network)`; the static
`Address.fromString(params, str)` is deprecated in 0.17.

## Migrating 0.16 -> 0.17

0.17 is a large breaking release. Per its release notes:

- `NetworkParameters` aspects extracted to a `Network` interface and
  `BitcoinNetwork` enum; "prod"/"prodnet" is now `BitcoinNetwork.MAINNET`.
- New `AddressParser` replaces the static `Address.fromString()`
  constructors.
- All Guava `ListenableFuture` usage migrated to `CompletableFuture`
  (transitional `ListenableCompletableFuture` implements both; the Guava
  form goes away after 0.17).
- New packages `org.bitcoinj.base` (fundamental types, no Guava — becomes
  its own module in 0.18) and `org.bitcoinj.crypto` (no direct BouncyCastle
  in the crypto API; `AesKey` replaces BC `KeyParameter`).
- `Script.ScriptType` is now `org.bitcoinj.base.ScriptType`; `Coin` and
  `Address` moved from `org.bitcoinj.core` to `org.bitcoinj.base`.
- Removed: all database-backed block stores, `HttpDiscovery` (use
  `DnsDiscovery` or a hardcoded seed node), `GetUTXOsMessage`/`UTXOsMessage`,
  `Serializable`/`Cloneable`, married key chains, the basic -> deterministic
  keychain upgrade path.
- Requirements rise: JDK 11+ to build; Java 11 for every module except
  bitcoinj-core (still Java 8); Android API level 26 (Android 8.0) for
  bitcoinj-core.

## Features

- HD wallet (BIP32/39/44).
- SPV / BIP37 (deprecated bloom filter SPV). No BIP157/158 client;
  `Services.NODE_COMPACT_FILTERS` is only a service-bit constant.
- Tx construction + signing.
- Network discovery.
- Coin selection.

## Compared

| Aspect | bitcoinj | bdk-jvm |
|--------|----------|---------|
| Language | Java | Java/Kotlin |
| Foundation | Pure Java | Rust BDK via JNI |
| Maturity | 14+ years | newer |
| Descriptor support | Limited | Native |
| SegWit | P2WPKH wallets (send + receive) | Full |
| Taproot | Send-only to P2TR (0.17.1) | Full |

Taproot detail: `ScriptType.P2TR` exists and `ScriptPattern`/`SegwitAddress`
handle P2TR outputs, so you can pay a `bc1p...` address. But
`DeterministicKeyChain` still rejects any `outputScriptType` other than
P2PKH or P2WPKH and there is no Schnorr signing, so a bitcoinj wallet
cannot receive to or spend from P2TR — verified against the v0.17.1 source
in September 2026. The 0.16 release notes ("send to P2TR addresses;
receiving and spending ... in a future release") still describe 0.17.1.

For new projects, **bdk-jvm** is generally recommended. bitcoinj
has better adoption for legacy / Android-native cases.

## Use cases

- Android wallets (legacy).
- JVM backend services.
- Educational — readable Java code.

## Common pitfalls

- BIP37 SPV is **insecure** for privacy (filter-based deanon).
- Slower to adopt new BIPs (Taproot receive/spend still missing as of
  0.17.1, September 2026).
- Memory-heavy: not great for resource-constrained Android.

## See also

- [bdk-jvm/SKILL.md](../bdk-jvm/SKILL.md)
- [../../wallets/hd/SKILL.md](../../wallets/hd/SKILL.md)
