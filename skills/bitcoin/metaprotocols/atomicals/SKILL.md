---
name: bitcoin-metaprotocols-atomicals
description: |
  Atomicals protocol: alternative metaprotocol family with ARC-20
  (fungible) and AVM (Atomicals VM) for richer logic. UTXO-bound
  digital objects.
  USE WHEN: working with Atomicals, comparing with Ordinals / Runes.
allowed-tools: Read, Grep, Glob
---

# Atomicals Protocol

A metaprotocol on Bitcoin focused on **digital object** abstractions.
Includes:
- **ARC-20** — fungible tokens.
- **NFTs** with stronger metadata.
- **AVM (Atomicals VM)** — programmability layer.

Less mainstream than Ordinals/Runes, but with active community.

## Concept

Each Atomical is a **digital object** with:
- Unique atomical ID.
- Type (NFT, FT, container, etc.).
- Associated UTXO carrying ownership.
- Metadata committed via inscription-like envelope.

## ARC-20

Fungible token variant:
- Each "1 ATOMICAL" of an ARC-20 = 1 satoshi.
- Tokens move 1:1 with sats.
- Strict UTXO accounting (no off-chain indexer needed for balances —
  it's the actual sat count).

This is different from BRC-20/Runes where token amounts are
arbitrary.

## AVM (Atomicals VM)

Proposed VM for richer logic on Atomicals:
- Stack-based.
- Can validate spending conditions beyond Bitcoin script.
- Used for "minting rules", "container constraints".

## Compared to other metaprotocols

| Aspect | Atomicals | Ordinals | Runes |
|--------|-----------|----------|-------|
| Object model | Object-oriented | Sat-bound | UTXO-bound |
| Fungible mechanism | ARC-20 (1:1 with sats) | BRC-20 (off-chain) | Native protocol |
| Programmability | AVM proposed | Recursive inscriptions | Protocol rules |
| Adoption | Niche | Massive | Large |

## Status

- Active community development.
- Smaller TVL/volume than Ordinals/Runes ecosystem.
- AVM proposal experimental.

## Use cases

- **Realm names** — `+atomical-name` style.
- **Containers** — collections of atomicals.
- **ARC-20 tokens** with sat-level precision.

## See also

- [ordinals/SKILL.md](../ordinals/SKILL.md)
- [runes/SKILL.md](../runes/SKILL.md)
- [brc-20/SKILL.md](../brc-20/SKILL.md)
