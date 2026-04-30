---
name: bitcoin-metaprotocols-ordinals
description: |
  Ordinal theory: numbering scheme for individual satoshis (sat ordinals).
  ord client, sat-tracking, rare sat collecting, foundation for
  inscriptions / BRC-20 / sub-protocols.
  USE WHEN: working with ord client, tracking sats, building Ordinals
  apps.
allowed-tools: Read, Grep, Glob
---

# Ordinal Theory

Casey Rodarmor's scheme (2022) for numbering individual satoshis. Each
of Bitcoin's ~2.1 quadrillion sats has a unique number based on
mining order, allowing them to be tracked through transactions.

## Numbering scheme

Sats numbered 0, 1, 2, ... based on:
- Mining order (block + position).
- First-in-first-out (FIFO) through inputs/outputs.

When a tx has inputs `[A1, A2]` and outputs `[B1, B2]`:
- Sats from `A1` flow to `B1` first, then overflow to `B2`.
- Within `A1`, sats are ordered by their original numbers.

## Sat rarity classes

Casey defined a fan-following hierarchy:
- **Common**: any sat.
- **Uncommon**: first sat of each block.
- **Rare**: first sat of each difficulty epoch (every 2016 blocks).
- **Epic**: first sat of each halving (every 210k blocks).
- **Legendary**: first sat of each cycle (every 6 halvings, ~24 years).
- **Mythic**: sat #0 (the first sat ever; in Satoshi's coinbase).

Some collectors pay premium for rare sats.

## ord client

Reference implementation:
- `github.com/ordinals/ord` (Rust).
- Indexes the entire chain to compute sat ordinals.
- Provides:
  - Wallet for sending specific sats (avoid spending rare ones).
  - Inscription creation/viewing.
  - REST API for querying.

Heavy index: full ord index ~1+ TB on a recent chain.

## Indexed services

- **ordinals.com** — primary explorer.
- **mempool.space** integration for ordinal viewing.
- **OrdiScan, Ordinalsbot** — third-party services.

## Use cases

- **Sat collecting** — buying / selling rare sats.
- **Foundation** for inscriptions, BRC-20, Runes, etc.
- **Provenance tracking** — proving a sat originated from a specific
  block.

## Compared to UTXO

Ordinals are an **interpretation** layer; Bitcoin consensus has **no
notion of ordinal numbering**. The ord client computes ordinals by
parsing the chain. Different ord clients **must** agree on the
numbering scheme.

## Common confusions

- "Ordinals" = sat numbering. **Inscriptions** = data attached to
  sats. They're different concepts often conflated.
- ord client requires **txindex** + ord-specific indexing.
- "Mythic sat" is just one specific sat (sat #0); not a category of
  thousands.

## See also

- [inscriptions/SKILL.md](../inscriptions/SKILL.md)
- [brc-20/SKILL.md](../brc-20/SKILL.md)
- [runes/SKILL.md](../runes/SKILL.md)
- [atomicals/SKILL.md](../atomicals/SKILL.md)
