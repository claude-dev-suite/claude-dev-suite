---
name: bitcoin-proposals
description: |
  Soft-fork proposals NOT activated on mainnet: CTV (BIP119), APO/APOAS
  (BIP118), OP_VAULT (BIP345), OP_CAT reactivation, drivechains
  (BIP300/301), spacechains, CISA. Status, mechanics, controversy
  per proposal.
  USE WHEN: discussing covenants, evaluating L2 design that depends on
  unactivated opcodes, understanding the soft-fork pipeline.
allowed-tools: Read, Grep, Glob
---

# Bitcoin Soft-Fork Proposals

These are **not consensus-active on mainnet**. Some are deployed on
signet (custom signets) or testnet for experimentation. Be explicit
when reasoning: never present these as "Bitcoin" features without
naming the proposal status.

## Covenants in general

A covenant restricts how an output may be re-spent (where the funds
go, in what shape, with what conditions). Existing scripts can
restrict **who** spends; covenants restrict **how**.

Use cases:
- **Vaults** — cooldown period before final spend; recoverable from
  cold key.
- **Congestion control** — pre-commit to a tree of payments.
- **L2 protocols** — Ark, Spacechains, CoinPool depend on covenants.

## CTV — `OP_CHECKTEMPLATEVERIFY` (BIP119)

```
<TemplateHash> OP_CTV
```

Forces the tx to match a pre-committed template:
- Output set, amount, scriptPubKeys.
- Number of inputs (but NOT specific prevouts).
- Locktime, sequence values.

Template-hash is committed on-chain → spending tx must produce the
exact set of outputs.

**Status**: Proposed since 2020. Major debate around community split,
no activation path. Active on **signet** for testing (specifically
the "CTV signet").

**Use cases**: vaults, payment pools, congestion control, simple Ark
variants.

## SIGHASH_ANYPREVOUT — APO / APOAS (BIP118)

New SIGHASH flag. Sig commits to script + value but **not** to
specific prevout txid:vout.

```
APO     sighash         (commits to scriptPubKey, not txid)
APOAS   sighash variant (also doesn't commit to script — even more permissive)
```

Original use case: **Eltoo** — Lightning channel update protocol that
replaces commitment-tx penalty with simple state replacement.

**Status**: Proposed. No active deployment yet.

## OP_VAULT (BIP345)

Two-stage vault primitive:
- `OP_VAULT` output: spend to a "trigger" path (begins cooldown) or
  recover path (immediate, to cold key).
- After cooldown, spend the trigger to actual destination.

Provides **first-class vault** semantics without complex script
gymnastics. Works in P2TR script-path.

**Status**: Draft / proposed. Some signet experimentation.

## OP_CAT reactivation

Re-enable string concatenation in Tapscript. Disabled since 2010
genesis era (pulled due to DoS concerns, since obsoleted by stack-item
size limits).

Why people want it:
- **Verifiable computation** — constructs proofs/scripts via concatenation.
- **Quantum-resistant signature** schemes (Lamport / Winternitz one-time).
- **BitVM2** — simplified bridge construction.
- **Recursive covenants** with limited branching.

**Status**: Proposed re-enabling in Tapscript only. No BIP number yet.

## Drivechains — BIP300 / BIP301

Sidechains pegged with miner-validated locks:
- BIP300 — hashrate escrow with deposit/withdraw tx types.
- BIP301 — blind merge mining.

Allows trustless-of-miner-majority sidechains. Critique: trusts miners
implicitly with all sidechain funds.

**Status**: Proposed. Not deployed on mainnet. **LayerTwo Labs** runs
testnet drivechain.

## Spacechains (Ruben Somsen)

Sidechain idea using `OP_CAT` + `OP_CHECKSIGFROMSTACK` (also proposed)
to enable arbitrary-script verification without explicit miner support.

**Status**: Concept. Not a formal BIP.

## Cross-Input Signature Aggregation (CISA)

Aggregate all signatures in a transaction into a single signature.
Massive witness savings (n inputs → 1 sig instead of n sigs). Active
research; not yet a deployable proposal.

## Status terminology

| Status | Meaning |
|--------|---------|
| **Draft** | BIP author drafted, not yet broadly reviewed |
| **Proposed** | Discussed, refined, awaiting deployment plan |
| **Replaced** | Superseded by another BIP |
| **Withdrawn** | Author withdrew |
| **Active** | Consensus rule on mainnet |
| **Final** | Specification frozen (e.g., BIP-32, format spec) |

For consensus changes, "Active" requires a successful soft-fork
deployment — never assume from "Proposed".

## Common pitfalls

- Reasoning about a protocol that **depends** on CTV/APO/OP_CAT as if
  those were already active. Always name the dependency explicitly.
- Citing drivechain TVL or activity → likely on a private testnet, not
  mainnet.
- Confusing **signet** activation (custom signet challenge that includes
  the proposed opcode) with mainnet activation.

## See also

- [consensus/SKILL.md](../consensus/SKILL.md)
- [../../l2/drivechains-spacechains/SKILL.md](../../l2/drivechains-spacechains/SKILL.md)
- [../../l2/ark/SKILL.md](../../l2/ark/SKILL.md)
- [../../l2/bitvm/SKILL.md](../../l2/bitvm/SKILL.md)
