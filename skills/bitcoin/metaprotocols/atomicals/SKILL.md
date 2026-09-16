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

Less mainstream than Ordinals/Runes, and markedly quieter since
2025 — see **Status** below before treating it as a live ecosystem.

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

Development was genuinely active through early 2025; what follows is
where things stand as of September 2026.

- **Reference stack dormant.** `atomicals/atomicals-electrumx` has had
  no commits since 27 March 2025 and its newest release is **v1.5.2.0**
  (27 March 2025). `atomicals/atomicals-js` last pushed the same day,
  `atomicals/avm-interpreter` on 22 September 2024. None of the three
  is archived, so read this as dormancy, not abandonment.
- **Atomicals Market closed 30 April 2026.** The main dedicated
  ARC-20/Atomicals marketplace shut down; its own farewell page
  (atomicalmarket.com) states that listings and bids auto-expire, that
  assets remain on Bitcoin and need no action, and that the frontend
  repository is being archived.
- **Docs still maintained, by third parties.** The Bitcoin Universe
  Atomicals/ARC-20 documentation platform ships version 2026.08 (pages
  last verified 31 August 2026) and pins atomicals-electrumx v1.5.2.0
  as its protocol authority.
- Smaller TVL/volume than Ordinals/Runes ecosystem.
- **AVM proposal still experimental.** The interpreter is a pinned beta
  revision; no service is known to execute AVM contracts, and the
  maintained third-party docs state that no Universe service does, as of
  September 2026.

## Use cases

- **Realm names** — `+atomical-name` style.
- **Containers** — collections of atomicals.
- **ARC-20 tokens** with sat-level precision.

## See also

- [ordinals/SKILL.md](../ordinals/SKILL.md)
- [runes/SKILL.md](../runes/SKILL.md)
- [brc-20/SKILL.md](../brc-20/SKILL.md)
