---
name: bitcoin-libraries-ldk
description: |
  Lightning Dev Kit (LDK): modular Rust crates for embedding Lightning
  in apps. ldk-node for opinionated quick-start. Bindings to Swift /
  Kotlin / Python.
  USE WHEN: embedding Lightning in mobile/desktop apps, building
  custom LN logic.
allowed-tools: Read, Grep, Glob
---

# LDK (Lightning Dev Kit)

Modular Rust library for Lightning. Used by Cash App, Casa, ldk-node,
more. Mutiny Wallet was a prominent early user; the shutdown was
announced 2024-08-05 and the hosted wallet closed 2024-12-31. Its
repos took their last commits in September 2024 and are archived
today, so treat Mutiny references below as history, not as a live
deployment.

See full overview at [../../lightning/ldk/SKILL.md](../../lightning/ldk/SKILL.md).

## Crates

- `lightning` — core protocol logic.
- `lightning-net-tokio` — async TCP transport.
- `lightning-persister` — file persistence.
- `lightning-background-processor` — task driver.
- `lightning-block-sync` — chain sync via bitcoind RPC.
- `lightning-transaction-sync` — chain sync via Esplora / Electrum.
- `lightning-rapid-gossip-sync` — fast initial gossip.
- `lightning-invoice` — BOLT11 invoice handling.
- `ldk-node` — opinionated bundled crate.
- `lightning-liquidity` — LSP client/server.

## Release lines (as of September 2026)

- `lightning` and the sibling core crates — 0.2.6 (2026-09-09).
  LDK 0.1 (January 2025) was the API-stabilisation milestone; since
  then the project ships features in minor releases and backports
  fixes as patch releases on older minor lines.
- `lightning-invoice` — 0.34.1 (June 2026).
- `ldk-node` — 0.7.0 (2025-12-03), which depends on the `lightning`
  0.2 line. `main` carries an unreleased 0.8.0.
- Next major: `lightning` 0.3.0-rc1 and `lightning-invoice`
  0.35.0-rc1, both published 2026-08-31. No stable 0.3 yet.

ldk-node 0.7.0 added experimental channel splicing, async payments
(serving and paying static invoices), a Bitcoin Core REST chain
source, and persisted liquidity-service state.

## ldk-node quickstart

```toml
[dependencies]
ldk-node = "0.7"
```

```rust
use ldk_node::Builder;
use ldk_node::bitcoin::Network;
use ldk_node::lightning_invoice::{Bolt11InvoiceDescription, Description};

let mut builder = Builder::new();
builder.set_network(Network::Bitcoin);
builder.set_chain_source_esplora(
    "https://mempool.space/api".to_string(), None);
builder.set_storage_dir_path("/path/to/data".to_string());

let node = builder.build()?;
node.start()?;

let description = Bolt11InvoiceDescription::Direct(
    Description::new("Test".to_string())?);
let invoice = node.bolt11_payment().receive(
    100_000,        // 100k msat
    &description, 3600,
)?;
```

`Builder` setters take `&mut self`, so build the builder in a `let
mut` binding rather than chaining off a temporary. `Network` is
re-exported as `ldk_node::bitcoin::Network`, not `ldk_node::Network`.

## Bindings (as of September 2026)

Two separate binding families exist and are not interchangeable:
ldk-node 0.7.0 ships UniFFI bindings for Swift, Kotlin and Python
(plus community Flutter bindings), while an older family is generated
directly over the raw `lightning` crate on top of `ldk-c-bindings`.
Each entry below says which family it belongs to.

- **ldk-swift** — iOS/macOS, generated over raw `lightning`, not over
  ldk-node; the SwiftPM product is named `LightningDevKit`. Not
  archived, but no release or commit since 0.0.125 (2025-02-27), so it
  is still on the pre-0.1 `0.0.x` line and does not track
  `lightning` 0.2.
- **ldk-garbagecollected** — Java, C# and TypeScript over raw
  `lightning`. Java ships as `org.lightningdevkit:ldk-java` 0.2.5.0 on
  Maven Central and TypeScript/WASM as the npm `lightningdevkit`
  package 0.2.5-0, both published 2026-09-01. There is no separate
  Kotlin/Android binding over raw `lightning` — Android consumers use
  the Java bindings.
- **ldk-node-jvm / ldk-node-android** — ldk-node's UniFFI Kotlin
  bindings, both 0.7.0 on Maven Central (2025-12-03).
- **ldk-node-flutter** — Flutter over ldk-node, maintained by
  LtbLightning.

`lightningdevkit/ldk-nodejs` — an older Node.js binding — is archived
and took its last commit in May 2022. The maintained JS/WASM path is
the `lightningdevkit` npm package above, which wraps raw `lightning`;
there is still no ldk-node WASM/JS binding.

## Use cases

- Mobile Lightning wallets.
- Browser-based LN — Mutiny compiled `lightning` to WASM before
  shutting down in 2024; the pattern is still viable, but there is no
  maintained ldk-node WASM/JS binding to build on.
- Custom backend services with Lightning embedded.

## Compared

See [../../lightning/ldk/SKILL.md](../../lightning/ldk/SKILL.md) for
LND/CLN comparison and full feature matrix.

## Version floor and security history (as of September 2026)

- **0.2.6 (2026-09-09) is the floor on the 0.2 line.** It fixes a
  denial-of-service where a bogus HTLC that is immediately rejected,
  after a second HTLC with the same `payment_hash` was already
  forwarded, could leave the `ChannelManager` unreadable on
  deserialization; and a fee-inflation bug letting a malicious splice
  counterparty make us over-allocate fee into their output when we
  contribute to a splice.
- **0.2.5 and 0.1.12 (both 2026-08-05)** fixed an on-chain
  funds-theft vulnerability for forwarding nodes that accept channels
  from untrusted peers — `ChannelMonitor` confused two HTLCs with
  equal `payment_hash` and amount and resolved them incorrectly —
  plus several remote-panic DoS vectors (oversized protocol messages,
  invalid onion-message reply paths, reorg-time claim batching, and
  the 50-unfunded-peer limit not being enforced).
- **0.2.3 (2026-06-18)** is superseded by the 0.2.6 floor but worth
  knowing about: it fixed anchor-reserve underestimates that could
  leave a node unable to properly force-close, `possiblyrandom` not
  generating random data unless explicitly configured (leaving LDK
  open to HashDoS), and several remote-triggerable panics.
- The 0.1 line received no backport of the 0.2.6 fixes, so 0.1.12 is
  not a current floor. Move to 0.2.6.
- ldk-node 0.7.0's manifest requires `lightning` 0.2.0, which is a
  caret requirement — a fresh resolve picks up 0.2.6, but an existing
  `Cargo.lock` needs `cargo update -p lightning` to actually land on
  it. Check the lockfile, not the manifest.

## Migrating to 0.3 (release candidate as of September 2026)

`lightning` 0.3.0-rc1 changes defaults and invalidates some persisted
state. Plan for:

- `ChannelHandshakeConfig::negotiate_anchors_zero_fee_htlc_tx` now
  defaults to `true`.
- `UserConfig::manually_accept_inbound_channels` is removed — it is
  always on, so inbound channels must be accepted explicitly from
  event handling. `ChannelHandshakeLimits::max_funding_satoshis` went
  with it.
- Payment metadata is now committed to in the payment secret, so
  **BOLT11 invoices already issued with payment metadata are
  invalidated on upgrade** (and newly issued ones on downgrade). This
  bites anyone holding long-lived invoices.
- Blinded-path receives are authenticated with a `ReceiveAuthKey`;
  0.3+ will not accept payments over blinded paths created by earlier
  versions. Existing BOLT12 offers stay valid; issued-but-unclaimed
  BOLT12 refunds do not.
- Splices can be RBF'd and can add and remove funds in the same
  splice. A splice negotiated on an earlier version cannot be RBF'd,
  and downgrade after an RBF is unsupported.
- MSRV rises to rustc 1.75.

During the 0.3 cycle primary `rust-lightning` development moved to
git.rust-bitcoin.org; GitHub remains a synchronised mirror with
issues forwarded.

## Common pitfalls

- `Persist` trait misimplementation → state corruption.
- Async signer race conditions.
- Version migrations require careful state migration.
- Pinning a major without tracking its patch line — LDK backports
  security fixes as patch releases, so `0.2` alone is not a floor.

## See also

- [../../lightning/ldk/SKILL.md](../../lightning/ldk/SKILL.md)
- [rust-bitcoin/SKILL.md](../rust-bitcoin/SKILL.md)
- [bdk/SKILL.md](../bdk/SKILL.md)
