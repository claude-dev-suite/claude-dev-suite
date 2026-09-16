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

Two repos, as of September 2026: `github.com/bitcoindevkit/bdk_wallet`
holds the `bdk_wallet` crate (split out of the monorepo in April 2025),
`github.com/bitcoindevkit/bdk` holds the chain crates (`bdk_core`,
`bdk_chain`, `bdk_esplora`, `bdk_electrum`, `bdk_bitcoind_rpc`,
`bdk_file_store`).

## Install

```toml
# latest on crates.io as of September 2026
[dependencies]
bdk_wallet = "3.1"         # 3.1.0, June 2026; MSRV 1.85.0
bdk_esplora = "0.22"       # 0.22.2
bdk_electrum = "0.24"      # 0.24.0
bdk_bitcoind_rpc = "0.22"  # 0.22.0
```

The backend crates all depend on `bdk_core` 0.6.x, which is what
`bdk_wallet` 3.1 pulls in via `bdk_chain` 0.23.x — pick versions from
one release wave or the `bdk_core` types will not line up.

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

## What 3.0 added (April 2026)

- **Persistent UTXO locking** — `lock_outpoint` / `unlock_outpoint`,
  backed by a new `bdk_wallet_locked_outpoints` SQLite table.
- **Structured wallet events** — `apply_update_events` and friends
  return `Vec<WalletEvent>` (`ChainTipChanged`, `TxConfirmed`,
  `TxUnconfirmed`, `TxReplaced`, `TxDropped`).
- **`NetworkKind` adopted throughout** the codebase.
- **Caravan wallet format** import / export.
- **Migration utility** for SQLite databases created before 1.0.

3.1 (June 2026) adds `Wallet::sign_with_signers` and
`LoadParams::two_path_descriptor`. Teams not ready for 3.0 can take
`bdk_wallet` 2.4.0 (April 2026), which backports the pre-1.0 SQLite
migration helper and the event-tracking methods to the 2.x line.

## Bindings

All generated from UniFFI bindings over `bdk_wallet`, so they expose
the same API surface. Swift and Android ship out of the `bdk-ffi`
repo; the rest were split into their own repos during Q3 2025 to make
them easier to contribute to.

- **bdk-swift** — iOS / macOS (in `bdk-ffi`).
- **bdk-android** — Android / Kotlin (in `bdk-ffi`).
- **bdk-jvm** — Kotlin / Java on the JVM (Maven Central).
- **bdk-python** — Python on Linux / macOS / Windows (PyPI).
- **bdk-rn** — TypeScript / React Native; v1.0.0 tagged May 2026
  but never published to npm — npm `bdk-rn` is still 0.30.0
  (November 2023) as of September 2026.
- **bdk-dart** — Dart / Flutter; release candidates on pub.dev as of
  September 2026, 1.0 not yet cut.

`bdk-ffi` 3.1.0 (September 2026) is the current binding release
carrying the 3.x API.

## Chain backends

- **Esplora** (HTTP REST).
- **Electrum** (TCP / TLS).
- **Bitcoin Core RPC** (`bdk_bitcoind_rpc`). For Core RPC outside a BDK
  wallet, see [corepc/SKILL.md](../corepc/SKILL.md).
- **Compact filters** (BIP157/158, via `bdk-kyoto`, 0.17.1 as of
  September 2026).

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

- Docs and tutorials pinned to 1.x: the crate has gone 1.0 (December
  2024) → 2.0 (June 2025) → 3.0 (April 2026) → 3.1 (June 2026), so
  copy-pasted snippets are often two majors behind.
- Persistence must match wallet version (incompatible across major
  versions). 3.0 adds a `bdk_wallet_locked_outpoints` SQLite table —
  a backwards-compatible migration, unlike earlier major bumps.
- Async vs sync APIs: separate crates.

## See also

- [rust-bitcoin/SKILL.md](../rust-bitcoin/SKILL.md)
- [bdk-python/SKILL.md](../bdk-python/SKILL.md)
- [bdk-jvm/SKILL.md](../bdk-jvm/SKILL.md)
- [miniscript-rs/SKILL.md](../miniscript-rs/SKILL.md)
