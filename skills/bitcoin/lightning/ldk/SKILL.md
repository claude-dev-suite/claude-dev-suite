---
name: lightning-ldk
description: |
  LDK (Lightning Dev Kit) by Lightning Labs: modular Rust crates for
  building custom Lightning apps. ldk-node for opinionated quick-start.
  ChannelManager, ChainMonitor, Router, async signer, persistence.
  USE WHEN: embedding Lightning into mobile/desktop apps, building
  custom Lightning logic, scaling beyond LND-style daemon.
allowed-tools: Read, Grep, Glob
---

# LDK (Lightning Dev Kit)

LDK is a **library**, not a daemon. Provides Rust crates with C/Swift/
Kotlin/JS bindings. Used by Mutiny Wallet, Cash App, Casa, ldk-node,
Phoenix (parts), etc.

## Crates (selected)

- `lightning` — core protocol logic.
- `lightning-net-tokio` — async TCP transport.
- `lightning-persister` — file-based persistence.
- `lightning-background-processor` — background task driver.
- `lightning-block-sync` — chain sync.
- `lightning-transaction-sync` — alternative tx-only sync.
- `lightning-rapid-gossip-sync` — fast gossip via signed snapshot.
- `lightning-invoice` — BOLT11 invoice handling.
- `ldk-node` — opinionated bundling for quick-start.
- `lightning-liquidity` — LSP client/server primitives.
- `bdk` integration crates.

## Core primitives

```rust
// Persistence trait
trait Persist<ChannelSigner> { ... }

// Channel manager — owns all channels
let chan_mgr = ChannelManager::new(...);

// Chain monitoring — watches outputs, force-close events
let chain_mon = ChainMonitor::new(...);

// Router — pathfinding
let router = DefaultRouter::new(...);

// Background processor — drives async tasks
BackgroundProcessor::start(...);
```

User code provides:
- **KeysManager** — produces/derives keys.
- **NetworkGraph** — channel graph storage.
- **EventHandler** — react to events (payment received, channel opened).
- **Persister** — save state to disk / DB.
- **FeeEstimator** — fee rate source.
- **BroadcasterInterface** — broadcast txs.

## ldk-node (quick-start)

```rust
use ldk_node::{Builder, Network};

let builder = Builder::new()
    .set_network(Network::Bitcoin)
    .set_chain_source_esplora("https://blockstream.info/api".into())
    .set_storage_dir_path("/path/to/data".into());
let node = builder.build().unwrap();
node.start().unwrap();

// Use the node
let address = node.onchain_payment().new_address().unwrap();
let invoice = node.bolt11_payment().receive(amount_msat, "desc", 3600).unwrap();
node.bolt11_payment().send(&invoice, None).unwrap();
```

`ldk-node` exposes a single API surface across Rust + Swift/Kotlin/JS
bindings.

## Async signer

For hardware wallets / remote signers:
```rust
trait NodeSigner { fn ecdh(&self, ...) -> Result<...>; ... }
trait ChannelSigner { fn sign_counterparty_commitment(&self, ...) -> ...; ... }
trait SignerProvider { fn derive_channel_signer(&self, ...) -> ChannelSigner; ... }
```

LDK supports async signing via `EventHandler::handle_event` returning
deferred sigs. Useful for hardware-wallet-backed Lightning.

## Persistence model

LDK doesn't dictate storage. Common backends:
- **File**: `lightning-persister` writes channel state to disk.
- **Database**: SQLite, PostgreSQL — implement `Persist` trait.
- **Cloud**: persist channel state encrypted to cloud storage
  (Mutiny does this).
- **Trustless replication**: VSS (Versioned Storage Service) — Lightning
  Labs' encrypted cloud storage protocol.

## Chain sync options

- **bitcoind RPC** — `lightning-block-sync` polls / ZMQs.
- **Esplora API** — `lightning-transaction-sync` via Esplora REST.
- **Electrum** — same crate, via Electrum protocol.
- **Neutrino (BIP157/158)** — light-client; for mobile.

Mobile uses Neutrino: lightning-block-sync downloads filters, scans
locally for UTXO matches, downloads only relevant blocks.

## Bindings

LDK provides:
- **Rust** native crates.
- **C** via `lightning-c-bindings`.
- **Swift / iOS** via `LDKSwift` and `LDKNode`.
- **Kotlin / Android** via `LDKKotlin` and `ldk-node-kotlin`.
- **JS / WASM** via `ldk-node-js` (experimental).

ldk-node specifically targets Swift/Kotlin/JS so mobile devs get a
single API.

## Use cases

- **Mutiny Wallet** — browser-based LN via WASM + LDK.
- **Cash App** — backend LN.
- **Casa** — vault + LN integration.
- **Phoenix** (partial) — uses LDK components.
- **Greenlight** (Blockstream) — alternative; CLN-based.

## Memory footprint

LDK is light: ~10-20 MB RAM for a typical mobile node. Bitcoin Core
+ LND can use 1+ GB. This is the main reason LDK dominates mobile.

## Comparing LDK to LND/CLN

| Aspect | LND/CLN | LDK |
|--------|---------|-----|
| Deployment | daemon | library, embedded |
| Mobile | no | yes (primary use) |
| Custom UI/logic | hard | easy (you own everything) |
| Default features | full | you choose |
| Memory | 200 MB+ | 10-20 MB |

## Common issues

- **`Persist` trait misimplementation**: missed updates → state
  corruption on restart.
- **Async signer race conditions**: signing requests racing with
  channel updates.
- **Chain sync gaps**: skipped blocks → channel state diverges.
- **ldk-node migration**: upgrading minor versions sometimes requires
  state migration; back up first.

## See also

- [bolts/SKILL.md](../bolts/SKILL.md)
- [channels/SKILL.md](../channels/SKILL.md)
- [../../libraries/ldk/SKILL.md](../../libraries/ldk/SKILL.md)
- [consumer-wallets/SKILL.md](../consumer-wallets/SKILL.md)
