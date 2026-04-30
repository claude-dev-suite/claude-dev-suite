---
name: bitcoin-libraries-bdk
description: |
  Bitcoin Dev Kit (BDK): high-level Rust wallet library. Descriptor-based
  wallets, multiple chain backends (Esplora, Electrum, RPC), PSBT, fee
  estimation, coin selection. Bindings to Swift / Kotlin / Python /
  Flutter.
  USE WHEN: building wallets in Rust or via BDK bindings, integrating
  descriptor wallets into apps.
allowed-tools: Read, Grep, Glob
---

# BDK (Bitcoin Dev Kit)

High-level wallet library on top of rust-bitcoin + miniscript. Descriptor-
first; modular chain backends.

Repo: `github.com/bitcoindevkit/bdk`.

## Install

```toml
[dependencies]
bdk_wallet = "1.0"
bdk_esplora = "0.20"
bdk_electrum = "0.20"
bdk_bitcoind_rpc = "0.16"
```

## Quick example

```rust
use bdk_wallet::{Wallet, KeychainKind};
use bdk_wallet::bitcoin::Network;
use bdk_wallet::SignOptions;

let descriptor = "wpkh(xprv.../84h/0h/0h/0/*)";
let change_descriptor = "wpkh(xprv.../84h/0h/0h/1/*)";

let mut wallet = Wallet::create(descriptor, change_descriptor)
    .network(Network::Bitcoin)
    .create_wallet_no_persist()?;

// Sync with chain
let esplora = esplora_client::Builder::new("https://mempool.space/api").build_async()?;
let request = wallet.start_full_scan().build();
let update = esplora.full_scan(request, 5, 1).await?;
wallet.apply_update(update)?;

// Build a tx
let mut tx_builder = wallet.build_tx();
tx_builder.add_recipient(addr.script_pubkey(), Amount::from_sat(10_000));
let mut psbt = tx_builder.finish()?;

// Sign
wallet.sign(&mut psbt, SignOptions::default())?;
let tx = psbt.extract_tx()?;
```

## Bindings

- **bdk-swift** — iOS / macOS.
- **bdk-kotlin** / **bdk-android** — Android / JVM.
- **bdkpython** — Python.
- **bdk-flutter** — Dart / Flutter.
- **bdk-jvm** — Java / Kotlin desktop.

All expose the same API surface, generated from UniFFI bindings.

## Chain backends

- **Esplora** (HTTP REST).
- **Electrum** (TCP / TLS).
- **Bitcoin Core RPC**.
- **Compact filters** (BIP157/158, via Neutrino).

Each backend has its own `start_full_scan` / `start_sync` flow.

## Use cases

- **Mobile wallets** (iOS/Android via bindings).
- **Custom Bitcoin apps** that need a battle-tested wallet engine.
- **Server-side wallet management** (custodial backends).

## Compared

| Aspect | BDK | rust-bitcoin only | LDK |
|--------|-----|-------------------|-----|
| Level | High (wallet) | Low (primitives) | Lightning |
| Descriptors | Native | Manual | n/a |
| Coin selection | Built-in | Manual | n/a |
| Persistence | Pluggable | None | Pluggable |

## Common pitfalls

- v0 → v1 API migration (changed significantly mid-2024-2025).
- Persistence must match wallet version (incompatible across major
  versions).
- Async vs sync APIs: separate crates.

## See also

- [rust-bitcoin/SKILL.md](../rust-bitcoin/SKILL.md)
- [bdk-python/SKILL.md](../bdk-python/SKILL.md)
- [bdk-jvm/SKILL.md](../bdk-jvm/SKILL.md)
- [miniscript-rs/SKILL.md](../miniscript-rs/SKILL.md)
