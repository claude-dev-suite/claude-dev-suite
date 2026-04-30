---
name: bitcoin-privacy-coinjoin
description: |
  CoinJoin: collaborative tx where multiple users combine inputs to
  break common-input-ownership heuristic. Wabisabi (Wasabi 2.0),
  Whirlpool (Samourai), JoinMarket maker/taker.
  USE WHEN: implementing CoinJoin coordinator/client, evaluating
  privacy gain, designing post-CoinJoin hygiene.
allowed-tools: Read, Grep, Glob
---

# CoinJoin

A CoinJoin combines inputs from multiple users into a single tx
with multiple equal-amount outputs to defeat the **common-input-
ownership heuristic** that chain analysts use.

## Heuristic broken

Pre-CoinJoin: chain analysts assume "all inputs of a tx belong to
the same wallet". This is true for most txs.

CoinJoin breaks this: 10 users, each contributing 1 input, 10 outputs
of equal size. Analyst can't link any specific input to any
specific output.

## Major implementations

### Wabisabi (Wasabi Wallet 2.0)

- **Coordinator-mediated** with credential-based blinding.
- Users register inputs with the coordinator privately (blind sig).
- Anonymity within the round; coordinator can't link inputs to
  outputs.
- Wasabi 2.0 uses **WabiSabi** protocol — successor to ZeroLink.
- Default round: ~50 participants; output amounts in tiered
  denominations.

### Whirlpool (Samourai Wallet, RIP)

- **Coordinator-mediated** but Samourai shut down 2024 (legal
  action).
- Used 5x equal-output structure.
- Still technically possible but ecosystem is gone.

### JoinMarket

- **Maker/taker** model:
  - Makers offer liquidity passively, earn small fees.
  - Takers initiate CoinJoins, pay makers.
- No central coordinator — IRC + onion services.
- Slower / smaller anonymity sets but censorship-resistant.

## Privacy properties

After CoinJoin, the linked inputs:
- Have equal anonymity-set among the participants.
- Subsequent tx that mixes them can re-cluster (if you spend two
  CoinJoined outputs together, observer infers same wallet).

**Crucial**: maintain post-CoinJoin hygiene:
- Don't combine CoinJoined outputs with non-CoinJoined ones.
- Don't reuse addresses.
- Don't immediately spend (timing analysis).

## CoinJoin types

### Equal-output ZeroLink/Wabisabi
All outputs are equal (or tiered by denomination). Best privacy.

### Variable-output PayJoin (BIP78)
Different mechanism — see [payjoin/SKILL.md](../payjoin/SKILL.md).

## Use cases

- **Privacy-conscious users** wanting on-chain anonymity.
- **Pre-emptive privacy** before storing or spending large amounts.
- **Pre-spend mixing** for high-profile addresses.

## Costs

- Per-round fee to coordinator: small percentage of input.
- On-chain tx fee: shared among participants.
- Time: multiple rounds for full anonymity (hours typical).

## Status (late 2025)

- **Wasabi Wallet 2.0** (zkSNACKs): operational; some legal pressure.
- **Whirlpool**: Samourai shutdown. Some forks attempting to revive.
- **JoinMarket**: niche but operational.
- **Joinstr** (Nostr-based CoinJoin coordination): experimental.

## Limitations

- **Coordinator availability**: Wasabi requires coordinator.
- **Anonymity set size**: small rounds = weak privacy.
- **Post-mix hygiene** required; users often re-link unintentionally.
- **Exchange refusals**: some exchanges (esp. KYC-heavy) refuse
  deposits from CoinJoin outputs.

## See also

- [payjoin/SKILL.md](../payjoin/SKILL.md)
- [silent-payments/SKILL.md](../silent-payments/SKILL.md)
- [bip47-paynyms/SKILL.md](../bip47-paynyms/SKILL.md)
- [../wallets/coin-selection/SKILL.md](../../wallets/coin-selection/SKILL.md)
