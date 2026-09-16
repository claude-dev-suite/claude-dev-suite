---
name: bitcoin-l2-taproot-assets
description: |
  Taproot Assets (formerly Taro) by Lightning Labs: client-side
  validation asset protocol on Bitcoin + Lightning. Multi-asset
  Lightning channels, AddressV2, multi-hop asset routing.
  USE WHEN: issuing/transferring assets on Bitcoin, integrating
  asset Lightning channels, evaluating TAP vs RGB.
allowed-tools: Read, Grep, Glob
---

# Taproot Assets (TAP)

Lightning Labs' protocol for issuing and transferring **assets** on
Bitcoin and routing them over Lightning. Assets live in Taproot
outputs; transfers use client-side validation.

Repo: `github.com/lightninglabs/taproot-assets` (Go).

## Concept

- An asset is "minted" by committing its definition to a Taproot
  leaf script.
- Asset state lives **off-chain** in client wallets; chain just
  commits hashes.
- Transfers reveal Merkle proofs of ownership (similar to RGB's
  client-side validation).
- For privacy: only the parties involved in a transfer see asset
  amounts.

## Components

### tapd (daemon)
Companion to LND. Runs alongside, provides:
- Asset minting RPC.
- Asset transfer handling.
- Address generation (TAP-aware).
- Lightning channel asset support.

### Assets

Each asset has:
- **Asset ID** — derived from minting tx + script.
- **Group key** — optional, for collections of related assets.
- **Universe** — the public registry of asset metadata.
- **Genesis** — initial issuance event.

## Lightning integration (v0.6 / v0.7+)

Multi-asset Lightning channels:
- Channel can hold BTC + multiple assets.
- Invoices priced in asset amount; channel routing converts via
  Lightning's existing path.
- Multi-hop asset payments routed through bitcoin liquidity.

### v0.8 features (v0.8.0 June 2026 → v0.8.3 September 2026)

- **Wallet backup/restore**: three modes — `raw` (v1, complete proof
  files), `compact` (v2, chain-derivable proof fields stripped and
  rebuilt on import), `optimistic` (v3, no proofs at all, refetched
  from a universe federation server on import). Covers the Taproot
  Assets layer only; a restore still needs the matching lnd wallet.
- **Orphan-UTXO garbage collection**: tombstone and burn outputs are
  swept on every burn, transfer and `AnchorVirtualPsbts`. On by
  default; disable with `wallet.disable-sweep-orphan-utxos`.
- **Asset forwarding history**: routing nodes log asset forward events
  and query them with `tapcli rfq forwardinghistory`. Wants lnd started
  with `--store-final-htlc-resolutions` for full coverage.
- **RFQ limit orders**: quotes carry limit prices (`asset_rate_limit`)
  and minimum fill sizes (`asset_min_amt` / `payment_min_amt`), an
  execution policy (IOC by default, or FOK), and a negotiated fill
  quantity in the accept message.
- **PortfolioPilot**: RFQ pricing, hedging and acceptance policy can be
  delegated to an external service via
  `experimental.rfq.portfoliopilotaddress`.
- **Burn by group key**: `tapcli assets burn --group_key` burns units
  across every issuance in a group.
- **Auth-mailbox cleanup**: messages whose claimed outpoints are spent
  are deleted server-side; receivers can call `RemoveMessage`.
- v0.8.1 (Aug 2026) added `ListInvoices` / `ListPayments` and the
  streaming `SubscribeInvoices` / `SubscribePayments` / `TrackPayment`
  RPCs on the `TaprootAssetChannels` service. v0.8.2 (Aug 2026) and
  v0.8.3 (Sept 2026) are fix and performance releases (MS-SMT proof
  verification, universe federation push, RFQ/HTLC races).

### v0.8 breaking changes

- RFQ option `experimental.rfq.skipacceptquotepricecheck` renamed to
  `experimental.rfq.skipquoteacceptverify`.
- `BurnAssetRequest` now identifies the asset with an `AssetSpecifier`
  (asset ID **or** group key); the old `asset_id` / `asset_id_str`
  oneof fields and the singular `burn_proof` response field are
  deprecated in favour of repeated `burn_proofs`.
- `universe.multiverse-caches.proofs-per-universe` removed in favour of
  `universe.multiverse-caches.max-proof-cache-size`, which bounds the
  proof cache by memory (e.g. `64MB`) rather than proof count.
- Every v0.8.x release ships a **one-way DB migration**: downgrading to
  an earlier tapd is not supported. Back up the tapd database first.

### v0.7 features (November 2025)

- **AddressV2**: static, reusable Taproot Assets addresses with grouped
  assets and zero-amount-friendly support.
- **Set-and-forget asset layer**: minting + LN integration unified
  workflow.

### v0.6 features (June 2025)

- "Decentralized FX": Lightning routes assets via BTC, enabling
  cross-asset payments with conversion at routing nodes.

## Compared to RGB

| Aspect | Taproot Assets | RGB |
|--------|----------------|-----|
| Backing | Lightning Labs | LNP/BP Standards Association |
| LN integration | Native (tapd + LND) | rgb-lightning-node |
| Asset model | Single-issuer + multi-issuance | Schema-based, contracts |
| State validation | Sparse-merkle commitments | Client-side validation |
| Maturity | v0.8.3 production (Sept 2026) | rgb-lightning beta (as of late 2025) |
| LND ecosystem | Tight | Loose |

## Use cases

- **Stablecoins on Bitcoin** — Tether announced USDT-on-TAP roadmap.
- **Tokenized funds / securities** — regulated asset issuance.
- **Reward points / loyalty tokens** with LN spendability.
- **NFT-like collectibles** — though not the primary focus.

## API

```bash
# Mint an asset
tapcli assets mint --type normal \
  --name "USDC-Test" --supply 1000000 --meta "..."

# Generate receive address
tapcli addrs new --asset_id <id> --amt 1000

# Send asset
tapcli assets send --addrs <recipient_addr>

# Lightning asset invoice
tapcli ln invoice --asset_id <id> --amount 100
```

## Universe

Asset metadata + proofs are published to **universes** — server-side
indexers that act as discovery layer:
- Public asset registries (Lightning Labs runs one).
- Per-issuer universes.
- Federated universes (multiple servers cross-replicate).

Wallets query universes to verify asset existence and lookup metadata.

## Implementation status

- **tapd** — production for asset issuance + transfer (mainnet).
- **LND integration** — production for asset Lightning channels.
  tapd v0.8.3 (Sept 2026) builds against lnd v0.21.3-beta.
- **Wallets**:
  - Lightning Labs' Lit (Lightning Terminal) — UI.
  - Stripe's BTCPay integration — partial.

## Common bugs

- Asset proof validation requires complete history; missing proof
  fragment = unable to verify.
- LND + tapd version mismatch → channel asset features fail (tapd
  v0.8.3 tracks lnd v0.21.3-beta, Sept 2026).
- Downgrade hazard: every v0.8.x release applies a one-way DB
  migration. Rolling tapd back to an earlier version after upgrading
  is unsupported — snapshot the DB before you upgrade.
- Universe sync delay → outdated metadata in wallet.

## See also

- [rgb/SKILL.md](../rgb/SKILL.md)
- [liquid/SKILL.md](../liquid/SKILL.md)
- [../../lightning/lnd/SKILL.md](../../lightning/lnd/SKILL.md)
- [../../libraries/tapd-go/SKILL.md](../../libraries/tapd-go/SKILL.md)
