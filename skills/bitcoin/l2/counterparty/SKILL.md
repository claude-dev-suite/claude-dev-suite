---
name: bitcoin-l2-counterparty
description: |
  Counterparty: legacy Bitcoin meta-protocol (2014) for assets, DEX,
  betting using OP_RETURN. Largely historic; still alive with niche use.
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

- All Counterparty data is embedded in `OP_RETURN` outputs of
  Bitcoin txs.
- A separate Counterparty parser reads Bitcoin blockchain, extracts
  Counterparty events, maintains state.
- Native token: **XCP** (used for issuance fees, betting).
- Asset issuance: lock 1 XCP to issue named tokens.

## Major past events

- **Rare Pepes** (2016-2017): NFT-precursor on Counterparty (long
  before Ordinals).
- **SaruTobi** (mobile game with XCP economy).
- **PEPECASH** and other community tokens.

## Status

- Network is still operational.
- Activity is **dramatically lower** than 2014-2017 peak.
- Most users have migrated to Ethereum / Stacks for new asset
  issuance.
- Ordinals + Runes effectively replaced Counterparty for new "Bitcoin
  native asset" use cases (with much higher activity).

## Why mostly historic

- Pre-SegWit / Pre-Taproot — fees on `OP_RETURN`-only txs are not
  competitive.
- No DEX innovation since 2017.
- No major dev-team activity (occasional patch releases).
- Newer protocols (Stacks, Liquid, Taproot Assets, RGB) provide
  better UX + more functionality.

## Architecture

- **Counterparty federated server**: maintains the parsed state,
  answers queries.
- **counterparty-cli** — interact with the network.
- **Counterwallet** — historical web wallet (still functional).

## Asset model

- Numerical asset names (anyone-can-issue) and named assets (1 XCP
  fee, owner-controlled).
- Subassets (`MAIN.SUB`) supported.
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
| Storage | OP_RETURN | Inscriptions in witness |
| Token spec | Native | BRC-20 (overlay) |
| Active use | Niche | Very active |
| New issuance | Rare | Constant |

## See also

- [../metaprotocols/ordinals/SKILL.md](../../metaprotocols/ordinals/SKILL.md)
- [stacks/SKILL.md](../stacks/SKILL.md)
- [liquid/SKILL.md](../liquid/SKILL.md)
