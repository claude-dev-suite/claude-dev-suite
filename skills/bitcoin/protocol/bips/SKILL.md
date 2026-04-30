---
name: bitcoin-bips
description: |
  Bitcoin Improvement Proposals index, organized by topic. Active soft
  forks, wallet standards, network protocol, format standards. Pointers
  to canonical text and historical context.
  USE WHEN: looking up a BIP number, citing a standard, or understanding
  the relationship between related BIPs.
allowed-tools: Read, Grep, Glob
---

# BIP Index (topic-organized)

Canonical: `https://github.com/bitcoin/bips`. Each BIP's status:
**Draft** → **Proposed** → **Final** / **Active** / **Replaced** /
**Withdrawn**.

## Process

- **BIP 1, 2** — BIP process itself.

## HD wallets and key derivation

- **BIP 32** — Hierarchical Deterministic Wallets.
- **BIP 39** — Mnemonic seed phrase.
- **BIP 43** — Purpose field convention.
- **BIP 44** — Multi-account hierarchy (legacy P2PKH).
- **BIP 49** — Derivation for P2SH-P2WPKH (`m/49'/0'/0'`).
- **BIP 84** — Derivation for native P2WPKH (`m/84'/0'/0'`).
- **BIP 86** — Derivation for P2TR (`m/86'/0'/0'`).
- **BIP 85** — Deterministic entropy from BIP32 (sub-seeds).

## Output and address formats

- **BIP 13** — P2SH addresses (`3...`).
- **BIP 16** — P2SH consensus rule.
- **BIP 141, 143, 144, 145, 147** — SegWit family.
- **BIP 173** — Bech32 (segwit v0).
- **BIP 350** — Bech32m (segwit v1+).
- **BIP 380–385** — Output descriptor language.
- **BIP 389** — Multipath descriptors.

## Taproot

- **BIP 340** — Schnorr signatures.
- **BIP 341** — Taproot output / key-path / script-path / merkle.
- **BIP 342** — Tapscript validation rules.

## PSBT

- **BIP 174** — PSBT v0.
- **BIP 370** — PSBT v2.
- **BIP 371** — Taproot fields in PSBT.

## Time locks and sequence

- **BIP 65** — `OP_CHECKLOCKTIMEVERIFY`.
- **BIP 68** — Relative locktime via nSequence.
- **BIP 112** — `OP_CHECKSEQUENCEVERIFY`.
- **BIP 113** — MTP for nLockTime.

## Mempool / replacement

- **BIP 125** — opt-in RBF.
- **BIP 152** — Compact block relay.
- **BIP 156** — Dandelion++.
- **BIP 157** — Compact block filter client.
- **BIP 158** — Compact block filter format.
- **BIP 331** — Package relay.
- **BIP 339** — wtxid relay.
- **BIP 431** — TRUC (v3) transactions.

## Network / P2P

- **BIP 31** — pong message.
- **BIP 35** — mempool message.
- **BIP 37** — Connection bloom filtering (deprecated).
- **BIP 130** — sendheaders.
- **BIP 155** — addrv2 (Tor v3, I2P, CJDNS).
- **BIP 324** — Version-2 P2P transport encryption.
- **BIP 330** — Erlay (proposed).

## Soft fork activation

- **BIP 8** — versionbits with lockinontimeout.
- **BIP 9** — versionbits.
- **BIP 34** — Block v2 (height in coinbase).
- **BIP 90** — Buried activation heights.

## Wallet UX standards

- **BIP 21** — URI scheme `bitcoin:address?amount=...&label=...`.
- **BIP 47** — Reusable Payment Codes (PayNyms).
- **BIP 78** — PayJoin.
- **BIP 137** — Generic message signing.
- **BIP 322** — Generic signed message format (modern).
- **BIP 329** — Wallet labels portability.
- **BIP 352** — Silent Payments.

## Multi-party signatures

- **BIP 327** — MuSig2 (Schnorr key aggregation).

## Hardware wallets

- **BIP 174 / 370 / 371** — PSBT (also covers HW signing).
- **BIP 388** — Wallet policies for HWs (Ledger, etc.).

## Proposals (not active on mainnet)

- **BIP 119** — `OP_CHECKTEMPLATEVERIFY` (CTV).
- **BIP 118** — `SIGHASH_ANYPREVOUT` / `ANYPREVOUTANYSCRIPT`.
- **BIP 300/301** — Hashrate Escrows / Drivechains.
- **BIP 345** — `OP_VAULT`, `OP_VAULT_RECOVER`.

## Reading order for newcomers

1. BIP 32 → 39 → 84 → 174 (foundations of any wallet).
2. BIP 141/143/144 (SegWit).
3. BIP 340/341/342 (Taproot).
4. BIP 380–385 (descriptors).
5. BIP 327 (MuSig2) and BIP 322 (message signing).

## Lookups

- Repo: `github.com/bitcoin/bips`.
- Master index file: `README.mediawiki` lists all BIPs with status.
- Some BIPs are withdrawn or replaced; check status before citing.

## See also

- [consensus/SKILL.md](../consensus/SKILL.md)
- [proposals/SKILL.md](../proposals/SKILL.md)
- [psbt/SKILL.md](../psbt/SKILL.md)
- [descriptors/SKILL.md](../descriptors/SKILL.md)
