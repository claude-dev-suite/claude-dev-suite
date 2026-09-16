---
name: bitcoin-l2-counterparty
description: |
  Counterparty: legacy Bitcoin meta-protocol (2014) for assets, DEX,
  betting using OP_RETURN. Usage is largely historic, but the reference
  implementation still ships protocol upgrades (AMM pools, Taproot
  envelopes) as of September 2026.
  USE WHEN: dealing with legacy Counterparty assets, understanding
  pre-Ordinals asset ecosystem, evaluating obsolete patterns.
allowed-tools: Read, Grep, Glob
---

# Counterparty (XCP)

Counterparty is one of Bitcoin's earliest meta-protocols (2014). It
embeds asset / smart-contract metadata in Bitcoin transactions via
`OP_RETURN`, enabling token issuance, DEX trades, betting, and
asset management.

## Mechanics

- Counterparty data is embedded in `OP_RETURN` outputs of Bitcoin
  txs; since Counterparty Core v11.0.0 (May 2025), activating at
  block 902,000 (mined 20 June 2025), it can also ride in a Taproot
  envelope, and P2SH data encoding was removed.
- A separate Counterparty parser reads Bitcoin blockchain, extracts
  Counterparty events, maintains state.
- Native token: **XCP** (used for issuance fees, betting).
- Asset issuance: a named asset (4-12 base-26 characters, not starting
  with `A`) costs 0.5 XCP, burned. Numeric assets (`A` followed by an
  integer in [26^12+1, 2^64-1], i.e. 18-21 character names) are free,
  as are subassets since the `free_subassets` gate at mainnet block
  866,000.

## Major past events

- **Rare Pepes** (2016-2017): NFT-precursor on Counterparty (long
  before Ordinals).
- **SaruTobi** (mobile game with XCP economy).
- **PEPECASH** and other community tokens.

## Status

- Network is still operational (as of September 2026).
- Activity is **dramatically lower** than 2014-2017 peak.
- Most users have migrated to Ethereum / Stacks for new asset
  issuance.
- Ordinals + Runes effectively replaced Counterparty for new "Bitcoin
  native asset" use cases (with much higher activity).

## Why usage is mostly historic

- Newer protocols (Stacks, Liquid, Taproot Assets, RGB) and
  Ordinals/Runes provide better UX + more functionality for new
  issuance.
- Wallet and app tooling is thin next to the Ordinals ecosystem.
- Historically the encoding was `OP_RETURN`-only, so fees on larger
  messages were not competitive; Taproot envelope encoding landed in
  v11.0.0 (May 2025) specifically to reduce that cost.
- The *implementation* is not dormant — see "Protocol development
  (2025-2026)" below.

## Protocol development (2025-2026)

The "historic" framing applies to usage, not the codebase. Releases
below are current as of September 2026.

- **v11.0.0** (27 May 2025, gate at mainnet block 902,000) — Taproot
  envelope encoding, P2SH data encoding removed, CBOR for sweep /
  enhanced send / fairminter / fairmint / issuance / broadcast,
  Bech32 P2WSH+P2TR fixes, optional inscription on compose
  (`inscription`, `mime_type`).
- **v11.1.0** (20 May 2026, `amm_pools` and `indefinite_orders` gates
  at mainnet block 952,800) — constant-product AMM pools with LP
  tokens, message types `pooldeposit` (120) / `poolwithdraw` (121),
  DEX `match()` interleaving pool fills with the resting book;
  indefinite orders (`expiration=0`), `MAX_EXPIRATION` 8064 -> 65535.
- **v11.2.0** (8 July 2026, gates at mainnet block 961,100) — gated
  fixes for sweep zero balances, P2MS UTXO addresses, AMM price
  routing and deposit overflow; ledger DB compaction, stricter API
  parameter validation.
- **v11.3.0** (16 August 2026) — hardening after the 2026-07-15 API
  incident, legacy v1 JSON-RPC off by default (`--enable-api-v1`),
  `correct_transaction_fee` gate at mainnet block 966,200 (roughly
  9 September 2026).

## Architecture

- **Counterparty federated server**: maintains the parsed state,
  answers queries.
- **counterparty-core** — the reference implementation (Python
  server plus a Rust indexer, `counterparty-rs`). Current release is
  **v11.3.0** (16 August 2026).
- **counterparty-client** — interact with the network.
- **Counterwallet** — historical web wallet (still functional).

## Asset model

- Numerical asset names (anyone-can-issue) and named assets (0.5 XCP
  fee, owner-controlled).
- Subassets (`MAIN.SUB`) supported, free to register since mainnet
  block 866,000.
- Asset transfers, issuances, callbacks via Counterparty txs.

## Use cases (current, niche)

- **Rare Pepe collection trading**.
- **Legacy XCP-based games**.
- **Historical preservation** — early-NFT history runs through
  Counterparty.

## Compared to Ordinals

| Aspect | Counterparty | Ordinals |
|--------|--------------|----------|
| Year | 2014 | 2023 |
| Storage | OP_RETURN, Taproot envelope (v11.0.0+) | Inscriptions in witness |
| Token spec | Native | BRC-20 (overlay) |
| Active use | Niche | Very active |
| New issuance | Rare | Constant |

## See also

- [../metaprotocols/ordinals/SKILL.md](../../metaprotocols/ordinals/SKILL.md)
- [stacks/SKILL.md](../stacks/SKILL.md)
- [liquid/SKILL.md](../liquid/SKILL.md)
