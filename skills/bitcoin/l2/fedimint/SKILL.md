---
name: bitcoin-l2-fedimint
description: |
  Fedimint: federated Chaumian e-cash on Bitcoin with Lightning gateway.
  Multi-sig guardians, blind-signature notes, community-scale custody
  with privacy. Fedi mobile wallet.
  USE WHEN: deploying community mints, integrating federated e-cash,
  evaluating Fedimint vs Cashu.
allowed-tools: Read, Grep, Glob
---

# Fedimint

Open-source protocol for federated Chaumian e-cash mints integrated
with Lightning Network. Each "federation" of trusted **guardians**
(typically 3-15 entities) collectively manages funds.

Repos: `github.com/fedimint/fedimint` (Rust).

## Concept

- Users deposit BTC (via on-chain or Lightning) → receive Chaumian
  e-cash notes signed blindly by guardians.
- Notes are bearer instruments (whoever holds them owns them).
- Spending: present notes to mint, get new notes (preventing
  double-spend).
- Withdrawal: redeem notes for BTC (LN gateway / on-chain).

## Why federated

Single-mint Chaumian e-cash (e.g., Cashu) → trust one operator.
Fedimint distributes trust among guardians:
- ~67% (2-of-3, 4-of-5, etc.) threshold for any guardian action.
- Fewer than threshold cannot withdraw funds.

Use cases: communities, geographies, organizations (church, town,
DAO, etc.).

## Privacy via blind signatures

Mint signs notes **blindly** — guardians don't see what they're
signing or who is depositing. Privacy properties:
- Mint can't link deposits to withdrawals.
- Users have within-mint privacy.
- Cross-user payments via passing notes — no chain footprint.

## Lightning gateway

Each federation runs a **gateway**: a Lightning node that bridges
between Lightning and Fedimint:
- Pay LN invoice from Fedimint → gateway settles via LN.
- Receive on LN → gateway issues fresh notes to Fedimint user.

Gateway is **operationally** trusted but **economically** bonded —
malicious gateway loses bond.

## Fedi (mobile app)

- Mobile + web app for Fedimint federations.
- Native multi-mint support.
- Lightning + on-chain via federation gateway.
- Multi-sig guardian creation flow ("G-bot" assistant).

## Components

- **fedimintd** — guardian daemon.
- **fedimint-cli** — admin CLI.
- **fedimint-lnv2-client** — gateway integration.
- **Fedi mobile app**.

## Compared to Cashu

| Aspect | Fedimint | Cashu |
|--------|----------|-------|
| Custody | Federated multisig | Single mint operator |
| Trust | Threshold | Single |
| Setup complexity | Higher (require guardians) | Lower (run mint solo) |
| Maturity | Beta production | Beta production (NUTs spec evolving) |
| Mobile | Fedi app | Many wallets |

## Use cases

- **Community banking** in rural / underbanked areas.
- **Family / org wallet** with shared custody.
- **Privacy-first payments** without on-chain footprint.

## Limitations

- **Federation trust** — k-of-n collude → funds risk.
- **Mint requires operator** unlike fully decentralized chains.
- **Notes can be reused** if owner not careful (bearer instrument).
- **Backup is harder** — losing notes = losing funds (unlike seed
  recovery for HD wallet).

## Recent (2025-2026)

- Fedi multi-sig guardian creation simplified via G-bot UI.
- Stealth-to-scale milestone: federations expanding from <10 to
  hundreds of communities.

## See also

- [cashu/SKILL.md](../cashu/SKILL.md)
- [../../lightning/lsp/SKILL.md](../../lightning/lsp/SKILL.md)
- [../../cryptography/frost/SKILL.md](../../cryptography/frost/SKILL.md)
