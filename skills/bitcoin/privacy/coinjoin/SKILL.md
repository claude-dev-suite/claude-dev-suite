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

### Whirlpool (Samourai, relaunched by Ashigaru)

- **Coordinator-mediated** ZeroLink. Samourai shut down 2024 (US
  indictment April 2024); the founders were sentenced in November
  2025 — see
  [Legal outcome](#legal-outcome-samourai-november-2025).
- Used 5x equal-output structure.
- **Not** dead: the Ashigaru Open Source Project (anonymous Samourai
  fork) relaunched a ZeroLink coordinator on 23 June 2025, together
  with Ashigaru Terminal v1.0.0, a Sparrow-derived desktop client
  for Linux/macOS/Windows. Tor-only, no clearnet.
- Ashigaru pools as of mid-2026: 0.025 BTC and 0.25 BTC, each with
  a 5% anti-Sybil fee charged on the Tx0 entry transaction (max 20
  premix UTXOs per Tx0); remixes are free and unlimited.

### JoinMarket

- **Maker/taker** model:
  - Makers offer liquidity passively, earn small fees.
  - Takers initiate CoinJoins, pay makers.
- No central coordinator — IRC + onion services.
- Slower / smaller anonymity sets but censorship-resistant.
- Two wire-compatible implementations share one order book as of
  September 2026: the reference `joinmarket-clientserver` (archived
  27 Apr 2026, final release v0.9.12) and `joinmarket-ng`, which is
  the actively developed one. Target NG for new work.

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

## Status (September 2026)

- **Wasabi Wallet 2.x**: operational. zkSNACKs discontinued the
  default coordinator on 1 June 2024; the same-day v2.0.8 release
  added coordinator selection in the GUI and moved the repo from
  the zkSNACKs org to `WalletWasabi/WalletWasabi`. Stock Wasabi now
  ships with **no** default coordinator — the user pastes one in.
  Latest release v2.8.3 (14 Sep 2026).
- **Whirlpool**: relaunched by Ashigaru on 23 June 2025 (new
  ZeroLink coordinator + Terminal v1.0.0). Tor-only; both pools
  reported still operating as of mid-2026. ashigaru.rs has posted
  nothing since June 2025, so that is the freshest operational
  check, not a September 2026 one.
- **JoinMarket**: niche but operational. Reference implementation
  `JoinMarket-Org/joinmarket-clientserver` archived 27 Apr 2026
  (read-only; final release v0.9.12, 21 Apr 2026), and its release
  notes point readers at `joinmarket-ng/joinmarket-ng` as the
  codebase under active development (0.39.2, 10 Sep 2026). NG is
  wire-compatible, so the maker/taker market is not split. The Jam
  web UI is still maintained (v2.0.0-beta.3, 24 Aug 2026).
- **Joinstr** (Nostr-based CoinJoin coordination): experimental
  (status last checked late 2025).

## Legal outcome (Samourai, November 2025)

The April 2024 Samourai indictment is no longer an open case. Both
founders were convicted of conspiring to operate an unlicensed
money transmitting business and sentenced in the SDNY:

- **Keonne Rodriguez** (CEO): 5 years, sentenced 6 Nov 2025.
- **William L. Hill** (CTO): 4 years, sentenced 19 Nov 2025.
- Each also got 3 years supervised release and a $250,000 fine.
- Forfeiture ordered: $237,832,360.55; $6,367,139.69 paid, that
  figure being the fees Samourai itself earned.

Design consequence: the count of conviction was unlicensed money
transmission, not custody or theft. Treat "we never hold user
keys" as **not** a defence when scoping a coordinator, and get
jurisdiction-specific legal advice before operating one.

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
