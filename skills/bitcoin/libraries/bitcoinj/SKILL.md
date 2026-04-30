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

## Install

Maven:
```xml
<dependency>
    <groupId>org.bitcoinj</groupId>
    <artifactId>bitcoinj-core</artifactId>
    <version>0.16.4</version>
</dependency>
```

Gradle:
```gradle
implementation 'org.bitcoinj:bitcoinj-core:0.16.4'
```

## Quick example

```java
import org.bitcoinj.core.*;
import org.bitcoinj.params.*;
import org.bitcoinj.wallet.Wallet;

NetworkParameters params = MainNetParams.get();
Wallet wallet = Wallet.createDeterministic(params, Script.ScriptType.P2WPKH);

Address addr = wallet.currentReceiveAddress();
System.out.println(addr.toString());

// Sync via SPV (Neutrino-equivalent via bitcoinj's BlockChain)
PeerGroup peerGroup = new PeerGroup(params, blockChain);
peerGroup.addPeerDiscovery(new DnsDiscovery(params));
peerGroup.start();
peerGroup.downloadBlockChain();
```

## Features

- HD wallet (BIP32/39/44).
- SPV / BIP37 (deprecated bloom filter SPV).
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
| SegWit | Partial | Full |
| Taproot | Limited | Full |

For new projects, **bdk-jvm** is generally recommended. bitcoinj
has better adoption for legacy / Android-native cases.

## Use cases

- Android wallets (legacy).
- JVM backend services.
- Educational — readable Java code.

## Common pitfalls

- BIP37 SPV is **insecure** for privacy (filter-based deanon).
- Slower to adopt new BIPs (Taproot, etc.).
- Memory-heavy: not great for resource-constrained Android.

## See also

- [bdk-jvm/SKILL.md](../bdk-jvm/SKILL.md)
- [../../wallets/hd/SKILL.md](../../wallets/hd/SKILL.md)
