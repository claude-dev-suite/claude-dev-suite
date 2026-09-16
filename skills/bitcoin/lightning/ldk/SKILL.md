---
name: lightning-ldk
description: |
  LDK (Lightning Dev Kit): modular Rust crates for building custom
  Lightning apps. ldk-node for opinionated quick-start.
  ChannelManager, ChainMonitor, Router, async signer, persistence.
  USE WHEN: embedding Lightning into mobile/desktop apps, building
  custom Lightning logic, scaling beyond LND-style daemon.
allowed-tools: Read, Grep, Glob
---

# LDK (Lightning Dev Kit)

LDK is a **library**, not a daemon. Provides Rust crates with C/Swift/
Kotlin/JS bindings. See "Use cases" below for who ships it.

LDK is developed under the `lightningdevkit` GitHub org — it is **not**
a Lightning Labs project (Lightning Labs ships LND, Loop, Pool and
Taproot Assets). Dual-licensed Apache-2.0 / MIT.

Versions as of September 2026: the core `lightning` crate is **0.2.6**
(2026-09-09), with **0.3.0-rc1** (2026-08-31) in release-candidate;
`ldk-node` is **0.7.0** (2025-12-03). The long `0.0.x` line ended at
0.0.125 (2024-10-14) and was succeeded by 0.1.0 (2025-01-16), so any
`0.0.x` version floor you see quoted predates the current API.

## Crates (selected)

- `lightning` — core protocol logic.
- `lightning-net-tokio` — async TCP transport.
- `lightning-persister` — file-based persistence.
- `lightning-background-processor` — background task driver.
- `lightning-block-sync` — chain sync.
- `lightning-transaction-sync` — alternative tx-only sync.
- `lightning-rapid-gossip-sync` — fast gossip via signed snapshot.
- `lightning-invoice` — BOLT11 invoice handling.
- `lightning-dns-resolver` — bLIP-32 onion-message DNSSEC resolution,
  built on the `dnssec-prover` crate. Versioned on its own track, at
  0.3.1 (2026-06-19) while the core crate is on the 0.2 line.
- `lightning-payer-proof` — BOLT 12 payer-proof verification. In the
  workspace on `main` for the 0.3 line and not yet released: crates.io
  holds only a 0.0.1 name placeholder (2026-08-20, described as a
  "Dummy package for name hold") as of September 2026.
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
// ldk-node 0.7.0 (2025-12-03): setters take &mut self, so build the
// Builder in place rather than chaining off Builder::new().
use ldk_node::bitcoin::Network;
use ldk_node::lightning_invoice::{Bolt11InvoiceDescription, Description};
use ldk_node::Builder;

let mut builder = Builder::new();
builder.set_network(Network::Bitcoin);
builder.set_chain_source_esplora("https://blockstream.info/api".to_string(), None);
builder.set_storage_dir_path("/path/to/data".to_string());
let node = builder.build().unwrap();
node.start().unwrap();

// Use the node
let address = node.onchain_payment().new_address().unwrap();
let desc = Bolt11InvoiceDescription::Direct(
    Description::new("desc".to_string()).unwrap(),
);
let invoice = node.bolt11_payment().receive(amount_msat, &desc, 3600).unwrap();
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
  (Mutiny did this; see "Use cases").
- **Trustless replication**: VSS (Versioned Storage Service) — the LDK
  project's own encrypted cloud storage service
  (`lightningdevkit/vss-server`, Apache-2.0), not a Lightning Labs
  product. `ldk-node` 0.7.0 can persist channel state to a VSS server.

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

Featured on lightningdevkit.org's homepage as of September 2026:
- **Alby Hub** — self-custodial LN hub.
- **Cash App** — backend LN.
- **Lexe** — hosted self-custodial LDK nodes.
- **Lightspark** — LN infrastructure.

That strip is a highlight reel, not the full user list: the site's
case-studies page enumerates 26 projects as of September 2026, among
them Bitkit, Fedimint, LNDK, Megalith, Sensei, Stable Channels, TEOS,
VLS, Voltage, Zeus and zinqq.

Not on that page (September 2026):
- **Mutiny Wallet** — browser-based LN via WASM + LDK. Historical: the
  `MutinyWallet/mutiny-web` repo is archived, last commit September 2024
  (checked September 2026).

Not LDK, despite frequent confusion:
- **Phoenix** (ACINQ) — built on ACINQ's `lightning-kmp`, not LDK.
- **Greenlight** (Blockstream) — CLN-based.
- **Casa** — no LDK link found, and Casa is absent from the case-studies
  page. Casa's only Lightning product was the Casa Node / Sats App,
  which ran **LND** (`Casa/Casa-Node-API`: "an API into Bitcoind and
  LND"; repo archived, last push July 2020) and was sunset 2021-06-30.
  casa.io advertises no Lightning product as of September 2026.

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

## Version floor and security history (as of September 2026)

LDK files no GitHub Security Advisories and cuts no GitHub Releases;
the `## Security` sections of `CHANGELOG.md` are the advisory channel,
and a fresh patch release's entry lands on its tag before `main`.
Per-release detail, the 0.1/0.2 backport pattern and the lockfile
mechanics are in the companion Phase B article
`knowledge/bitcoin/lightning/ldk/release-lines-deep.md`.

- **0.2.6 (2026-09-09) is the floor on the 0.2 line.** It fixes a
  fee-inflation bug letting a malicious splice counterparty make us
  over-allocate fee into *their* output when we contribute to a splice
  (#4905), and a denial-of-service where a bogus HTLC rejected
  immediately after a second HTLC with the same `payment_hash` was
  successfully forwarded could leave `ChannelManager` in a state that
  fails deserialization — i.e. the node does not restart (#4982).
- **0.2.5 and 0.1.12 (both dated 2026-08-04, published 2026-08-05)**
  fixed an on-chain funds-theft vulnerability for forwarding nodes that
  accept channels from untrusted peers: `ChannelMonitor` confused two
  HTLCs with equal `payment_hash` and amount while processing an
  un-revoked counterparty's claim, resolving them incorrectly (#4854).
  The same releases fixed several remote-panic DoS vectors — oversized
  protocol messages, invalid onion-message reply paths naming us as
  introduction point, reorg-time claim batching — and the limit of 50
  peers with unfunded channels not being enforced against an
  `open_channel` flood. Reported by Project Loupe and Kyle W. Santiago.
- **0.2.3 / 0.1.10 (2026-06-18)** are superseded but worth knowing:
  anchor-reserve underestimates that could leave a node unable to
  force-close properly, `possiblyrandom` not generating random data
  unless explicitly configured (HashDoS by default), and several
  remotely-triggerable panics. Most of it credited to Project Loupe.
- **The 0.1 line got no backport of the 0.2.6 fixes** — v0.1.12 is
  still the newest 0.1 tag as of September 2026, so it remains the
  floor on the 0.1 line. #4905 is splice-only and 0.1 has no splicing,
  so it has no 0.1 counterpart; upstream says nothing either way about
  whether #4982 reaches 0.1.
- `ldk-node` 0.7.0's manifest requires `lightning = "0.2.0"`, a caret
  requirement: a fresh resolve picks up 0.2.6, but an existing
  `Cargo.lock` needs `cargo update -p lightning` to actually land on
  it. Check the lockfile, not the manifest. The `lightning-*` satellite
  crates are separately versioned and must move as a set.

## Migrating to 0.3 (release candidate as of September 2026)

`lightning` 0.3.0-rc1 (2026-08-31) changes defaults and invalidates
some persisted state. Plan for:

- `ChannelHandshakeConfig::negotiate_anchors_zero_fee_htlc_tx` now
  defaults to `true`.
- `UserConfig::manually_accept_inbound_channels` is removed — it is
  always on, so inbound channels must be examined in event handling.
  `ChannelHandshakeLimits::max_funding_satoshis` went with it.
- Payment metadata is now committed to in the payment secret, so
  **BOLT11 invoices already issued with payment metadata are
  invalidated on upgrade** (and newly issued ones on downgrade). This
  bites anyone holding long-lived invoices.
- Blinded-path receives are authenticated with a `ReceiveAuthKey`;
  0.3+ will not accept payments over blinded paths created by earlier
  versions. Existing BOLT12 offers stay valid; issued-but-unclaimed
  BOLT12 refunds do not.
- Splices can be RBF'd and can add and remove funds in the same splice.
  A splice negotiated on an earlier version cannot be RBF'd, and
  downgrade after an RBF is unsupported.
- MSRV rises to rustc 1.75.

During the 0.3 cycle primary `rust-lightning` development moved to
git.rust-bitcoin.org; GitHub remains a synchronised mirror with issues
forwarded.

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
