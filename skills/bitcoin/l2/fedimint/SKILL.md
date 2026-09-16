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
malicious gateway loses bond. The gateway's payment paths are a real
failure surface, not just a theoretical one: v0.12.1 / v0.11.3
(12 September 2026) were a gateway security release fixing an LNv1
payment-handling bug plus hardening of LNv2, LND and LDK payment
paths. Track gateway releases separately from guardian releases.

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
| Maturity | Beta production; 0.x line, v0.12.1 (Sept 2026) | Beta production (NUTs spec evolving) |
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

## Release status (as of September 2026)

Current stable is **v0.12.1**, released 12 September 2026. Prior
releases on the 0.12 line: v0.12.0 "Second Nature" (27 August 2026).
The 0.11 maintenance line is at v0.11.3 (12 September 2026).

What v0.12.0 changed for operators:

- **v2 modules are the default** for newly set-up federations
  (`lnv2`, `mintv2`, `walletv2`); the v1 module set is labelled
  "legacy" in the setup UI. Existing federations keep their
  configured modules.
- **Iroh 1.0** for guardian P2P and the client API; new production
  federations default to the iroh stack. The iroh upgrade is not
  wire-compatible with earlier releases, so guardians of iroh
  federations must upgrade in a coordinated window.
- **Guardian configs are no longer encrypted at rest.** The guardian
  password is now purely an admin API/UI credential, so filesystem
  access to the config directory must be restricted.
- Upgrade paths tested in CI: v0.11.2 → v0.12.0 and v0.10.1 →
  v0.12.0. Do **not** upgrade through v0.11.0 or v0.11.1.

## Security notes (as of September 2026)

- **Gateway operators must run v0.12.1 or v0.11.3** (both 12
  September 2026). These fix a bug in the Lightning gateway's LNv1
  payment handling and add hardening across the gateway's payment
  paths, including the LNv2 module and the LND and LDK backends.
  Technical details were withheld at release time under coordinated
  disclosure. Drop-in upgrade: no protocol, consensus, API or
  database format change, and federation guardians and wallet users
  are unaffected. Gateways on 0.10 or older must move to a supported
  release.
- **Federations should run v0.11.2 or later** (13 August 2026).
  v0.11.2/v0.10.1 carried a coordinated set of server, Lightning,
  wallet, backup and DKG hardening fixes, re-shipped in v0.12.0.
- Since v0.12.0 the LNv1/LNv2 preimage-retrieval endpoints are
  gateway-authenticated rather than public.

## Earlier notes (not re-verified)

- Fedi multi-sig guardian creation simplified via G-bot UI.
- Stealth-to-scale milestone: federations expanding from <10 to
  hundreds of communities. (Fedi project messaging; not re-verified
  against a primary source during the September 2026 audit.)

## See also

- [cashu/SKILL.md](../cashu/SKILL.md)
- [../../lightning/lsp/SKILL.md](../../lightning/lsp/SKILL.md)
- [../../cryptography/frost/SKILL.md](../../cryptography/frost/SKILL.md)
