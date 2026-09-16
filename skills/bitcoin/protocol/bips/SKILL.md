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

Canonical: `https://github.com/bitcoin/bips`. As of September 2026 the
process is governed by BIP 3, and each BIP's status is exactly one of
four values:

- **Draft** — opened as a PR, still being worked on.
- **Complete** — authors concluded all planned work and recommend adoption.
- **Deployed** — a Complete BIP that has settled and is in active use.
- **Closed** — historical interest only; not worked on, promoted or in use.

The BIP 2 vocabulary (Proposed / Final / Active / Replaced / Withdrawn)
was retired in January 2026 and the repo no longer emits it. Header fields
are now `Layer` (Consensus (soft fork) | Consensus (hard fork) | Peer
Services | API/RPC | Applications), `Type` (Specification | Informational
| Process) and `Assigned` (the old `Created` field).

Publication is not endorsement: the repo states that a published BIP "is
in scope and has met other formal criteria for this repository, but does
not indicate that it is a good idea, has community consensus, or that it
is about to be adopted".

## Process

- **BIP 1, 2** — the original BIP process. BIP 2 is **Closed**, replaced
  by BIP 3.
- **BIP 3** — "Updated BIP Process" (Murch; assigned 2025-01-09, activated
  in the repo January 2026 via PR #1820, merged 2026-01-14; status
  **Deployed** as of September 2026). Streamlines BIP 2, reduces BIP
  Editor judgment calls, and defines the four-status model above.
- **BIP 123** — BIP layer classification (referenced by BIP 3).

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
- **BIP 156** — "Dandelion - Privacy Enhancing Routing": stem/fluff
  relay that hides a transaction's origin. **Closed** as of September
  2026 and never implemented in Bitcoin Core — no Dandelion code at
  v31.1 (July 2026). Cite it as design history, not pending work.
- **BIP 157** — Compact block filter client.
- **BIP 158** — Compact block filter format.
- **BIP 331** — Ancestor package relay. Still **Draft** as of September
  2026; its wire messages (`sendpackages`, `ancpkginfo`, `pkgtxns`) are
  not in Bitcoin Core 31.1 (July 2026). What ships is mempool-side
  package evaluation: the `submitpackage` RPC and opportunistic 1p1c
  orphan resolution.
- **BIP 339** — wtxid relay.
- **BIP 431** — TRUC (v3) transactions.

## Network / P2P

- **BIP 31** — pong message.
- **BIP 35** — mempool message.
- **BIP 37** — Connection bloom filtering (deprecated).
- **BIP 130** — sendheaders.
- **BIP 155** — addrv2 (Tor v3, I2P, CJDNS).
- **BIP 324** — Version-2 P2P transport encryption.
- **BIP 330** — Erlay / transaction announcement reconciliation. Still
  **Draft** as of September 2026; no reconciliation round trip ships up
  to and including Bitcoin Core 31.1 (July 2026). Only the `sendtxrcncl`
  signaling half is merged (PR #23443, October 2022), behind the hidden
  debug-only `-txreconciliation` flag
  (`DEFAULT_TXRECONCILIATION_ENABLE{false}` in `src/net_processing.h` at
  v31.1). Full implementation PR #35591 (opened June 2026) is open and
  titled `[DO NOT MERGE]`; umbrella tracking issue #30249.

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

Statuses below are as carried by the BIPs `README.mediawiki` index in
September 2026.

- **BIP 53** — "Disallow 64-byte transactions" (Chris Stewart). **Draft**.
- **BIP 54** — "Consensus Cleanup" (Poinsot, Corallo). **Complete** —
  i.e. the authors recommend adoption; it is not activated on mainnet.
- **BIP 110** — "Reduced Data Temporary Softfork" (Dathon Ohm, assigned
  2025-12-03). Consensus caps on arbitrary data, deployed on bit 4 with a
  55% threshold and a mandatory-signaling window starting at block
  961,632 (2026-08-08). Signaling stayed far below threshold, enforcing
  nodes split onto a chain that stalled, and the BIPs repo moved it to
  **Closed** on 2026-08-10. Cite it as a failed activation, not a rule.
- **BIP 118** — `SIGHASH_ANYPREVOUT` / `ANYPREVOUTANYSCRIPT`. **Draft**.
- **BIP 119** — `OP_CHECKTEMPLATEVERIFY` (CTV). **Draft**.
- **BIP 300/301** — Hashrate Escrows / Blind Merged Mining
  (Drivechains). Both **Draft**.
- **BIP 345** — `OP_VAULT`, `OP_VAULT_RECOVER`. **Closed**, and its
  header carries `Proposed-Replacement: 443`. Cite it as design history,
  not as a live proposal; BIP 443 (`OP_CHECKCONTRACTVERIFY`) is the
  successor.
- **BIP 347** — `OP_CAT` in Tapscript (Heilman, Sabouri). **Complete**,
  likewise not activated.
- **BIP 360** — Pay-to-Merkle-Root (P2MR), a post-quantum output type
  (Beast, Heilman, Foxen Duke). **Draft**.
- **BIP 361** — "Post Quantum Migration and Legacy Signature Sunset"
  (Lopp et al.), Informational. **Draft**.

The 2026 script / covenant cluster, all **Draft** as of September 2026
and none deployed:

- **BIP 440** — Varops Budget For Script Runtime Constraint (Russell, Moik).
- **BIP 441** — Restoration of disabled script, Tapleaf 0xC2 (Russell, Moik).
- **BIP 442** — `OP_PAIRCOMMIT` (moonsettler, Brandon Black).
- **BIP 443** — `OP_CHECKCONTRACTVERIFY` (Salvatore Ingala); the
  proposed replacement for BIP 345.
- **BIP 446** — `OP_TEMPLATEHASH` (Sanders, Poinsot, Roose).
- **BIP 448** — Taproot-native (Re)bindable Transactions (Sanders,
  Poinsot, Roose).
- **BIP 449** — `OP_TWEAKADD`, x-only key tweak addition (Jeremy Rubin).

## Reading order for newcomers

1. BIP 32 → 39 → 84 → 174 (foundations of any wallet).
2. BIP 141/143/144 (SegWit).
3. BIP 340/341/342 (Taproot).
4. BIP 380–385 (descriptors).
5. BIP 327 (MuSig2) and BIP 322 (message signing).

## Lookups

- Repo: `github.com/bitcoin/bips`.
- Master index file: `README.mediawiki` lists all BIPs with status.
- Some BIPs are **Closed** (withdrawn, replaced or abandoned); check the
  status field before citing. Under BIP 3 a Closed BIP carries no
  implication that it was ever deployed — see BIP 110 above.

## See also

- [consensus/SKILL.md](../consensus/SKILL.md)
- [proposals/SKILL.md](../proposals/SKILL.md)
- [psbt/SKILL.md](../psbt/SKILL.md)
- [descriptors/SKILL.md](../descriptors/SKILL.md)
