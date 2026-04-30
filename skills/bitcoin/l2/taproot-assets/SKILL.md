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

### v0.7 features (Dec 2025)

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
| Maturity (late 2025) | v0.7 production | rgb-lightning beta |
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
- **LND integration** — production for asset Lightning channels
  (v0.7).
- **Wallets**:
  - Lightning Labs' Lit (Lightning Terminal) — UI.
  - Stripe's BTCPay integration — partial.

## Common bugs

- Asset proof validation requires complete history; missing proof
  fragment = unable to verify.
- LND + tapd version mismatch → channel asset features fail.
- Universe sync delay → outdated metadata in wallet.

## See also

- [rgb/SKILL.md](../rgb/SKILL.md)
- [liquid/SKILL.md](../liquid/SKILL.md)
- [../../lightning/lnd/SKILL.md](../../lightning/lnd/SKILL.md)
- [../../libraries/tapd-go/SKILL.md](../../libraries/tapd-go/SKILL.md)
