---
name: bitcoin-l2-ark
description: |
  Ark protocol: VTXOs (Virtual Transaction Outputs) batched off-chain
  with periodic on-chain settlement. ARKADE (Ark Labs) is the first
  mainnet implementation. ASP (Ark Service Provider) coordinates
  rounds; users keep unilateral exit.
  USE WHEN: building Ark integrations, evaluating Ark vs Lightning,
  designing batched payment flows.
allowed-tools: Read, Grep, Glob
---

# Ark Protocol

Original concept: Burak (2023, posted to bitcoin-dev as `TBDXXX`).
Mainnet implementation: **ARKADE** (Ark Labs, public beta launched
2025-2026). Reference impl `bark` (Second).

Ark virtualizes Bitcoin's UTXO layer into VTXOs (Virtual Transaction
Outputs) that are batched and settled periodically on chain.

## Mechanism

### Round-based architecture

- An **ASP** (Ark Service Provider) runs periodic rounds (e.g., every
  few minutes / hours).
- During each round, users send/receive funds via VTXOs.
- At round end, ASP commits the round state on chain via a single
  pool tx.
- Each user's VTXO is included in the pool tx as part of a Merkle/
  binary tree structure.

### VTXOs

A VTXO is a "virtual" output:
- Represented as a leaf in the round's tree.
- Spendable off-chain by sending it to another VTXO via ASP-mediated
  protocol.
- Has a CSV expiry: after the expiry, owner can unilaterally claim
  on chain via the round's commitment tx.

### Unilateral exit

Even if ASP disappears:
- User can broadcast a chain of pre-signed txs to extract their
  VTXO from the round tree.
- Cost: linear in tree depth (typically log N).
- Time: limited by CSV expiry (typically days to weeks).

## ARKADE features

Ark Labs' mainnet implementation:
- VTXO batches via taproot trees.
- Round time: ~5 seconds.
- ASP-coordinated cosigning protocol.
- Native BTC support; **Arkade Assets** for tokenized assets.
- V-PACK: stateless VTXO verification standard.

## Bark (Second's impl)

Open source (MIT), in beta on signet/testnet:
- Wallet client for Ark.
- ASP server reference.
- Compatibility with ARKADE protocol.

## Compared to Lightning

| Aspect | Lightning | Ark |
|--------|-----------|-----|
| Liquidity setup | Channel funding | None per user |
| Receiver inbound | Need pre-existing channel | None needed |
| Aggregator | n/a (peer-to-peer) | ASP (1 per round) |
| Settlement | Off-chain instant | Round-based (seconds to hours) |
| Exit cost | Channel close (~1 tx + per-HTLC) | Tree extraction (~log N txs) |
| Protocol type | Per-channel | Batched |
| Asset support | Optional (TAP, RGB layered) | Native (Arkade Assets) |

## Use cases

- **Receive without channel** — user gets their first sats without
  pre-funded inbound.
- **High-frequency micro-payments** within rounds (no per-payment
  fee).
- **Mobile-first** — round-based, no need for always-online wallet.
- **Asset issuance** via Arkade Assets.

## Status (late 2025)

- ARKADE mainnet in public beta.
- bark on signet.
- Ecosystem of wallets, services emerging.
- Active competing model with Spark, Lightning.

## Limitations / trade-offs

- **Round delay**: payments confirmed within round time, not instant.
- **ASP availability**: ASP outage = unilateral-exit window.
- **Tree depth scaling**: log N exit cost; balanced trees keep
  this acceptable.
- **Privacy**: ASP sees all VTXO transfers in plaintext (compared
  to LN's onion routing).

## See also

- [spark/SKILL.md](../spark/SKILL.md)
- [statechains/SKILL.md](../statechains/SKILL.md)
- [taproot-assets/SKILL.md](../taproot-assets/SKILL.md)
- [../../protocol/proposals/SKILL.md](../../protocol/proposals/SKILL.md)
